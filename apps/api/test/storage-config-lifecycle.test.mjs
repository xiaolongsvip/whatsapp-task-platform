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
  assert.match(runtime, /if \\(!row\\) return null/);
  assert.match(runtime, /if \\(!row\\.enabled\\)\\s*\\{[\\s\\S]*?throw new ServiceUnavailableException/);
  assert.match(runtime, /if \\(!row\\.accessKeyCiphertext[\\s\\S]*?throw new ServiceUnavailableException/);
  const s3 = await readSource("../src/tasks/s3-object-storage.service.ts");
  assert.match(s3, /const saved = await this\\.storageConfig\\.getRuntimeCredentials\\(\\);[\\s\\S]*?if \\(saved\\)/);
  assert.match(s3, /const endpointValue = process\\.env\\.STORAGE_ENDPOINT/);
});

test("storage configuration routes require an active admin session", async () => {
  const source = await readSource("../src/storage-config/storage-config.controller.ts");
  assert.equal((source.match(/await this\\.auth\\.getCurrentAdmin\\(token\\(request\\)\\)/g) || []).length, 3);
});

test("admin storage UI saves before testing the persisted connection", async () => {
  const source = await readSource("../../admin/src/app/storage-settings/page.tsx");
  assert.match(source, /method: "PUT"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /!currentConfig\\.configured \\|\\| !currentConfig\\.enabled/);
  assert.match(source, /setAccessKey\\("\\")/);
  assert.match(source, /setSecretKey\\("\\")/);
});
