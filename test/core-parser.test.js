const test = require("node:test");
const assert = require("node:assert/strict");

const { parseHeadings } = require("../dist/core/parser");
const { buildHeadingTree } = require("../dist/core/tree");
const {
  parseHeadingSelector,
  selectHeading,
  selectHeadings,
} = require("../dist/core/selector");

test("parseHeadings parses markdown headings with next-line comments", () => {
  const matches = parseHeadings(
    ["# Alpha", "<!-- #Todo #remark :: follow up :: -->", "body"].join("\n"),
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, "Alpha");
  assert.deepEqual(matches[0].tags, ["Todo", "remark"]);
  assert.equal(matches[0].remark, "follow up");
  assert.equal(matches[0].range.start.line, 0);
});

test("parseHeadings parses typst headings with inline comments", () => {
  const matches = parseHeadings(["== Alpha // #Todo :: note ::", "body"].join("\n"));

  assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "typst");
  assert.equal(matches[0].level, 2);
  assert.deepEqual(matches[0].tags, ["Todo"]);
  assert.equal(matches[0].remark, "note");
});

test("parseHeadings ignores fenced markdown code blocks", () => {
  const matches = parseHeadings(
    [
      "```md",
      "# Not a heading",
      "```",
      "# Real heading",
    ].join("\n"),
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, "Real heading");
});

test("buildHeadingTree computes breadcrumbs for nested headings", () => {
  const headings = parseHeadings(
    ["# Alpha", "## Beta", "### Gamma", "# Delta"].join("\n"),
  );

  const document = buildHeadingTree(headings);
  assert.equal(document.nodes.length, 2);
  assert.deepEqual(document.nodes[0].children[0].children[0].breadcrumb, [
    "Alpha",
    "Beta",
    "Gamma",
  ]);
});

test("selector resolves by line, text, tag, and breadcrumb path", () => {
  const headings = parseHeadings(
    [
      "# Alpha",
      "<!-- #Todo -->",
      "## Beta",
      "### Gamma",
      "# Delta",
    ].join("\n"),
  );
  const document = buildHeadingTree(headings);

  assert.equal(selectHeading(document, parseHeadingSelector("line:0")).text, "Alpha");
  assert.equal(selectHeading(document, parseHeadingSelector("text:Gamma")).text, "Gamma");
  assert.equal(selectHeading(document, parseHeadingSelector("tag:Todo")).text, "Alpha");
  assert.equal(
    selectHeading(document, parseHeadingSelector("path:Alpha > Beta > Gamma")).text,
    "Gamma",
  );
});

test("selector returns multiple matches for tag selectors", () => {
  const headings = parseHeadings(
    [
      "# Alpha",
      "<!-- #Todo -->",
      "# Beta",
      "<!-- #Todo -->",
    ].join("\n"),
  );
  const document = buildHeadingTree(headings);

  const matches = selectHeadings(document, parseHeadingSelector("tag:Todo"));
  assert.equal(matches.length, 2);
  assert.deepEqual(
    matches.map((match) => match.text),
    ["Alpha", "Beta"],
  );
});
