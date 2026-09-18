import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // The extension runs in a persistent context, which cannot be shared across workers.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  // Live tests hit youtube.com (`npm run test:live`), the shot and store specs only
  // write images (`npm run shots`, `npm run store`), the memory spec is slow and
  // machine-dependent (`npm run test:memory`), and the comparison spec writes research
  // data (`npm run test:comparison`). None belongs in the deterministic suite.
  grepInvert: [
    ...(process.env.LIVE ? [] : [/@live/]),
    ...(process.env.SHOTS ? [] : [/@shots/]),
    ...(process.env.STORE ? [] : [/@store/]),
    ...(process.env.MEMORY ? [] : [/@memory/]),
    ...(process.env.COMPARISON ? [] : [/@comparison/]),
  ],
  use: {
    trace: "retain-on-failure",
  },
});
