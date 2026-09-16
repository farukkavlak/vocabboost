import { readFileSync } from "node:fs";
import { bundle } from "./vite.shared";

export default bundle({
  entry: "src/settings/index.ts",
  name: "settings",
  format: "es",
  assets: {
    "settings.html": readFileSync("src/settings/settings.html", "utf8"),
  },
});
