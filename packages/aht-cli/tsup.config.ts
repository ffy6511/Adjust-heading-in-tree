import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["../../src/cli/index.ts"],
  outDir: "dist",
  format: ["cjs"],
  target: "node20",
  platform: "node",
  bundle: true,
  sourcemap: true,
  clean: true,
  dts: false,
});
