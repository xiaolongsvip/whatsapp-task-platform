import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("task claim history API uses a bounded stable descending cursor", async () => {
  const service = await read("../src/tasks/tasks.service.ts");
  const body = service.slice(service.indexOf("async myClaims("), service.indexOf("async claimTask("));
  assert.match(body, /Math\.min\(100, Math\.max\(1, parsedLimit\)\)/);
  assert.match(body, /beforeClaimedAtInput/);
  assert.match(body, /beforeIdInput/);
  assert.match(body, /claimedAt: \{ lt: cursorClaimedAt \}/);
  assert.match(body, /claimedAt: cursorClaimedAt, id: \{ lt: cursorId \}/);
  assert.match(body, /orderBy: \[\{ claimedAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(body, /take: take \+ 1/);
  assert.match(body, /hasMore,/);
  assert.match(body, /nextCursor:/);
});

test("task claim history controller forwards pagination query parameters", async () => {
  const controller = await read("../src/tasks/tasks.controller.ts");
  const body = controller.slice(controller.indexOf('@Get("my/claims")'), controller.indexOf('@Post(":taskId/claims")'));
  assert.match(body, /@Query\("limit"\)/);
  assert.match(body, /@Query\("beforeClaimedAt"\)/);
  assert.match(body, /@Query\("beforeId"\)/);
  assert.match(body, /myClaims\(user\.id, limit, beforeClaimedAt, beforeId\)/);
});

test("Android repository and task records screen load and append subsequent pages", async () => {
  const repository = await read("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
  const screen = await read("../../../android/app/src/main/java/com/wtp/app/ui/TaskHallScreen.kt");
  assert.match(repository, /fun myTaskClaims\(limit: Int = 100, beforeClaimedAt: String\? = null, beforeId: String\? = null\)/);
  assert.match(repository, /tasks\/my\/claims\?\$query/);
  assert.match(screen, /AuthRepository\.myTaskClaims\(100, cursor\.first, cursor\.second\)/);
  assert.match(screen, /claims = claims \+ incoming\.filter/);
  assert.match(screen, /claimsHasMore/);
  assert.match(screen, /loadMoreClaims\(\)/);
});
