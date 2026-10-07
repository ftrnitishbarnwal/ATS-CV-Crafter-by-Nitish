// Production build: bundles the React client (hashed assets) and the Node server with esbuild.
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const pub = path.join(out, "public");
const watch = process.argv.includes("--watch");

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function writeHtml(metafile) {
  const outputs = Object.keys(metafile.outputs).map((p) => "/" + path.relative(pub, path.join(root, p)).replace(/\\/g, "/"));
  const js = outputs.find((p) => /\/assets\/app-[^/]+\.js$/.test(p));
  const css = outputs.find((p) => /\/assets\/app-[^/]+\.css$/.test(p));
  let html = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
  html = html.replace("<!--CSS-->", css ? `<link rel="stylesheet" href="${css}" />` : "").replace("<!--JS-->", `<script type="module" src="${js}"></script>`);
  fs.writeFileSync(path.join(pub, "index.html"), html);
}

fs.rmSync(out, { recursive: true, force: true });
copyDir(path.join(root, "public"), pub);

// pdf.js worker for the in-browser preview
const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjsVersion = JSON.parse(fs.readFileSync(path.join(pdfjsDir, "package.json"), "utf8")).version;
fs.mkdirSync(path.join(pub, "assets"), { recursive: true });
fs.copyFileSync(path.join(pdfjsDir, "legacy/build/pdf.worker.min.mjs"), path.join(pub, `assets/pdf.worker-${pdfjsVersion}.min.mjs`));

const clientOpts = {
  entryPoints: { app: path.join(root, "client/main.tsx") },
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: path.join(pub, "assets"),
  entryNames: "[name]-[hash]",
  chunkNames: "chunk-[hash]",
  assetNames: "[name]-[hash]",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["es2020", "chrome90", "safari15", "firefox90"],
  jsx: "automatic",
  metafile: true,
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"), __PDF_WORKER__: JSON.stringify(`/assets/pdf.worker-${pdfjsVersion}.min.mjs`) },
  external: ["/fonts/*"],
  logLevel: "info",
  plugins: [{ name: "html", setup(b) { b.onEnd((r) => r.metafile && writeHtml(r.metafile)); } }],
};

const serverOpts = {
  entryPoints: [path.join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(out, "server.mjs"),
  packages: "external",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(clientOpts);
  await ctx.watch();
  console.log("watching client…");
} else {
  await esbuild.build(clientOpts);
  await esbuild.build(serverOpts);
  console.log("build complete");
}
