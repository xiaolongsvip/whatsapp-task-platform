import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("device registration serializes single-account policy checks with the device upsert", async () => {
  const helper = await readSource("../src/users/device-identifier-lock.ts");
  const source = await readSource("../src/users/device.service.ts");
  assert.match(helper, /pg_advisory_xact_lock\(hashtextextended\(\$\{deviceIdentifier\}, 0\)\)/);
  assert.match(helper, /IS NULL AS locked/);

  const report = source.slice(source.indexOf("async report("));
  const lock = report.indexOf("lockUserDeviceIdentifier(tx, deviceIdentifier)");
  const transaction = report.indexOf("prisma.$transaction");
  const blockedCheck = report.indexOf("const blockedDevice");
  const accountCheck = report.indexOf("const linkedToAnotherAccount");
  const upsert = report.indexOf("tx.userDevice.upsert");
  const event = report.indexOf("tx.userDeviceEvent.create");
  assert.ok(transaction >= 0 && lock > transaction);
  assert.ok(lock < blockedCheck && blockedCheck < accountCheck);
  assert.ok(accountCheck < upsert && upsert < event);
  assert.match(report, /singleDeviceSingleAccount === true/);
});

test("administrator device block and member registration share the same identifier lock", async () => {
  const helper = await readSource("../src/users/device-identifier-lock.ts");
  const service = await readSource("../src/admin-users/admin-users.service.ts");
  const method = service.slice(service.indexOf("async updateDevice("), service.indexOf("\n  async ", service.indexOf("async updateDevice(") + 10));
  const lock = method.indexOf("lockUserDeviceIdentifier(tx, selected.deviceIdentifier)");
  assert.match(service, /import \{ lockUserDeviceIdentifier \} from "\.\.\/users\/device-identifier-lock"/);
  assert.ok(lock >= 0);
  assert.ok(lock < method.indexOf("tx.userDevice.findMany"));
  assert.ok(lock < method.indexOf("tx.userDevice.updateMany"));
  assert.ok(lock < method.indexOf("tx.authSession.updateMany"));
  assert.match(method, /tx\.userDeviceEvent\.createMany/);
  assert.match(method, /tx\.auditEvent\.create/);
  assert.match(helper, /pg_advisory_xact_lock/);
});
