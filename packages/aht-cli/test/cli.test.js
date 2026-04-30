const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliEntry = path.join(__dirname, "..", "dist", "index.js");
const nodeBin = process.execPath;

test("aht list --json prints parsed headings", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-list-"));
  const filePath = path.join(tmpDir, "sample.md");
  fs.writeFileSync(
    filePath,
    ["# Alpha", "<!-- #Todo -->", "## Beta", "### Gamma"].join("\n"),
  );

  const result = spawnSync(nodeBin, [cliEntry, "list", "--file", filePath, "--json"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.length, 3);
  assert.deepEqual(payload[0].tags, ["Todo"]);
  assert.deepEqual(payload[2].breadcrumb, ["Alpha", "Beta", "Gamma"]);
});

test("aht list prints a grouped tree without positions by default", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-tree-"));
  const filePath = path.join(tmpDir, "sample.typ");
  fs.writeFileSync(
    filePath,
    [
      "= Root",
      "==== Child A // #Spark",
      "==== Child B",
      "== Section",
      "==== Nested",
    ].join("\n"),
  );

  const result = spawnSync(nodeBin, [cliEntry, "list", "--file", filePath], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /0:1:typst/);
  assert.match(result.stdout, /Root/);
  assert.match(result.stdout, /├─ .*Child A/);
  assert.match(result.stdout, /└─ .*Section/);
  assert.match(result.stdout, /Spark/);
});

test("aht list --show-position adds line and level metadata to tree nodes", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-position-"));
  const filePath = path.join(tmpDir, "sample.md");
  fs.writeFileSync(filePath, ["# Root", "## Child"].join("\n"));

  const result = spawnSync(
    nodeBin,
    [cliEntry, "list", "--file", filePath, "--show-position"],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[line 0, level 1, markdown\]/);
  assert.match(result.stdout, /\[line 1, level 2, markdown\]/);
});

test("aht list reuses the same color for headings on the same level", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-color-"));
  const filePath = path.join(tmpDir, "sample.md");
  fs.writeFileSync(filePath, ["# Root", "## Child A", "## Child B"].join("\n"));

  const result = spawnSync(nodeBin, [cliEntry, "list", "--file", filePath], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  assert.equal(result.status, 0, result.stderr);
  const colorMatches = [...result.stdout.matchAll(/\x1b\[(\d+)mChild [AB]/g)];
  assert.equal(colorMatches.length, 2);
  assert.equal(colorMatches[0][1], colorMatches[1][1]);
});

test("aht normalize previews without writing by default", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-normalize-"));
  const filePath = path.join(tmpDir, "sample.md");
  const original = "# Alpha <!-- #Todo :: follow up :: -->\nbody";
  fs.writeFileSync(filePath, original);

  const result = spawnSync(nodeBin, [cliEntry, "normalize", "--file", filePath], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Preview/);
  assert.equal(fs.readFileSync(filePath, "utf8"), original);
});

test("aht tags set writes updated tag comments", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-tags-"));
  const filePath = path.join(tmpDir, "sample.md");
  fs.writeFileSync(filePath, ["# Alpha", "<!-- #Todo -->"].join("\n"));

  const result = spawnSync(
    nodeBin,
    [
      cliEntry,
      "tags",
      "set",
      "--file",
      filePath,
      "--selector",
      "text:Alpha",
      "--tags",
      "Review",
      "--write",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(filePath, "utf8"), /<!-- #Review -->/);
});

test("aht move reorders heading blocks", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-move-"));
  const filePath = path.join(tmpDir, "sample.md");
  fs.writeFileSync(
    filePath,
    ["# Alpha", "body", "# Beta", "body2", "# Gamma", "body3"].join("\n"),
  );

  const result = spawnSync(
    nodeBin,
    [
      cliEntry,
      "move",
      "--file",
      filePath,
      "--selector",
      "text:Gamma",
      "--before",
      "text:Alpha",
      "--write",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(filePath, "utf8"),
    ["# Gamma", "body3", "# Alpha", "body", "# Beta", "body2"].join("\n"),
  );
});

test("aht export reports a missing tinymist binary", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aht-cli-export-"));
  const filePath = path.join(tmpDir, "sample.typ");
  const outputPath = path.join(tmpDir, "sample.pdf");
  fs.writeFileSync(filePath, ["= Alpha", "body"].join("\n"));

  const result = spawnSync(
    nodeBin,
    [
      cliEntry,
      "export",
      "--file",
      filePath,
      "--selector",
      "text:Alpha",
      "--format",
      "pdf",
      "--output",
      outputPath,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: "/nonexistent" },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tinymist/);
  assert.match(result.stderr, /install/i);
});
