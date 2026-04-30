import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHomebrewFormula, buildNpmTarballUrl } from "./homebrew-formula.cjs";
import cliPackage from "../packages/aht-cli/package.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function main() {
  const outputPath = path.resolve(
    repoRoot,
    process.env.AHT_HOMEBREW_OUTPUT ?? "packaging/homebrew/aht-cli.rb",
  );
  const tarballUrl =
    process.env.AHT_NPM_TARBALL_URL ??
    buildNpmTarballUrl(cliPackage.name, cliPackage.version);
  const sha256 = process.env.AHT_NPM_TARBALL_SHA256 ?? (await fetchTarballSha256(tarballUrl));

  const formula = buildHomebrewFormula({
    className: "AhtCli",
    desc: "CLI for Adjust Heading in Tree",
    homepage: "https://github.com/ffy6511/Adjust-heading-in-tree",
    url: tarballUrl,
    sha256,
    license: "MIT",
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formula, "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
}

async function fetchTarballSha256(tarballUrl) {
  const response = await fetch(tarballUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download npm tarball from ${tarballUrl}. Publish the package first or provide AHT_NPM_TARBALL_SHA256.`,
    );
  }

  const hash = createHash("sha256");
  const arrayBuffer = await response.arrayBuffer();
  hash.update(Buffer.from(arrayBuffer));
  return hash.digest("hex");
}

await main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
