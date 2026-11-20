// Test data the suites upload or a fake generation service returns:
// small PNG concept images and a GLB ring model, made here from code.
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A 192×192 PNG of a glazed ring on a pale background, tinted by `hue` (RGB 0..1). */
export function ringPng([r, g, b]) {
  const size = 192;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2);
      const d = Math.hypot(dx, dy);
      let px = [238, 236, 232];
      if (d > 0.3 && d < 0.85) {
        const t = 1 - Math.abs(d - 0.575) / 0.275;
        const light = 0.55 + 0.45 * t * (1 - (dx + dy) / 3);
        const sprinkle = (x * 7 + y * 13) % 97 === 0;
        px = sprinkle ? [250, 250, 250] : [r * 255 * light, g * 255 * light, b * 255 * light];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, px[0]); raw[o + 1] = Math.min(255, px[1]); raw[o + 2] = Math.min(255, px[2]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A binary glTF of a torus with a glazed material. */
export function ringGlb() {
  const R = 1, r = 0.42, seg = 48, sides = 24;
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= sides; j++) {
      const v = (j / sides) * Math.PI * 2;
      const cx = Math.cos(u) * R, cz = Math.sin(u) * R;
      const nx = Math.cos(u) * Math.cos(v), ny = Math.sin(v), nz = Math.sin(u) * Math.cos(v);
      pos.push(cx + r * nx, r * ny, cz + r * nz);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const p = Buffer.from(new Float32Array(pos).buffer), n = Buffer.from(new Float32Array(nor).buffer);
  const ix = Buffer.from(new Uint16Array(idx).buffer);
  const bin = Buffer.concat([p, n, ix, Buffer.alloc((4 - (ix.length % 4)) % 4)]);
  const min = [-(R + r), -r, -(R + r)], max = [R + r, r, R + r];
  const json = {
    asset: { version: "2.0" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.93, 0.55, 0.62, 1], metallicFactor: 0.1, roughnessFactor: 0.45 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: p.length, target: 34962 },
      { buffer: 0, byteOffset: p.length, byteLength: n.length, target: 34962 },
      { buffer: 0, byteOffset: p.length + n.length, byteLength: ix.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: idx.length, type: "SCALAR" },
    ],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write("JSON", 4, "ascii");
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write("BIN\0", 4, "binary");
  return Buffer.concat([head, jh, js, bh, bin]);
}

export const CONCEPT_PNGS = [
  [0.93, 0.55, 0.62], [0.55, 0.36, 0.22], [0.98, 0.83, 0.42], [0.45, 0.7, 0.9],
].map(ringPng);
export const dataUri = (mime, buffer) => `data:${mime};base64,${buffer.toString("base64")}`;

/**
 * A Gateway that has the generation service configured, answering the
 * service's prediction calls the way it does: concept images for a text
 * prompt, a GLB for an image. Prompts containing "on hold" stay pending
 * (finished later through the webhook); a prompt containing "melted" fails
 * its first run.
 */
export function fakeGatewayScript() {
  const concepts = CONCEPT_PNGS.map((png) => dataUri("image/png", png));
  const glb = dataUri("model/gltf-binary", ringGlb());
  return `const CONCEPTS = ${JSON.stringify(concepts)}; const GLB = ${JSON.stringify(glb)};
let n = 0; const failed = new Set(); const calls = [];
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__calls") return Response.json(calls);
  if (request.method === "GET" && url.pathname === "/api/integrations/replicate")
    return Response.json({ requested: true, configured: true, ready: true });
  if (request.method === "POST" && url.pathname.startsWith("/api/integrations/replicate/api.replicate.com/v1/")) {
    const body = await request.json();
    calls.push({ path: url.pathname, body });
    const id = "pred-" + (++n);
    const input = body.input || {};
    if (url.pathname.endsWith("/predictions") && url.pathname.includes("/models/")) {
      const prompt = String(input.prompt || "");
      if (prompt.includes("on hold")) return Response.json({ id, status: "starting", output: null }, { status: 201 });
      if (prompt.includes("melted") && !failed.has(prompt)) { failed.add(prompt); return Response.json({ id, status: "failed", error: "The image model ran out of memory." }, { status: 201 }); }
      const count = Number(input.num_outputs || 1);
      return Response.json({ id, status: "succeeded", output: CONCEPTS.slice(0, count) }, { status: 201 });
    }
    return Response.json({ id, status: "succeeded", output: { model_file: GLB } }, { status: 201 });
  }
  return Response.json({ code: "integration_not_configured" }, { status: 503 });
} };`;
}

export const configuredGateway = () => ({
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-generation-gateway" } },
  workers: [{ config: { name: "fake-generation-gateway", compatibilityDate: "2025-01-01",
    manifest: { mainModule: "gateway.mjs", modules: { "gateway.mjs": { type: "esm", contents: fakeGatewayScript() } } } } }],
});
