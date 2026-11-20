// What a member saves outlives a restart: the model's record and its file.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { ringGlb } from "./fixtures.mjs";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const runtime = await startRuntime();
const dir = await mkdtemp(path.join(tmpdir(), "model-generator-"));
const glbPath = path.join(dir, "ring.glb");
const bytes = ringGlb();
await writeFile(glbPath, bytes);
try {
  let page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("empty-library")).toBeVisible();
  await page.getByTestId("import").click();
  await page.getByTestId("import-file").setInputFiles(glbPath);
  await page.getByTestId("import-name").fill("Garden gnome");
  await page.getByTestId("import-submit").click();
  await expect(page).toHaveURL(/\/models\//);
  await page.getByTestId("share-toggle").click();
  await expect(page.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  const url = new URL(page.url()).pathname;
  const glb = await page.getByTestId("download-glb").getAttribute("href");

  await runtime.restart();

  page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("model-row").filter({ hasText: "Garden gnome" })).toHaveCount(1);
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Garden gnome");
  await expect(page.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  const response = await runtime.fetch(glb, { role: "owner" });
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
} finally {
  await runtime.close();
}
