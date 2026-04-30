function buildNpmTarballUrl(packageName, version) {
  const escapedName = packageName.startsWith("@")
    ? packageName
    : packageName;
  const tarballName = packageName.replace(/^@[^/]+\//, "");
  return `https://registry.npmjs.org/${escapedName}/-/${tarballName}-${version}.tgz`;
}

function buildHomebrewFormula(options) {
  return `class ${options.className} < Formula
  desc "${options.desc}"
  homepage "${options.homepage}"
  url "${options.url}"
  sha256 "${options.sha256}"
  license "${options.license}"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "CLI for Adjust Heading in Tree", shell_output("#{bin}/aht --help")
  end
end
`;
}

module.exports = {
  buildHomebrewFormula,
  buildNpmTarballUrl,
};
