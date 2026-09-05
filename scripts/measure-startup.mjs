// Usage: node scripts/measure-startup.mjs [path/to/dist]
// Counts the entry script and modulepreload files emitted into index.html.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve(process.argv[2] ?? "dist");
const html = readFileSync(resolve(dist, "index.html"), "utf8");
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.js)"/g)]
  .map((match) => match[1]))];
const buffers = assets.map((asset) => readFileSync(resolve(dist, `.${asset}`)));
console.log(JSON.stringify({
  files: assets.length,
  bytes: buffers.reduce((sum, buffer) => sum + buffer.length, 0),
  gzipBytes: buffers.reduce((sum, buffer) => sum + gzipSync(buffer).length, 0),
}, null, 2));
