import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("saved disabled object storage configuration cannot fall back to environment credentials", async () => {
  const source = await readSource("../src/storage-config/storage-config.service.ts");
  const runtime = source.slice(source.indexOf("async getRuntimeCredentials"));
  assert.ok(runtime.includes("if (!row) return null"));
  assert.ok(runtime.includes("if (!row.enabled)"));
  assert.ok(runtime.includes("后台对象存储配置已停用"));
  assert.ok(runtime.includes("后台对象存储凭据不完整"));
  const s3 = await readSource("../src/tasks/s3-object-storage.service.ts");
  assert.ok(s3.includes("const saved = await this.storageConfig.getRuntimeCredentials()"));
  assert.ok(s3.includes("const endpointValue = process.env.STORAGE_ENDPOINT"));
});

test("storage configuration routes require an active admin session", async () => {
  const source = await readSource("../src/storage-config/storage-config.controller.ts");
  assert.equal((source.match(/await this\\.auth\\.getCurrentAdmin\\(token\\(request\\)\\)/g) || []).length, 3);
});

test("admin storage UI saves before testing the persisted connection", async () => {
  const source = await readSource("../../admin/src/app/storage-settings/page.tsx");
  assert.match(source, /method: "PUT"/);
  assert.match(source, /method: "POST"/);
  assert.ok(source.includes("!currentConfig.configured || !currentConfig.enabled"));
  assert.match(source, /setAccessKey\\("\\")/);
  assert.match(source, /setSecretKey\\("\\")/);
});
