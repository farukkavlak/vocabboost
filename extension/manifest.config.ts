import { llmProviders } from "./src/lookup/providers";
import { sources } from "./src/content/sources";

// The single place platforms are declared: adding an adapter updates the manifest too.
const matches = sources.flatMap((source) => [...source.hostPatterns]);

export default {
  name: "VocabBoost",
  version: "1.0",
  manifest_version: 3,
  // No longer "powered by AI": the default path is a free dictionary and no key at all.
  description:
    "Look up a word from the subtitles without leaving the video, and hear how it sounds.",
  // `offscreen` holds the model in a page of its own; the worker is stopped when idle.
  permissions: ["storage", "offscreen"],
  // The model runs as WebAssembly, which extension pages refuse without this.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  host_permissions: [...matches, "https://api.dictionaryapi.dev/*"],
  // Asked for beside the key field: an install with no key never calls these.
  optional_host_permissions: llmProviders.map((provider) => provider.origin),
  action: { default_popup: "settings.html" },
  background: {
    service_worker: "background.js",
  },
  commands: {
    "lookup-subtitle": {
      suggested_key: {
        default: "Ctrl+Shift+H",
        mac: "Command+Shift+H",
      },
      description: "Look up a word from the current subtitle line",
    },
  },
  content_scripts: [
    {
      matches,
      js: ["content.js"],
    },
  ],
  icons: {
    "16": "logo.png",
    "32": "logo.png",
    "48": "logo.png",
    "128": "logo.png",
  },
};
