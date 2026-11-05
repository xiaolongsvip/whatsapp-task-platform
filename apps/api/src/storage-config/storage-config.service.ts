import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "@wtp/database";
import type { UpdateStorageConfigDto } from "./storage-config.dto";

const CONFIG_ID = "default";
type EncryptedValue = { ciphertext: string; iv: string; tag: string };

function key(): Buffer {
  const encoded = process.env.STORAGE_CONFIG_ENCRYPTION_KEY;
  if (!encoded) throw new ServiceUnavailableException("服务器尚未配置 STORAGE_CONFIG_ENCRYPTION_KEY。");
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32) throw new ServiceUnavailableException("STORAGE_CONFIG_ENCRYPTION_KEY 必须是 Base64 编码的 32 字节密钥。");
  return value;
}
function encrypt(value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function decrypt(ciphertext: string, iv: string, tag: string): string {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new ServiceUnavailableException("存储凭据无法解密，请确认服务器加密主密钥未发生变化。");
  }
}

@Injectable()
export class StorageConfigService {
  async getPublicConfig() {
    const row = await prisma.objectStorageConfig.findUnique({ where: { id: CONFIG_ID } });
    if (!row) return { configured: false, enabled: false, endpoint: "", bucket: "", region: "auto", accessKeyMasked: "", secretKeyMasked: "" };
    return {
      configured: true, enabled: row.enabled, endpoint: row.endpoint, bucket: row.bucket,
      region: row.region, accessKeyMasked: "••••••••", secretKeyMasked: "••••••••",
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(input: UpdateStorageConfigDto, adminId: string) {
    let endpoint: URL;
    try { endpoint = new URL(input.endpoint); } catch { throw new BadRequestException("Endpoint URL 无效。"); }
    const localHttp = endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && localHttp)) {
      throw new BadRequestException("对象存储 Endpoint 必须使用 HTTPS。");
    }
    const existing = await prisma.objectStorageConfig.findUnique({ where: { id: CONFIG_ID } });
    if (!existing && (!input.accessKey?.trim() || !input.secretKey?.trim())) {
      throw new BadRequestException("首次配置必须填写 Access Key 和 Secret Key。");
    }
    if (Boolean(input.accessKey?.trim()) !== Boolean(input.secretKey?.trim())) {
      throw new BadRequestException("Access Key 和 Secret Key 必须同时填写或同时留空。");
    }
    const access = input.accessKey?.trim() ? encrypt(input.accessKey.trim()) : null;
    const secret = input.secretKey?.trim() ? encrypt(input.secretKey.trim()) : null;
    const credentials = access && secret ? {
      accessKeyCiphertext: access.ciphertext, accessKeyIv: access.iv, accessKeyTag: access.tag,
      secretKeyCiphertext: secret.ciphertext, secretKeyIv: secret.iv, secretKeyTag: secret.tag,
    } : {};
    await prisma.objectStorageConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID, endpoint: input.endpoint.trim().replace(/\/+$/, ""), bucket: input.bucket.trim(),
        region: input.region?.trim() || "auto",
        ...credentials,
        enabled: input.enabled ?? false, updatedByAdminId: adminId,
      },
      update: {
        endpoint: input.endpoint.trim().replace(/\/+$/, ""), bucket: input.bucket.trim(),
        region: input.region?.trim() || "auto",
        ...credentials,
        enabled: input.enabled ?? false, updatedByAdminId: adminId,
      },
    });
    await prisma.auditEvent.create({
      data: { actorType: "ADMIN", actorId: adminId, action: "OBJECT_STORAGE_CONFIG_UPDATED",
        targetType: "OBJECT_STORAGE_CONFIG", targetId: CONFIG_ID,
        metadata: { endpoint: endpoint.origin, bucket: input.bucket.trim(), enabled: input.enabled ?? false } },
    });
    return this.getPublicConfig();
  }

  async getRuntimeCredentials() {
    const row = await prisma.objectStorageConfig.findUnique({ where: { id: CONFIG_ID } });
    if (!row || !row.enabled) return null;
    return {
      endpoint: row.endpoint, bucket: row.bucket, region: row.region,
      accessKey: decrypt(row.accessKeyCiphertext, row.accessKeyIv, row.accessKeyTag),
      secretKey: decrypt(row.secretKeyCiphertext, row.secretKeyIv, row.secretKeyTag),
    };
  }
}
