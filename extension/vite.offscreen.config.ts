import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The offscreen page holds the model. transformers.js imports onnxruntime's WebGPU build,
// whose runtime is 28 MB; the plain WebAssembly build is 14 MB and is all a CPU needs.
// It is the build that leaves its runtime as separate files: the bundled one refers to
// the runtime by URL, and a library build inlines every such file, twice, as base64.
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      "onnxruntime-web/webgpu":
        "../node_modules/onnxruntime-web/dist/ort.wasm.min.mjs",
    },
  },
  plugins: [
    {
      name: "emit-page",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "offscreen.html",
          source: readFileSync("src/offscreen/offscreen.html", "utf8"),
        });
        // Loaded by onnxruntime at run time, from the path set in the page.
        for (const file of [
          "ort-wasm-simd-threaded.wasm",
          "ort-wasm-simd-threaded.mjs",
        ]) {
          this.emitFile({
            type: "asset",
            fileName: `ort/${file}`,
            source: readFileSync(
              `../node_modules/onnxruntime-web/dist/${file}`,
            ),
          });
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome114",
    minify: false,
    lib: {
      entry: "src/offscreen/index.ts",
      formats: ["es"],
      fileName: () => "offscreen.js",
    },
  },
});
