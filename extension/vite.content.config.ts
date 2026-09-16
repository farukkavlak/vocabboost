import { bundle } from "./vite.shared";

export default bundle({
  entry: "src/content/index.ts",
  name: "content",
  format: "iife",
});
