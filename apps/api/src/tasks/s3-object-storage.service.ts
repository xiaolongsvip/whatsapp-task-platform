import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { StorageConfigService } from "../storage-config/storage-config.service";

type StorageConfig = {
  endpoint: URL;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class S3ObjectStorageService {
  constructor(private readonly storageConfig: StorageConfigService) {}

  private async config(): Promise<StorageConfig> {
    const saved = await this.storageConfig.getRuntimeCredentials();

    if (saved) {
      let endpoint: URL;
      try {
        endpoint = new URL(saved.endpoint);
      } catch {
        throw new ServiceUnavailableException("后台对象存储 Endpoint 无效。");
      }

      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      ) {
        throw new ServiceUnavailableException(
          "后台对象存储 Endpoint 不符合 HTTPS 安全要求。",
        );
      }

      return {
        endpoint,
        bucket: saved.bucket,
        accessKey: saved.accessKey,
        secretKey: saved.secretKey,
        region: saved.region || "auto",
      };
    }

    const endpointValue = process.env.STORAGE_ENDPOINT?.trim();
    const bucket = process.env.STORAGE_BUCKET?.trim();
    const accessKey = process.env.STORAGE_ACCESS_KEY?.trim();
    const secretKey = process.env.STORAGE_SECRET_KEY?.trim();

    if (!endpointValue || !bucket || !accessKey || !secretKey) {
      throw new ServiceUnavailableException(
        "证据存储尚未配置。请在 API 环境中配置 STORAGE_ENDPOINT、STORAGE_BUCKET、STORAGE_ACCESS_KEY 和 STORAGE_SECRET_KEY。",
      );
    }

    let endpoint: URL;
    try {
      endpoint = new URL(endpointValue);
    } catch {
      throw new ServiceUnavailableException("STORAGE_ENDPOINT 不是有效的 URL。");
    }

    const localHttp =
      endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(endpoint.hostname);

    if (
      endpoint.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && localHttp)
    ) {
      throw new ServiceUnavailableException(
        "证据存储必须使用 HTTPS endpoint。",
      );
    }

    return {
      endpoint,
      bucket,
      accessKey,
      secretKey,
      region: process.env.STORAGE_REGION?.trim() || "auto",
    };
  }

  private createClient(config: StorageConfig): S3Client {
    return new S3Client({
      endpoint: config.endpoint.toString().replace(/\/+$/, ""),
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
      maxAttempts: 2,
    });
  }

  private async withClient<T>(
    operation: (client: S3Client, config: StorageConfig) => Promise<T>,
  ): Promise<T> {
    const config = await this.config();
    const client = this.createClient(config);

    try {
      return await operation(client, config);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const statusCode = (
        error as { $metadata?: { httpStatusCode?: number } } | undefined
      )?.$metadata?.httpStatusCode;

      if (statusCode) {
        throw new ServiceUnavailableException(
          `证据存储请求失败（HTTP ${statusCode}）。请检查桶名称、区域和访问密钥权限。`,
        );
      }

      throw new ServiceUnavailableException(
        "无法完成证据存储请求，请检查 R2/S3 endpoint、网络和访问密钥权限。",
      );
    } finally {
      client.destroy();
    }
  }

  async testConnection(): Promise<{ success: true; message: string }> {
    const probeKey = `task-evidence/.connection-test/${Date.now()}-${randomUUID()}.txt`;
    const payload = Buffer.from(
      "WTP object storage connection test",
      "utf8",
    );

    await this.putObject(probeKey, payload, "text/plain");

    try {
      await this.deleteObject(probeKey);
    } catch {
      throw new ServiceUnavailableException(
        "存储桶可以写入测试文件，但无法删除测试文件。请检查 DeleteObject 权限后清理该测试文件。",
      );
    }

    return {
      success: true,
      message: "对象存储连接成功，临时测试文件已删除。",
    };
  }

  async createPresignedPutUrl(
    key: string,
    expiresSeconds = 3600,
  ): Promise<string> {
    const expiresIn = Number.isFinite(expiresSeconds)
      ? Math.max(60, Math.min(3600, Math.trunc(expiresSeconds)))
      : 3600;

    return this.withClient(async (client, config) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
        { expiresIn },
      ),
    );
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.withClient(async (client, config) => {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    });
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    return this.withClient(async (client, config) => {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );

      if (!result.Body) {
        throw new ServiceUnavailableException(
          "证据存储未返回文件内容。",
        );
      }

      const body = result.Body as Readable;

      if (
        typeof result.ContentLength === "number" &&
        result.ContentLength > MAX_EVIDENCE_BYTES
      ) {
        body.destroy();
        throw new ServiceUnavailableException(
          "证据图片超过审核读取大小限制。",
        );
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      try {
        for await (const chunk of body) {
          const buffer = Buffer.from(chunk);
          totalBytes += buffer.length;

          if (totalBytes > MAX_EVIDENCE_BYTES) {
            body.destroy();
            throw new ServiceUnavailableException(
              "证据图片超过审核读取大小限制。",
            );
          }

          chunks.push(buffer);
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          throw error;
        }
        throw error;
      }

      return Buffer.concat(chunks, totalBytes);
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.withClient(async (client, config) => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );
    });
  }
}
