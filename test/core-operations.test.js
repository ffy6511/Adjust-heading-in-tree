const test = require("node:test");
const assert = require("node:assert/strict");

const { formatHeadingInlineComments } = require("../dist/core/headingCommentFormat");
const {
  updateHeadingWithComment,
  normalizeTagsAndRemark,
} = require("../dist/core/tagComment");
const { parseHeadings } = require("../dist/core/parser");
const { buildHeadingTree } = require("../dist/core/tree");
const { parseHeadingSelector } = require("../dist/core/selector");
const {
  setHeadingTags,
  setHeadingRemark,
  shiftHeading,
  moveHeading,
  deleteHeading,
} = require("../dist/core/operations");

test("formatHeadingInlineComments moves markdown comments to next line", () => {
  const result = formatHeadingInlineComments(
    [
      "# Alpha <!-- #Todo :: follow up :: -->",
      "body",
      "## Beta <!-- #Done -->",
    ].join("\n"),
    "markdown",
  );

  assert.equal(result.changedCount, 2);
  assert.equal(
    result.content,
    [
      "# Alpha",
      "<!-- #Todo :: follow up :: -->",
      "body",
      "## Beta",
      "<!-- #Done -->",
    ].join("\n"),
  );
});

test("updateHeadingWithComment rewrites the standalone comment block", () => {
  const result = updateHeadingWithComment(
    ["## Alpha", "<!-- #Todo -->", "body"],
    0,
    "markdown",
    ["Todo", "Review"],
    "follow up",
  );

  assert.deepEqual(result, {
    startLine: 0,
    deleteLineCount: 2,
    lines: ["## Alpha", "<!-- #Todo #Review :: follow up :: -->"],
  });
});

test("normalizeTagsAndRemark removes the remark tag when remark is cleared", () => {
  const result = normalizeTagsAndRemark(["Todo", "remark"], undefined, "remark");
  assert.deepEqual(result, { tags: ["Todo"], remark: undefined });
});

test("setHeadingTags updates heading comment content", () => {
  const result = setHeadingTags(
    ["# Alpha", "<!-- #Todo -->", ""].join("\n"),
    parseHeadingSelector("line:0"),
    ["Review"],
    "remark",
  );

  assert.match(result.content, /<!-- #Review -->/);
});

test("setHeadingRemark adds remark and keeps tags", () => {
  const result = setHeadingRemark(
    ["# Alpha", "<!-- #Todo -->", ""].join("\n"),
    parseHeadingSelector("line:0"),
    "follow up",
    "remark",
  );

  assert.match(result.content, /<!-- #Todo #remark :: follow up :: -->/);
});

test("shiftHeading adjusts subtree levels", () => {
  const result = shiftHeading(
    ["# Alpha", "## Beta", "### Gamma", "# Delta"].join("\n"),
    parseHeadingSelector("text:Beta"),
    1,
  );

  assert.equal(
    result.content,
    ["# Alpha", "### Beta", "#### Gamma", "# Delta"].join("\n"),
  );
});

test("moveHeading reorders heading blocks before another heading", () => {
  const result = moveHeading(
    ["# Alpha", "body", "# Beta", "body2", "# Gamma", "body3"].join("\n"),
    parseHeadingSelector("text:Gamma"),
    parseHeadingSelector("text:Alpha"),
    "before",
  );

  assert.equal(
    result.content,
    ["# Gamma", "body3", "# Alpha", "body", "# Beta", "body2"].join("\n"),
  );
});

test("moveHeading rejects moving into its own subtree", () => {
  assert.throws(
    () =>
      moveHeading(
        ["# Alpha", "## Beta", "### Gamma", "# Delta"].join("\n"),
        parseHeadingSelector("text:Alpha"),
        parseHeadingSelector("text:Gamma"),
        "before",
      ),
    /Cannot move a heading into its own subtree/,
  );
});

test("deleteHeading removes the full subtree", () => {
  const result = deleteHeading(
    ["# Alpha", "## Beta", "### Gamma", "# Delta"].join("\n"),
    parseHeadingSelector("text:Beta"),
  );

  assert.equal(result.content, ["# Alpha", "# Delta"].join("\n"));
});

test("tree rebuilt after operations keeps breadcrumbs stable", () => {
  const result = moveHeading(
    ["# Alpha", "## Beta", "# Delta", "## Epsilon"].join("\n"),
    parseHeadingSelector("text:Delta"),
    parseHeadingSelector("text:Alpha"),
    "before",
  );
  const document = buildHeadingTree(parseHeadings(result.content));
  assert.deepEqual(document.nodes[1].children[0].breadcrumb, ["Alpha", "Beta"]);
});
