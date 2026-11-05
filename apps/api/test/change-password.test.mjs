import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("password change endpoint is authenticated and throttled", async () => {
  const controller = await readSource("../src/users/users.controller.ts");
  assert.match(controller, /@Throttle\(\{ default: \{ limit: 5, ttl: 60_000 \} \}\)[\s\S]*?@Patch\("me\/password"\)/);
  assert.match(controller, /this\.auth\.changePassword\(sessionToken\(request\), body\.currentPassword, body\.newPassword\)/);
});

test("password change validates old password, hashes new password, and revokes other sessions", async () => {
  const service = await readSource("../src/auth/auth.service.ts");
  const start = service.indexOf("async changePassword(");
  const end = service.indexOf("async updateProfile(", start);
  assert.ok(start >= 0 && end > start, "changePassword service method must exist");
  const body = service.slice(start, end);
  assert.match(body, /argon2\.verify\(user\.passwordHash, currentPassword\)/);
  assert.match(body, /argon2\.hash\(newPassword, \{ type: argon2\.argon2id \}\)/);
  assert.match(body, /refreshTokenHash: \{ not: currentTokenHash \}/);
  assert.match(body, /prisma\.\$transaction\(/);
});

test("password change DTO enforces password length limits", async () => {
  const dto = await readSource("../src/users/change-password.dto.ts");
  assert.match(dto, /currentPassword[\s\S]*?@MinLength\(6\)[\s\S]*?@MaxLength\(128\)/);
  assert.match(dto, /newPassword[\s\S]*?@MinLength\(8\)[\s\S]*?@MaxLength\(128\)/);
});

test("Android repository calls the password change endpoint", async () => {
  const repository = await readSource("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
  assert.match(repository, /request\("PATCH", "users\/me\/password"/);
  assert.match(repository, /put\("currentPassword", currentPassword\)/);
  assert.match(repository, /put\("newPassword", newPassword\)/);
});

test("Android password screen submits to the repository", async () => {
  const screen = await readSource("../../../android/app/src/main/java/com/wtp/app/ui/TaskPlatformApp.kt");
  assert.match(screen, /AuthRepository\.changePassword\(current, newPassword\)/);
  assert.doesNotMatch(screen, /Password change service is not connected yet|密码修改接口尚未接入/);
});
