import { readFileSync } from "node:fs";
import { bundle } from "./vite.shared";

const ORT = "../node_modules/onnxruntime-web/dist";
const RUNTIME = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

export default bundle({
  entry: "src/offscreen/index.ts",
  name: "offscreen",
  format: "es",
  // transformers.js imports onnxruntime's WebGPU build (a 28 MB runtime). The plain
  // WebAssembly build is 14 MB and keeps its runtime in separate files, which a library
  // build would otherwise inline into the bundle.
  alias: { "onnxruntime-web/webgpu": `${ORT}/ort.wasm.min.mjs` },
  assets: {
    "offscreen.html": readFileSync("src/offscreen/offscreen.html", "utf8"),
    ...Object.fromEntries(
      RUNTIME.map((file) => [`ort/${file}`, readFileSync(`${ORT}/${file}`)]),
    ),
  },
});
