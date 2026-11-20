import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(
  new URL("../src/admin-auth/admin-auth.service.ts", import.meta.url),
  "utf8",
);
const dto = readFileSync(
  new URL("../src/admin-auth/admin-auth.dto.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../admin/src/app/page.tsx", import.meta.url),
  "utf8",
);

test("admin bootstrap accepts only the fixed admin/admin credentials", () => {
  assert.match(
    service,
    /emailInput\.trim\(\)\.toLowerCase\(\)\s*!==\s*"admin"\s*\|\|\s*password\s*!==\s*"admin"/,
  );
  assert.match(service, /首次管理员账号和密码必须为 admin/);
});

test("admin bootstrap still requires the configured bootstrap token", () => {
  assert.match(service, /process\.env\.ADMIN_BOOTSTRAP_TOKEN/);
  assert.match(service, /timingSafeEqual\(supplied,\s*expected\)/);
  assert.match(dto, /bootstrapToken/);
  assert.match(dto, /@Length\(16,\s*256\)/);
});

test("admin bootstrap remains one-time and concurrency protected", () => {
  assert.match(service, /pg_try_advisory_xact_lock\(9137,\s*2401\)/);
  assert.match(service, /tx\.adminUser\.count\(\)/);
  assert.match(service, /if \(count > 0\)/);
  assert.match(service, /管理员已经初始化，首次开通入口已关闭/);
});

test("admin bootstrap stores the fixed login and hashes its password", () => {
  assert.match(service, /argon2\.hash\(password,\s*\{\s*type:\s*argon2\.argon2id\s*\}\)/);
  assert.match(service, /login:\s*email/);
  assert.match(service, /passwordHash/);
});

test("admin bootstrap UI accepts the admin username and one-character password", () => {
  assert.match(page, /id="admin-email" type="text"/);
  assert.match(page, /id="admin-password"[\s\S]*?minLength=\{1\}/);
});

test("first admin bootstrap initializes super-admin permissions before dashboard refresh", () => {
  const submitAuth = page.slice(
    page.indexOf("async function submitAuth"),
    page.indexOf("function onFileChange"),
  );
  const permissionInit = submitAuth.indexOf(
    'await api("/api/v1/admin/permissions/catalog")',
  );
  const dashboardRefresh = submitAuth.indexOf("await refresh()");

  assert.notEqual(permissionInit, -1);
  assert.notEqual(dashboardRefresh, -1);
  assert.ok(permissionInit < dashboardRefresh);
  assert.match(submitAuth, /if \(mode === "bootstrap"\)/);
});
