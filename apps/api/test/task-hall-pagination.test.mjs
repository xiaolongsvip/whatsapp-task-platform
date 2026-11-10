import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("task hall API uses a bounded stable cursor and returns continuation metadata", async () => {
  const service = await read("../src/tasks/tasks.service.ts");
  const body = service.slice(service.indexOf("async listPublished("), service.indexOf("async myClaims("));
  assert.match(body, /Math\.min\(100, Math\.max\(1, parsedLimit\)\)/);
  assert.match(body, /beforeCreatedAtInput/);
  assert.match(body, /beforeIdInput/);
  assert.match(body, /createdAt: \{ gt: cursorCreatedAt \}/);
  assert.match(body, /id: \{ gt: cursorId \}/);
  assert.match(body, /orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(body, /take: take \+ 1/);
  assert.match(body, /hasMore,/);
  assert.match(body, /nextCursor:/);
});

test("task hall controller forwards cursor query parameters to the service", async () => {
  const controller = await read("../src/tasks/tasks.controller.ts");
  const body = controller.slice(controller.indexOf("async list("), controller.indexOf("@Get(\"my/claims\")"));
  assert.match(body, /@Query\("limit"\)/);
  assert.match(body, /@Query\("beforeCreatedAt"\)/);
  assert.match(body, /@Query\("beforeId"\)/);
  assert.match(body, /listPublished\(user\.id, limit, beforeCreatedAt, beforeId\)/);
});

test("Android repository and task hall load subsequent pages without replacing loaded tasks", async () => {
  const repository = await read("../../../android/app/src/main/java/com/wtp/app/data/AuthRepository.kt");
  const screen = await read("../../../android/app/src/main/java/com/wtp/app/ui/TaskHallScreen.kt");
  assert.match(repository, /fun publishedTasks\(limit: Int = 100, beforeCreatedAt: String\? = null, beforeId: String\? = null\)/);
  assert.match(repository, /tasks\?\$query/);
  assert.match(screen, /AuthRepository\.publishedTasks\(100, cursor\.first, cursor\.second\)/);
  assert.match(screen, /tasks = tasks \+ incoming\.filter/);
  assert.match(screen, /taskHasMore/);
  assert.match(screen, /loadMoreTasks\(\)/);
});
