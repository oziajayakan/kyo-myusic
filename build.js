const fs = require("fs");
const path = require("path");

// Ensure directories exist
if (!fs.existsSync("www")) fs.mkdirSync("www", { recursive: true });
if (!fs.existsSync("www/js")) fs.mkdirSync("www/js", { recursive: true });

// Remove legacy leftover platform files if present
["www/js/platform.js", "www/js/platforms.js", "www/js/scrapr.bundle.js"].forEach(file => {
  if (fs.existsSync(file)) fs.unlinkSync(file);
});

// Helper to copy directory recursively (safe – skip if src doesn't exist)
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Skipping (not found): ${src}`);
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  console.log("Copying modular scrapers and utils directly to www...");
  try {
    // Clean old redundant www/scrapers and www/utils if present
    if (fs.existsSync("www/scrapers")) fs.rmSync("www/scrapers", { recursive: true, force: true });
    if (fs.existsSync("www/utils")) fs.rmSync("www/utils", { recursive: true, force: true });

    // 1. Copy scrapers folder directly into www/js/scrapers (optional – only if present)
    copyDirSync("src/scrapers", "www/js/scrapers");

    // 2. Copy utils folder into www/js/utils (optional – only if present)
    copyDirSync("src/utils", "www/js/utils");

    // 2b. Copy js folder into www/js (optional – only if present)
    if (fs.existsSync("src/js")) {
      copyDirSync("src/js", "www/js");
      console.log("Copied src/js/ successfully!");
    }

    // 3. Copy frontend source files
    console.log("Copying frontend source files...");
    const frontendFiles = [
      ["src/index.html", "www/index.html"],
      ["src/index.css",  "www/index.css"],
      ["src/soft-ui.css","www/soft-ui.css"],
      ["src/app.js",     "www/app.js"],
      ["src/share.html", "www/share.html"],
      ["src/share.css",  "www/share.css"],
      ["src/share.js",   "www/share.js"],
    ];
    for (const [src, dest] of frontendFiles) {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      } else {
        console.warn(`Skipping (not found): ${src}`);
      }
    }

    // Copy assets / icons / fonts (from root and src/assets)
    const rootAssets = [
      "kyo_icon.webp",
      "icon_untukdi_aboutthisapp.webp",
      "MiSans-Regular.119.woff2",
      "MiSans-Medium.119.woff2",
    ];
    for (const f of rootAssets) {
      if (fs.existsSync(f)) {
        fs.copyFileSync(f, path.join("www", f));
      }
    }

    // Copy src/assets if present
    if (fs.existsSync("src/assets")) {
      copyDirSync("src/assets", "www/assets");
      console.log("Copied src/assets/ successfully!");
    }

    console.log("Build complete! www/ is ready.");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
