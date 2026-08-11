const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const pages = [
  "index.html",
  "manifesto.html",
  "product.html",
  "founders.html",
  "apply.html",
  "privacy.html",
  "terms.html",
];

if (output !== path.join(root, "dist") || path.dirname(output) !== root) {
  throw new Error(`Refusing to clean unexpected output path: ${output}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const page of pages) {
  fs.copyFileSync(path.join(root, page), path.join(output, page));
}

fs.cpSync(path.join(root, "assets"), path.join(output, "assets"), {
  recursive: true,
});

console.log(`Static site written to ${path.relative(root, output)}/`);
