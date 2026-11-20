import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { nameFromPrompt } from "./names";
import type { ListInput } from "./models";

// An in-memory SQLite with the app's migrations stands in for D1; files are
// recorded instead of stored.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
const stored = vi.hoisted(() => new Set<string>());
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));
vi.mock("@/server/files", () => ({
  UserError: class UserError extends Error {},
  putFile: async (key: string) => void stored.add(key),
  deleteFiles: async (keys: string[]) => keys.forEach((key) => stored.delete(key)),
}));
vi.mock("./files", () => ({
  UserError: class UserError extends Error {},
  putFile: async (key: string) => void stored.add(key),
  deleteFiles: async (keys: string[]) => keys.forEach((key) => stored.delete(key)),
}));

const models = await import("./models");
const GLB = new Uint8Array([1, 2, 3]);
const list = (input: Partial<ListInput> = {}) =>
  models.listInput.parse(input);
const alice = { id: "alice", admin: false };
const bob = { id: "bob", admin: false };
const admin = { id: "carol", admin: true };

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  testDb.current = db;
});

describe("models", () => {
  it("stay private to their owner until shared", async () => {
    const { id } = await models.importModel("alice", GLB, "Teapot");
    expect((await models.listModels(alice, list())).rows.map((r) => r.name)).toEqual(["Teapot"]);
    expect((await models.listModels(bob, list())).rows).toEqual([]);
    expect(await models.getModel(bob, id)).toBeNull();
    expect(await models.visibleFiles("bob", id)).toBeUndefined();
    await expect(models.renameModel("bob", { id, name: "Mine now" })).rejects.toThrow();
    await expect(models.setShared("bob", { id, shared: true })).rejects.toThrow();
    await expect(models.deleteModel(bob, id)).rejects.toThrow();
    await expect(models.deleteModel(admin, id)).rejects.toThrow();

    await models.setShared("alice", { id, shared: true });
    const shared = await models.listModels(bob, list({ tab: "shared" }));
    expect(shared.rows.map((r) => [r.name, r.isOwner, r.canRemove])).toEqual([["Teapot", false, false]]);
    expect((await models.getModel(bob, id))?.isOwner).toBe(false);
    await expect(models.renameModel("bob", { id, name: "Mine now" })).rejects.toThrow();
    await expect(models.deleteModel(bob, id)).rejects.toThrow();
  });

  it("let an admin remove a shared model, files included", async () => {
    const { id } = await models.importModel("bob", GLB, "Lamp");
    await models.setShared("bob", { id, shared: true });
    expect(stored.has(`models/${id}.glb`)).toBe(true);
    await models.deleteModel(admin, id);
    expect(await models.getModel(bob, id)).toBeNull();
    expect(stored.has(`models/${id}.glb`)).toBe(false);
  });

  it("search, filter, sort and paginate", async () => {
    for (let i = 0; i < 14; i++) await models.importModel("dave", GLB, `Crate ${String(i).padStart(2, "0")}`);
    const dave = { id: "dave", admin: false };
    const first = await models.listModels(dave, list({ sort: "name" }));
    expect(first.rows).toHaveLength(models.PAGE_SIZE);
    expect(first.pages).toBe(2);
    expect(first.rows[0]?.name).toBe("Crate 00");
    expect((await models.listModels(dave, list({ sort: "name", page: 2 }))).rows).toHaveLength(2);
    expect((await models.listModels(dave, list({ q: "Crate 13" }))).rows).toHaveLength(1);
    expect((await models.listModels(dave, list({ q: "100%" }))).rows).toHaveLength(0);
    expect((await models.listModels(dave, list({ source: "text" }))).rows).toHaveLength(0);
  });
});

describe("names from prompts", () => {
  it("keep short prompts whole and cut long ones at a word", () => {
    expect(nameFromPrompt("  A red   kettle ")).toBe("A red kettle");
    const long = nameFromPrompt("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
  });
});
