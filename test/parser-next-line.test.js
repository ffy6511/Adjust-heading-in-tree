const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    class Position {
      constructor(line, character) {
        this.line = line;
        this.character = character;
      }
    }
    class Range {
      constructor(start, end) {
        this.start = start;
        this.end = end;
      }
    }
    return { Position, Range };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { parseHeadings } = require("../dist/providers/parser");
const { updateHeadingWithComment } = require("../dist/utils/tagRemark");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("parses markdown tags and remarks from the line below a heading", () => {
  const matches = parseHeadings(
    ["# Alpha", "<!-- #Todo #remark :: follow up :: -->", "body"].join("\n")
  );

  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].text, "Alpha");
  assert.deepStrictEqual(matches[0].tags, ["Todo", "remark"]);
  assert.strictEqual(matches[0].remark, "follow up");
  assert.strictEqual(matches[0].line, 0);
});

test("parses typst tags and remarks from the line below a heading", () => {
  const matches = parseHeadings(
    ["== Alpha", "// #Todo #remark :: follow up ::", "body"].join("\n")
  );

  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].text, "Alpha");
  assert.deepStrictEqual(matches[0].tags, ["Todo", "remark"]);
  assert.strictEqual(matches[0].remark, "follow up");
});

test("writes markdown comments on the line below the heading", () => {
  const result = updateHeadingWithComment(
    ["## Alpha", "body"],
    0,
    "markdown",
    ["Todo"],
    "follow up"
  );

  assert.deepStrictEqual(result, {
    startLine: 0,
    deleteLineCount: 1,
    lines: ["## Alpha", "<!-- #Todo :: follow up :: -->"],
  });
});

test("moves an existing inline comment to the line below the heading", () => {
  const result = updateHeadingWithComment(
    ["## Alpha <!-- #Old :: legacy :: -->", "body"],
    0,
    "markdown",
    ["Old", "New"],
    "legacy"
  );

  assert.deepStrictEqual(result, {
    startLine: 0,
    deleteLineCount: 1,
    lines: ["## Alpha", "<!-- #Old #New :: legacy :: -->"],
  });
});

test("removes an existing next-line comment when tags and remark are empty", () => {
  const result = updateHeadingWithComment(
    ["## Alpha", "<!-- #Todo :: follow up :: -->", "body"],
    0,
    "markdown",
    [],
    undefined
  );

  assert.deepStrictEqual(result, {
    startLine: 0,
    deleteLineCount: 2,
    lines: ["## Alpha"],
  });
});
