import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../src/ai-config/ai-review.worker.ts", import.meta.url), "utf8");

test("AI worker loads enabled review schemes and prefers exact platform over generic", () => {
  assert.match(worker, /taskConfiguration\.findUnique\(\{ where: \{ key: "reviews" \} \}\)/);
  assert.match(worker, /\(item as Record<string, unknown>\)\.enabled === true/);
  assert.match(worker, /enabledSchemes\.find\(\(item\) => item\.platform === claim\.task\.category\)/);
  assert.match(worker, /enabledSchemes\.find\(\(item\) => item\.platform === "通用"\)/);
  assert.ok(worker.indexOf('item.platform === claim.task.category') < worker.indexOf('item.platform === "通用"'));
});

test("selected review scheme instructions are included without replacing task requirements or global prompt", () => {
  assert.match(worker, /当前平台审核方案/);
  assert.match(worker, /schemeInstructions/);
  assert.match(worker, /config\.systemPrompt \|\| ""/);
  assert.match(worker, /任务标题：\$\{claim\.task\.title\}/);
  assert.match(worker, /任务消息模板：\$\{claim\.task\.messageTemplate/);
});

test("reference image is only passed when it is a valid HTTPS URL, alongside submitted evidence", () => {
  assert.match(worker, /url\.protocol === "https:"/);
  assert.match(worker, /type: "input_image" as const, image_url: referenceImageUrl/);
  assert.match(worker, /type: "input_image", image_url: imageUrl, detail: "high"/);
});

test("automatic approve, reject, confidence gates, and unsuccessful inventory recycling remain active", () => {
  assert.match(worker, /parsed\.decision === "APPROVE"/);
  assert.match(worker, /parsed\.decision === "REJECT"/);
  assert.match(worker, /parsed\.confidence >= config\.approveThreshold/);
  assert.match(worker, /parsed\.confidence >= config\.rejectThreshold/);
  assert.match(worker, /await this\.approve\(job\.id, parsed\)/);
  assert.match(worker, /await this\.reject\(job\.id, parsed\)/);
  assert.match(worker, /recycleUnsuccessfulTaskClaimInventory/);
});
