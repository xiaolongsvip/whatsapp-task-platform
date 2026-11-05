import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";

type StorageConfig = {
  endpoint: URL;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

@Injectable()
export class S3ObjectStorageService {
  private config(): StorageConfig {
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

    const localHttp = endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && localHttp)) {
      throw new ServiceUnavailableException("证据存储必须使用 HTTPS endpoint。");
    }

    return {
      endpoint,
      bucket,
      accessKey,
      secretKey,
      region: process.env.STORAGE_REGION?.trim() || "auto",
    };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.send("PUT", key, body, contentType);
  }

  async deleteObject(key: string): Promise<void> {
    await this.send("DELETE", key);
  }

  private async send(
    method: "PUT" | "DELETE",
    key: string,
    body = Buffer.alloc(0),
    contentType?: string,
  ): Promise<void> {
    const config = this.config();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body);

    const endpointPrefix = config.endpoint.pathname.replace(/\/+$/, "");
    const encodedKey = key.split("/").map(awsEncode).join("/");
    const canonicalUri = `${endpointPrefix}/${awsEncode(config.bucket)}/${encodedKey}`;
    const url = new URL(config.endpoint.toString());
    url.pathname = canonicalUri;

    const host = config.endpoint.host;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const canonicalRequest =
      `${method}\n${canonicalUri}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;

    const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;

    const dateKey = hmac(Buffer.from(`AWS4${config.secretKey}`, "utf8"), dateStamp);
    const regionKey = hmac(dateKey, config.region);
    const serviceKey = hmac(regionKey, "s3");
    const signingKey = hmac(serviceKey, "aws4_request");
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign, "utf8")
      .digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    };
    if (contentType) headers["Content-Type"] = contentType;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: method === "PUT" ? new Uint8Array(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ServiceUnavailableException("无法连接证据存储服务，请检查 R2/S3 endpoint 和网络。");
    }

    if (!response.ok) {
      // Do not return storage response bodies because they may contain
      // provider-specific diagnostic details or account information.
      throw new ServiceUnavailableException(
        `证据存储请求失败（HTTP ${response.status}）。请检查桶名称、区域和访问密钥权限。`,
      );
    }
  }
}
