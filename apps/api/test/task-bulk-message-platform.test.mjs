import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.resolve(here, relativePath), "utf8");

test("bulk task message updates validate dedicated template platform against every matched task", async () => {
  const source = await readSource("../src/task-admin/task-admin.service.ts");
  const method = source.slice(source.indexOf("async bulkUpdateMessageTemplate"), source.indexOf("async listTaskGroups"));
  assert.match(method, /templatePlatform\?: string/);
  assert.match(method, /where: \{ id: \{ in: taskIds \}[^}]*\},\s*select: \{ category: true \}/);
  assert.match(method, /Array\.from\(new Set\(matchedTasks\.map\(\(task\) => task\.category\)\)\)/);
  assert.match(method, /categories\.length !== 1 \|\| categories\[0\] !== templatePlatform/);
  assert.ok(method.indexOf("categories.length !== 1") < method.indexOf("prisma.task.updateMany"));
});

test("generic and manually entered message updates keep their existing no-platform-validation path", async () => {
  const source = await readSource("../src/task-admin/task-admin.service.ts");
  const method = source.slice(source.indexOf("async bulkUpdateMessageTemplate"), source.indexOf("async listTaskGroups"));
  assert.match(method, /if \(templatePlatform && templatePlatform !== "通用"\)/);
  assert.match(method, /data: \{ messageTemplate \}/);
  const controller = await readSource("../src/task-admin/task-admin.controller.ts");
  assert.match(controller, /templatePlatform\?: string/);
});

test("task group filter options use the complete task-groups endpoint rather than the 200-task sample", async () => {
  const source = await readSource("../../admin/src/app/tasks/page.tsx");
  assert.match(source, /const groupNames = Array\.from\(new Set\(taskGroups\.map\(\(group\) => group\.name\)/);
  assert.doesNotMatch(source, /const groupNames = Array\.from\(new Set\(tasks\.map\(\(task\) => task\.groupName\)/);
});

test("admin sends selected template platform to the server-side bulk safety check", async () => {
  const source = await readSource("../../admin/src/app/tasks/page.tsx");
  assert.match(source, /templatePlatform: messageTemplates\.find\(\(item\)=>item\.id===bulkTemplateId\)\?\.platform/);
});
