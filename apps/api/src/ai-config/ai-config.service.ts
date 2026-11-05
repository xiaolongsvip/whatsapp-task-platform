import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import OpenAI from "openai";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { prisma } from "@wtp/database";
import type { UpdateAiConfigDto } from "./ai-config.dto";

const CONFIG_ID = "default";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4.1";

type StoredConfig = {
  id: string;
  apiKeyCiphertext: string | null;
  apiKeyIv: string | null;
  apiKeyTag: string | null;
  baseUrl: string;
  model: string;
  enabled: boolean;
  approveThreshold: number;
  rejectThreshold: number;
  systemPrompt: string | null;
  updatedAt: Date;
};

function encryptionKey(): Buffer {
  const encoded = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!encoded) {
    throw new ServiceUnavailableException(
      "服务端尚未配置 AI_CONFIG_ENCRYPTION_KEY，暂不能保存或读取 AI 密钥。",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new ServiceUnavailableException(
      "AI_CONFIG_ENCRYPTION_KEY 必须是 Base64 编码的 32 字节密钥。",
    );
  }
  return key;
}

function encryptApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    apiKeyCiphertext: ciphertext.toString("base64"),
    apiKeyIv: iv.toString("base64"),
    apiKeyTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptApiKey(config: StoredConfig): string | null {
  if (!config.apiKeyCiphertext || !config.apiKeyIv || !config.apiKeyTag) {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(config.apiKeyIv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(config.apiKeyTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(config.apiKeyCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ServiceUnavailableException(
      "AI API 密钥无法解密，请检查服务端加密密钥是否与保存时一致。",
    );
  }
}

@Injectable()
export class AiConfigService {
  private async getOrCreate(): Promise<StoredConfig> {
    return prisma.aiReviewConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        baseUrl: DEFAULT_BASE_URL,
        model: DEFAULT_MODEL,
      },
      update: {},
    }) as Promise<StoredConfig>;
  }

  async getPublicConfig() {
    const config = await this.getOrCreate();
    return {
      baseUrl: config.baseUrl,
      model: config.model,
      enabled: config.enabled,
      approveThreshold: config.approveThreshold,
      rejectThreshold: config.rejectThreshold,
      systemPrompt: config.systemPrompt,
      hasApiKey: Boolean(config.apiKeyCiphertext),
      apiKeyMasked: config.apiKeyCiphertext ? "••••••••••••••••" : "",
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  async update(input: UpdateAiConfigDto, adminId: string) {
    if (input.clearApiKey && input.apiKey?.trim()) {
      throw new BadRequestException("不能同时设置新 API Key 和清除 API Key。");
    }
    const existing = await this.getOrCreate();
    const nextApproveThreshold = input.approveThreshold ?? existing.approveThreshold;
    const nextRejectThreshold = input.rejectThreshold ?? existing.rejectThreshold;
    if (nextApproveThreshold < nextRejectThreshold) {
      throw new BadRequestException("通过阈值不能低于拒绝阈值。");
    }

    const apiKey = input.apiKey?.trim();
    if (
      input.enabled === true &&
      !apiKey &&
      !input.clearApiKey &&
      !existing.apiKeyCiphertext
    ) {
      throw new BadRequestException("启用 AI 自动审核前，请先配置 API Key。");
    }
    if (input.enabled === true && input.clearApiKey) {
      throw new BadRequestException("清除 API Key 前，请先关闭 AI 自动审核。");
    }
    const encrypted = apiKey ? encryptApiKey(apiKey) : undefined;
    const clear = input.clearApiKey === true;

    const updated = await prisma.aiReviewConfig.update({
      where: { id: CONFIG_ID },
      data: {
        ...(encrypted ?? {}),
        ...(clear
          ? { apiKeyCiphertext: null, apiKeyIv: null, apiKeyTag: null }
          : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim().replace(/\/+$/, "") } : {}),
        ...(input.model !== undefined ? { model: input.model.trim() } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.approveThreshold !== undefined
          ? { approveThreshold: input.approveThreshold }
          : {}),
        ...(input.rejectThreshold !== undefined
          ? { rejectThreshold: input.rejectThreshold }
          : {}),
        ...(input.systemPrompt !== undefined
          ? { systemPrompt: input.systemPrompt?.trim() || null }
          : {}),
        updatedByAdminId: adminId,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorType: "ADMIN",
        actorId: adminId,
        action: "AI_REVIEW_CONFIG_UPDATED",
        targetType: "AI_REVIEW_CONFIG",
        targetId: CONFIG_ID,
        metadata: {
          apiKeyChanged: Boolean(encrypted) || clear,
          enabled: updated.enabled,
          model: updated.model,
          baseUrl: updated.baseUrl,
        },
      },
    });

    return this.getPublicConfig();
  }

  async getRuntimeConfig() {
    const config = await this.getOrCreate();
    return {
      enabled: config.enabled,
      apiKey: decryptApiKey(config),
      baseUrl: config.baseUrl,
      model: config.model,
      approveThreshold: config.approveThreshold,
      rejectThreshold: config.rejectThreshold,
      systemPrompt: config.systemPrompt,
    };
  }

  async testConnection() {
    const config = await this.getOrCreate();
    const apiKey = decryptApiKey(config);
    if (!apiKey) {
      throw new BadRequestException("请先保存 OpenAI API Key，再测试连接。");
    }

    try {
      const client = new OpenAI({
        apiKey,
        baseURL: config.baseUrl,
        timeout: 20_000,
        maxRetries: 0,
      });
      const response = await client.responses.create({
        model: config.model,
        input: "Reply with the single word OK.",
        max_output_tokens: 16,
      });
      return {
        success: true,
        model: config.model,
        responseId: response.id,
        message: "AI 服务连接成功。",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : "未知连接错误";
      throw new ServiceUnavailableException(`AI 服务连接失败：${message}`);
    }
  }
}
