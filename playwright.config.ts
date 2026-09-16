import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // The extension runs in a persistent context, which cannot be shared across workers.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  // Live tests hit youtube.com (`npm run test:live`), the shot spec only writes images
  // (`npm run shots`), and the memory spec is slow and machine-dependent
  // (`npm run test:memory`). None belongs in the deterministic suite.
  grepInvert: [
    ...(process.env.LIVE ? [] : [/@live/]),
    ...(process.env.SHOTS ? [] : [/@shots/]),
    ...(process.env.MEMORY ? [] : [/@memory/]),
  ],
  use: {
    trace: "retain-on-failure",
  },
});
