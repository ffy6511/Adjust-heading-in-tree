const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("root package no longer exposes the aht bin directly", () => {
  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  assert.equal(rootPackage.bin, undefined);
});

test("repository contains a dedicated CLI package", () => {
  const cliPackagePath = path.join(repoRoot, "packages", "aht-cli", "package.json");
  assert.equal(fs.existsSync(cliPackagePath), true);

  const cliPackage = readJson(cliPackagePath);
  assert.equal(cliPackage.bin.aht, "./dist/index.js");
  assert.match(cliPackage.name, /aht-cli/);
});

test("root scripts orchestrate extension and CLI builds separately", () => {
  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  assert.equal(typeof rootPackage.scripts["build:extension"], "string");
  assert.equal(typeof rootPackage.scripts["build:cli"], "string");
  assert.equal(typeof rootPackage.scripts["build:all"], "string");
  assert.equal(typeof rootPackage.scripts["publish:cli"], "string");
  assert.equal(typeof rootPackage.scripts["brew:formula"], "string");
});
