// Builds the offline, single-file demo (npm run demo:build).
// Swaps the Supabase client and extension bridge for demo stand-ins that read
// demo/demo-data.json, inlines the logo, and bundles everything into one script
// so scripts/inline-demo.mjs can produce a single HTML file.
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => path.join(root, "src", file);
const swaps = new Map([
  [src("lib/supabase.js"), src("lib/demoSupabase.js")],
  [src("lib/extensionBridge.js"), src("lib/demoExtensionBridge.js")],
]);
const logo = `data:image/svg+xml;base64,${readFileSync(path.join(root, "public/lawcovery-logo-legal-recovery.svg")).toString("base64")}`;
const mark = `data:image/svg+xml;base64,${readFileSync(path.join(root, "public/lawcovery-mark.svg")).toString("base64")}`;
const ninjacart = `data:image/png;base64,${readFileSync(path.join(root, "public/ninjacart-logo.png")).toString("base64")}`;

export default defineConfig({
  base: "./",
  json: { stringify: true },
  build: {
    outDir: "demo/dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [{
    name: "lawcovery-demo",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && swaps.has(resolved.id) ? swaps.get(resolved.id) : null;
    },
    transform(code, id) {
      if (!/\.(jsx?|tsx?)$/.test(id) || id.includes("node_modules")) return null;
      // Opened from disk there is no web root: inline the logo and send
      // "home" links to the in-app homepage view.
      return code
        .replaceAll('"/lawcovery-logo-legal-recovery.svg"', JSON.stringify(logo))
        .replaceAll('"/lawcovery-mark.svg"', JSON.stringify(mark))
        .replaceAll('"/ninjacart-logo.png"', JSON.stringify(ninjacart))
        .replaceAll('href="/"', 'href="?view=home"');
    },
  }],
});
