"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "src", "shared");
const destinationDir = path.join(repoRoot, "dist", "shared");

fs.mkdirSync(destinationDir, { recursive: true });
for (const name of fs.readdirSync(sourceDir)) {
  const sourcePath = path.join(sourceDir, name);
  const destinationPath = path.join(destinationDir, name);
  fs.copyFileSync(sourcePath, destinationPath);
}
