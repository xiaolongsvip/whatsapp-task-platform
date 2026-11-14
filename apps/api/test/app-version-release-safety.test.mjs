import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("version draft, APK upload and publish/revoke operations serialize on the settings row", async () => {
  const service = await read("../src/system-settings/system-settings.service.ts");
  const lock = service.slice(service.indexOf("private async lockAppVersionConfig("), service.indexOf("private async persistAppVersion("));
  assert.match(lock, /taskConfiguration\.upsert/);
  assert.match(lock, /FROM task_configurations WHERE key = 'system\.appVersion' FOR UPDATE/);

  for (const [start, end] of [
    ["async saveVersion(", "async registerApkUpload("],
    ["async registerApkUpload(", "async versionAction("],
    ["async versionAction(", "async recordHelpAssetUpload("],
  ]) {
    const method = service.slice(service.indexOf(start), service.indexOf(end, service.indexOf(start) + start.length));
    assert.match(method, /prisma\.\$transaction/);
    assert.match(method, /this\.lockAppVersionConfig\(tx\)/);
    assert.match(method, /this\.persistAppVersion\(tx/);
    assert.match(method, /this\.auditAppVersion\(tx/);
  }
});

test("APK upload requires a saved draft newer than the currently published version", async () => {
  const service = await read("../src/system-settings/system-settings.service.ts");
  const upload = service.slice(service.indexOf("async registerApkUpload("), service.indexOf("async versionAction("));
  assert.match(upload, /item\.status === "DRAFT"/);
  assert.match(upload, /Number\(item\.versionCode\) === code/);
  assert.match(upload, /code <= liveVersionCode/);
  assert.match(upload, /status: "VERIFIED"/);
  assert.match(upload, /releases\[draftIndex\] = release/);
  assert.doesNotMatch(upload, /releases\.filter\(\(x: any\) => Number\(x\.versionCode\) !== code\)/);
});

test("failed APK registration removes the uploaded object instead of leaving an orphan", async () => {
  const controller = await read("../src/system-settings/system-settings.controller.ts");
  const upload = controller.slice(controller.indexOf('@Post("version/upload")'), controller.indexOf('@Post("version/:versionCode/publish")'));
  assert.match(upload, /await this\.objectStorage\.putObject/);
  assert.match(upload, /try \{/);
  assert.match(upload, /this\.settings\.registerApkUpload/);
  assert.match(upload, /catch \(error\)/);
  assert.match(upload, /this\.objectStorage\.deleteObject\(key\)/);
  assert.match(upload, /throw error/);
});

test("publish and revoke require valid state transitions and audit in the same transaction", async () => {
  const service = await read("../src/system-settings/system-settings.service.ts");
  const action = service.slice(service.indexOf("async versionAction("), service.indexOf("async recordHelpAssetUpload("));
  assert.match(action, /release\.status !== "VERIFIED"/);
  assert.match(action, /release\.status !== "PUBLISHED"/);
  assert.match(action, /Number\(release\.versionCode\) <= liveVersionCode/);
  assert.match(action, /APP_VERSION_" \+ action/);
  assert.match(action, /this\.auditAppVersion\(tx/);
});
