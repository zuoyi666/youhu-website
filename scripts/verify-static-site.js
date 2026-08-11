const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  "index.html",
  "manifesto.html",
  "product.html",
  "founders.html",
  "apply.html",
  "privacy.html",
  "terms.html",
];
const fonts = [
  "cormorant-garamond-cyrillic-ext.woff2",
  "cormorant-garamond-cyrillic.woff2",
  "cormorant-garamond-vietnamese.woff2",
  "cormorant-garamond-latin-ext.woff2",
  "cormorant-garamond-latin.woff2",
  "manrope-cyrillic-ext.woff2",
  "manrope-cyrillic.woff2",
  "manrope-greek.woff2",
  "manrope-vietnamese.woff2",
  "manrope-latin-ext.woff2",
  "manrope-latin.woff2",
];
const failures = [];

function fail(file, message) {
  failures.push(`${file}: ${message}`);
}

function sourceFileFor(url) {
  const cleanUrl = url.split(/[?#]/, 1)[0];
  if (!cleanUrl.startsWith("/assets/")) {
    return null;
  }
  return path.join(root, cleanUrl.slice(1));
}

for (const page of pages) {
  const filePath = path.join(root, page);
  const html = fs.readFileSync(filePath, "utf8");

  if (/fonts\.(?:googleapis|gstatic)\.com/i.test(html)) {
    fail(page, "contains an external Google Fonts reference");
  }
  if (/<style\b/i.test(html) || /\sstyle\s*=/i.test(html)) {
    fail(page, "contains inline CSS");
  }
  if (/\son[a-z]+\s*=/i.test(html) || /javascript\s*:/i.test(html)) {
    fail(page, "contains an inline event handler or JavaScript URL");
  }

  for (const match of html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) {
      fail(page, "contains an inline script");
    }
  }

  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const url = match[1];
    const sourceFile = sourceFileFor(url);
    if (sourceFile && !fs.existsSync(sourceFile)) {
      fail(page, `references missing local asset ${url}`);
    }
  }
}

const cssPath = path.join(root, "assets/site.css");
const css = fs.readFileSync(cssPath, "utf8");
if (/@import\s+(?:url\()?\s*["']?https?:/i.test(css)) {
  fail("assets/site.css", "imports an external stylesheet");
}
for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
  const url = match[1].trim();
  if (/^https?:/i.test(url) || /^\/\//.test(url)) {
    fail("assets/site.css", `references external resource ${url}`);
  }
  const sourceFile = sourceFileFor(url);
  if (sourceFile && !fs.existsSync(sourceFile)) {
    fail("assets/site.css", `references missing local asset ${url}`);
  }
}

const siteJs = fs.readFileSync(path.join(root, "assets/site.js"), "utf8");
if (/\.style(?:\.|\[)/.test(siteJs) || /setAttribute\(\s*["']style["']/i.test(siteJs)) {
  fail("assets/site.js", "mutates inline styles");
}

for (const font of fonts) {
  const relativePath = path.join("assets/fonts", font);
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(relativePath, "font file is missing");
    continue;
  }
  const signature = fs.readFileSync(filePath).subarray(0, 4).toString("ascii");
  if (signature !== "wOF2") {
    fail(relativePath, "does not have a WOFF2 signature");
  }
}

const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
for (const marker of [
  "Founder 申请",
  "Founder applications",
  "support@youhu.space",
  "20 道问卷答案",
  "20-question form",
]) {
  if (!privacy.includes(marker)) {
    fail("privacy.html", `is missing privacy disclosure marker: ${marker}`);
  }
}

const nginxPath = path.join(root, "ops/nginx/youhu-space.locations.conf");
const nginx = fs.readFileSync(nginxPath, "utf8");
for (const directive of [
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
]) {
  if (!nginx.includes(directive)) {
    fail("ops/nginx/youhu-space.locations.conf", `CSP is missing ${directive}`);
  }
}
if (/unsafe-inline|unsafe-eval/.test(nginx)) {
  fail("ops/nginx/youhu-space.locations.conf", "CSP contains an unsafe source");
}

if (failures.length) {
  console.error("Static-site verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${pages.length} pages, ${fonts.length} local fonts, local assets, and strict CSP readiness.`
  );
}
