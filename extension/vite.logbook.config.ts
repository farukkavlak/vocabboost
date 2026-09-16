import { readFileSync } from "node:fs";
import { bundle } from "./vite.shared";

export default bundle({
  entry: "src/logbook/index.ts",
  name: "logbook",
  format: "es",
  assets: {
    "logbook.html": readFileSync("src/logbook/logbook.html", "utf8"),
  },
});
