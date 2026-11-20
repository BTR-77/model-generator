// Every feature's main path, with the generation service configured (a
// fake Gateway answers its calls), ending on a finished model.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { configuredGateway, CONCEPT_PNGS, dataUri, ringGlb } from "./fixtures.mjs";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const runtime = await startRuntime(configuredGateway());
const dir = await mkdtemp(path.join(tmpdir(), "model-generator-"));
const pngPath = path.join(dir, "fox.png");
await writeFile(pngPath, CONCEPT_PNGS[1]);
const textPath = path.join(dir, "notes.txt");
await writeFile(textPath, "not an image");
const glbPath = path.join(dir, "ring.glb");
await writeFile(glbPath, ringGlb());

const status = (page) => page.getByTestId("job-status");

try {
  await runtime.assertPrivateAccess(["/", "/create"]);
  const page = await (await runtime.context("member")).newPage();

  // F001: an empty prompt is refused.
  await page.goto("/create");
  await expect(page.getByTestId("not-configured")).toHaveCount(0);
  await page.getByTestId("start-text").click();
  await expect(page.getByTestId("form-error")).toContainText("Describe");
  await expect(page).toHaveURL(/\/create/);

  // F001: prompt, style and concept count; concepts come back; run again; pick one.
  const prompt = "A glazed strawberry donut with rainbow sprinkles";
  await page.getByTestId("prompt").fill(prompt);
  await page.getByTestId("style-cartoon").click();
  await page.getByTestId("count-4").click();
  await page.getByTestId("start-text").click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(status(page)).toHaveText("Concepts ready");
  await expect(page.getByTestId("concept")).toHaveCount(4);
  await expect(page.getByTestId("job-prompt")).toHaveText(prompt);
  const firstSrc = await page.getByTestId("concept").first().locator("img").getAttribute("src");
  await page.getByTestId("regenerate").click();
  await expect(page.getByTestId("concept").first().locator("img")).not.toHaveAttribute("src", firstSrc);
  await expect(status(page)).toHaveText("Concepts ready");
  await expect(page.getByTestId("concept")).toHaveCount(4);
  const conceptSrc = await page.getByTestId("concept").nth(1).locator("img").getAttribute("src");
  expect((await runtime.fetch(conceptSrc, { role: "member" })).status).toBe(200);
  expect((await runtime.fetch(conceptSrc, { role: "owner" })).status).toBe(404);
  await page.getByTestId("concept").nth(1).click();
  await page.getByTestId("pick-concept").click();
  await expect(status(page)).toHaveText("Succeeded");
  await page.getByTestId("open-model").click();
  await expect(page).toHaveURL(/\/models\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(prompt);
  await expect(page.getByTestId("model-prompt")).toHaveText(prompt);
  const textModelUrl = page.url();

  // F004: the viewer and its controls, and the three downloads.
  await expect(page.getByTestId("viewer")).toHaveAttribute("data-state", "ready");
  await page.getByTestId("wireframe").click();
  await expect(page.getByTestId("wireframe")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("auto-rotate").click();
  await expect(page.getByTestId("auto-rotate")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("reset-view").click();
  const glbHref = await page.getByTestId("download-glb").getAttribute("href");
  const glb = await runtime.fetch(glbHref, { role: "member" });
  expect(glb.status).toBe(200);
  expect(glb.headers.get("content-disposition")).toContain("attachment");
  expect(Buffer.from(await glb.arrayBuffer()).subarray(0, 4).toString("ascii")).toBe("glTF");
  for (const [id, ext] of [["download-obj", ".obj"], ["download-stl", ".stl"]]) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(id).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\${ext}$`));
  }

  // F002: wrong type refused; an image becomes a model, with the image kept.
  await page.goto("/create?tab=image");
  await page.getByTestId("image-file").setInputFiles(textPath);
  await page.getByTestId("start-image").click();
  await expect(page.getByTestId("form-error")).toContainText("PNG, JPG or WEBP");
  await page.getByTestId("image-file").setInputFiles(pngPath);
  await page.getByTestId("image-name").fill("Chocolate ring cake");
  await page.getByTestId("start-image").click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(status(page)).toHaveText("Succeeded");
  await page.getByTestId("open-model").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chocolate ring cake");
  await expect(page.getByTestId("source-image")).toBeVisible();
  const imgSrc = await page.getByTestId("source-image").getAttribute("src");
  expect((await runtime.fetch(imgSrc, { role: "member" })).status).toBe(200);

  // F005: a failed job shows its reason and retries with the same inputs.
  await page.goto("/create");
  await page.getByTestId("prompt").fill("A melted pocket watch");
  await page.getByTestId("start-text").click();
  await expect(status(page)).toHaveText("Failed");
  await expect(page.getByTestId("job-error")).toContainText("ran out of memory");
  await page.goto("/");
  await expect(page.getByTestId("task-row").filter({ hasText: "A melted pocket watch" })).toContainText("Failed");
  await page.getByTestId("task-row").filter({ hasText: "A melted pocket watch" }).getByTestId("open-task").click();
  await page.getByTestId("retry").click();
  await expect(status(page)).toHaveText("Concepts ready");
  await expect(page.getByTestId("job-prompt")).toHaveText("A melted pocket watch");

  // F005: three running jobs at most; the state updates without a reload.
  for (const n of [1, 2, 3]) {
    await page.goto("/create");
    await page.getByTestId("prompt").fill(`Wooden toy boat ${n}, on hold`);
    await page.getByTestId("start-text").click();
    await expect(status(page)).toHaveText("Queued");
  }
  const heldUrl = page.url();
  await page.goto("/create");
  await page.getByTestId("prompt").fill("A fourth teapot");
  await page.getByTestId("start-text").click();
  await expect(page.getByTestId("form-error")).toContainText("3 jobs running");
  await page.goto(heldUrl);
  await expect(status(page)).toHaveText("Queued");
  const db = await runtime.database();
  const held = await db.prepare("SELECT hook_token, prediction_id FROM jobs WHERE prompt = ?").bind("Wooden toy boat 3, on hold").first();
  const hook = await runtime.fetch(`/hooks/replicate/${held.hook_token}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: held.prediction_id, status: "succeeded", output: [dataUri("image/png", CONCEPT_PNGS[2])] }),
  });
  expect(hook.status).toBe(200);
  await expect(status(page)).toHaveText("Concepts ready", { timeout: 15000 });
  await expect(page.getByTestId("concept")).toHaveCount(1);

  // F003: import a .glb; search, filter, sort, paginate; rename; share.
  await page.goto("/");
  await page.getByTestId("import").click();
  await page.getByTestId("import-file").setInputFiles(glbPath);
  await page.getByTestId("import-name").fill("Brass door knocker");
  await page.getByTestId("import-submit").click();
  await expect(page).toHaveURL(/\/models\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brass door knocker");
  await page.goto("/");
  await expect(page.getByTestId("model-row")).toHaveCount(3);
  await expect(page.getByTestId("model-row").filter({ hasText: "Brass door knocker" })).toContainText("Import");
  await page.getByTestId("search").fill("rainbow");
  await expect(page.getByTestId("model-row")).toHaveCount(1);
  await expect(page.getByTestId("model-row")).toContainText(prompt);
  await page.getByTestId("search").fill("");
  await page.getByTestId("filter-image").click();
  await expect(page.getByTestId("model-row")).toHaveCount(1);
  await expect(page.getByTestId("model-row")).toContainText("Chocolate ring cake");
  await page.getByTestId("filter-all").click();
  await page.getByTestId("sort").click();
  await page.getByRole("option", { name: "Name" }).click();
  await expect(page.getByTestId("model-row").first()).toContainText("A glazed strawberry donut");
  const memberId = (await db.prepare("SELECT id FROM users WHERE email = ?").bind("member@example.test").first()).id;
  const seeded = Array.from({ length: 10 }, (_, i) => db.prepare(
    "INSERT INTO models (id, owner_id, name, prompt, style, source, glb_key, image_key, size_bytes, shared, created_at) VALUES (?, ?, ?, NULL, NULL, 'import', ?, NULL, 10, 0, ?)",
  ).bind(crypto.randomUUID(), memberId, `Archive piece ${i + 1}`, `seed/${i}.glb`, `2026-01-0${(i % 9) + 1}T10:00:00.000Z`));
  await db.batch(seeded);
  await page.goto("/");
  await expect(page.getByTestId("model-row")).toHaveCount(12);
  await expect(page.getByTestId("page-info")).toHaveText("Page 1 of 2");
  await page.getByTestId("next-page").click();
  await expect(page.getByTestId("page-info")).toHaveText("Page 2 of 2");
  await expect(page.getByTestId("model-row")).toHaveCount(1);

  await page.goto(textModelUrl);
  await page.getByTestId("rename").click();
  await page.getByTestId("rename-input").fill("Strawberry donut");
  await page.getByTestId("rename-save").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Strawberry donut");
  await page.getByTestId("share-toggle").click();
  await expect(page.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  const owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/?tab=shared");
  const sharedRow = owner.getByTestId("model-row").filter({ hasText: "Strawberry donut" });
  await expect(sharedRow).toContainText("member@example.test");

  // F003: delete with confirmation removes the files.
  await page.goto("/");
  await page.getByTestId("model-row").filter({ hasText: "Brass door knocker" }).getByRole("link").first().click();
  const importedGlb = await page.getByTestId("download-glb").getAttribute("href");
  await page.getByTestId("delete").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(page.getByTestId("model-row").filter({ hasText: "Brass door knocker" })).toHaveCount(0);
  expect((await runtime.fetch(importedGlb, { role: "member" })).status).toBe(404);

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(phone.getByTestId("model-row").first()).toBeVisible();

  // The primary workflow, ending on the finished model.
  await page.goto("/create");
  await page.getByTestId("prompt").fill("A ceramic coffee mug shaped like a ring donut, pastel pink glaze");
  await page.getByTestId("style-realistic").click();
  await page.getByTestId("count-3").click();
  await page.getByTestId("start-text").click();
  await expect(page.getByTestId("concept")).toHaveCount(3);
  await page.getByTestId("concept").first().click();
  await page.getByTestId("pick-concept").click();
  await expect(status(page)).toHaveText("Succeeded");
  await page.getByTestId("open-model").click();
  await expect(page.getByTestId("viewer")).toHaveAttribute("data-state", "ready");
  await runtime.assertBackLink(page);
  await runtime.screenshot(page);
} finally {
  await runtime.close();
}
