import manifest from "./manifest.config";
import { bundle } from "./vite.shared";

export default bundle({
  entry: "src/background.ts",
  name: "background",
  format: "iife",
  assets: { "manifest.json": JSON.stringify(manifest, null, 2) },
  first: true,
});
