// Who may see and change what, with the Gateway as it ships: generation
// not set up, sign-in owned by the Gateway.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { ringGlb } from "./fixtures.mjs";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const runtime = await startRuntime();
const dir = await mkdtemp(path.join(tmpdir(), "model-generator-"));
const glbPath = path.join(dir, "ring.glb");
await writeFile(glbPath, ringGlb());
const fakeGlbPath = path.join(dir, "fake.glb");
await writeFile(fakeGlbPath, "this is not a model");

async function importModel(page, name) {
  await page.goto("/");
  await page.getByTestId("import").click();
  await page.getByTestId("import-file").setInputFiles(glbPath);
  await page.getByTestId("import-name").fill(name);
  await page.getByTestId("import-submit").click();
  await expect(page).toHaveURL(/\/models\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return { url: new URL(page.url()).pathname, glb: await page.getByTestId("download-glb").getAttribute("href") };
}

try {
  await runtime.assertPrivateAccess(["/", "/create", "/create?tab=image"]);

  // Every private path refuses anonymous visitors and other organizations.
  for (const route of ["/", "/create", "/models/x", "/jobs/x", "/files/models/x/glb", "/files/concepts/x"]) {
    for (const role of [undefined, "outsider"]) {
      const response = await runtime.fetch(route, role ? { role } : {});
      expect([401, 403, 302, 303, 307]).toContain(response.status);
    }
  }

  // No sign-in page of the app's own.
  for (const route of ["/login", "/signin", "/signup", "/register", "/logout"]) {
    const response = await runtime.fetch(route, { role: "member" });
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toMatch(/type="password"/);
  }

  // F001, F002: generation not set up is a state the page shows.
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/create");
  await expect(member.getByTestId("not-configured")).toContainText("Generation isn't set up");
  await member.goto("/create?tab=image");
  await expect(member.getByTestId("not-configured")).toContainText("Generation isn't set up");

  // Public webhook and input routes expose nothing without a live job's token.
  expect((await runtime.fetch("/hooks/replicate/not-a-token", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(404);
  expect((await runtime.fetch("/hooks/input/not-a-token")).status).toBe(404);

  // F003: a file that isn't a GLB is refused.
  await member.goto("/");
  await member.getByTestId("import").click();
  await member.getByTestId("import-file").setInputFiles(fakeGlbPath);
  await member.getByTestId("import-submit").click();
  await expect(member.getByTestId("import-error")).toContainText("GLB");

  // A private model is the owner's alone; the admin can't read it either.
  const mine = await importModel(member, "Member's private vase");
  const owner = await (await runtime.context("owner")).newPage();
  const ownersModel = await importModel(owner, "Owner's private chair");
  expect((await runtime.fetch(mine.glb, { role: "owner" })).status).toBe(404);
  expect((await runtime.fetch(ownersModel.glb, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(mine.glb, { role: "member" })).status).toBe(200);
  await owner.goto(mine.url);
  await expect(owner.getByTestId("not-found")).toBeVisible();
  await member.goto(ownersModel.url);
  await expect(member.getByTestId("not-found")).toBeVisible();
  await member.goto("/");
  await expect(member.getByTestId("model-row").filter({ hasText: "Owner's private chair" })).toHaveCount(0);
  await member.goto("/?tab=shared");
  await expect(member.getByTestId("model-row").filter({ hasText: "Owner's private chair" })).toHaveCount(0);

  // Shared: view-only for other members; the admin may remove it.
  await owner.goto(ownersModel.url);
  await owner.getByTestId("share-toggle").click();
  await expect(owner.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  await member.goto(ownersModel.url);
  await expect(member.getByRole("heading", { level: 1 })).toHaveText("Owner's private chair");
  await expect(member.getByTestId("owner-email")).toHaveText("owner@example.test");
  await expect(member.getByTestId("rename")).toHaveCount(0);
  await expect(member.getByTestId("delete")).toHaveCount(0);
  await expect(member.getByTestId("share-toggle")).toHaveCount(0);
  expect((await runtime.fetch(ownersModel.glb, { role: "member" })).status).toBe(200);
  expect((await runtime.fetch(ownersModel.glb, { role: "outsider" })).status).not.toBe(200);
  await member.goto("/?tab=shared");
  await expect(member.getByTestId("model-row").filter({ hasText: "Owner's private chair" })).toHaveCount(1);
  await expect(member.getByTestId("remove-shared")).toHaveCount(0);

  await member.goto(mine.url);
  await member.getByTestId("share-toggle").click();
  await expect(member.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  await owner.goto(mine.url);
  await expect(owner.getByTestId("rename")).toHaveCount(0);
  await expect(owner.getByTestId("share-toggle")).toHaveCount(0);
  await owner.goto("/?tab=shared");
  const row = owner.getByTestId("model-row").filter({ hasText: "Member's private vase" });
  await row.getByTestId("remove-shared").click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(owner.getByTestId("model-row").filter({ hasText: "Member's private vase" })).toHaveCount(0);
  expect((await runtime.fetch(mine.glb, { role: "member" })).status).toBe(404);

  // Unshared again, it leaves the team's view.
  await owner.goto(ownersModel.url);
  await owner.getByTestId("share-toggle").click();
  await expect(owner.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "false");
  expect((await runtime.fetch(ownersModel.glb, { role: "member" })).status).toBe(404);
} finally {
  await runtime.close();
}
