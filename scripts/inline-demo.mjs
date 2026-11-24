// Turns demo/dist into one self-contained file: demo/Lawcovery-demo.html.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dist = "demo/dist";
let html = readFileSync(path.join(dist, "index.html"), "utf8");
// "</script" inside the bundle (e.g. in captured page text) would end the tag early.
const safe = (code) => code.replace(/<\/script/gi, "<\\/script");
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g,
  (_, file) => `<script type="module">${safe(readFileSync(path.join(dist, file), "utf8"))}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g,
  (_, file) => `<style>${readFileSync(path.join(dist, file), "utf8")}</style>`);
const logo = readFileSync("public/lawcovery-logo-legal-recovery.svg").toString("base64");
html = html.replace(/href="\/lawcovery-logo-legal-recovery\.svg"/, `href="data:image/svg+xml;base64,${logo}"`);
html = html.replace("<title>Lawcovery | Legal Recovery</title>", "<title>Lawcovery | Demo</title>");
const left = [...html.matchAll(/(?:src|href)="\.\/assets\/[^"]+"/g)];
if (left.length) throw new Error(`Assets not inlined: ${left.map((m) => m[0]).join(", ")}`);
writeFileSync("demo/Lawcovery-demo.html", html);
const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(`Built demo/Lawcovery-demo.html (${mb} MB). Open it in a browser or share the file.`);
for (const f of readdirSync(path.join(dist, "assets"))) if (!/\.(js|css)$/.test(f)) console.warn(`Note: extra asset not inlined: ${f}`);
