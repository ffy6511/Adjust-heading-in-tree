const test = require("node:test");
const assert = require("node:assert/strict");

const { buildHomebrewFormula, buildNpmTarballUrl } = require("../scripts/homebrew-formula.cjs");

test("buildNpmTarballUrl derives the npm registry tarball URL for scoped packages", () => {
  assert.equal(
    buildNpmTarballUrl("@ffy6511/aht-cli", "0.4.2"),
    "https://registry.npmjs.org/@ffy6511/aht-cli/-/aht-cli-0.4.2.tgz",
  );
});

test("buildHomebrewFormula emits a node-based npm install formula", () => {
  const formula = buildHomebrewFormula({
    className: "AhtCli",
    desc: "CLI for Adjust Heading in Tree",
    homepage: "https://github.com/ffy6511/Adjust-heading-in-tree",
    url: "https://registry.npmjs.org/@ffy6511/aht-cli/-/aht-cli-0.4.2.tgz",
    sha256: "abc123",
    license: "MIT",
  });

  assert.match(formula, /class AhtCli < Formula/);
  assert.match(formula, /depends_on "node"/);
  assert.match(formula, /system "npm", "install", \*std_npm_args\(libexec\)/);
  assert.match(formula, /bin\.install_symlink Dir\["#\{libexec\}\/bin\/\*"\]/);
  assert.match(formula, /assert_match "CLI for Adjust Heading in Tree", shell_output\("#\{bin\}\/aht --help"\)/);
});
