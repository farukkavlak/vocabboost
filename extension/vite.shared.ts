import { defineConfig, type UserConfig } from "vite";

interface Bundle {
  entry: string;
  /** Also the output file name, `<name>.js`. */
  name: string;
  /** A content script cannot be a module, so it is an IIFE; pages can be modules. */
  format: "es" | "iife";
  /** Extra files written to dist/, by path. */
  assets?: Record<string, string | Uint8Array>;
  alias?: Record<string, string>;
  /** The first build clears dist/ and copies public/; later builds add to it. */
  first?: boolean;
}

/** One bundle per extension context: worker, content script, settings, offscreen page. */
export function bundle({
  entry,
  name,
  format,
  assets = {},
  alias = {},
  first = false,
}: Bundle): UserConfig {
  return defineConfig({
    publicDir: first ? "public" : false,
    resolve: { alias },
    plugins: [
      {
        name: "emit-assets",
        generateBundle() {
          for (const [fileName, source] of Object.entries(assets)) {
            this.emitFile({ type: "asset", fileName, source });
          }
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: first,
      target: "chrome114",
      minify: false,
      lib: {
        entry,
        formats: [format],
        name,
        fileName: () => `${name}.js`,
      },
    },
  });
}
