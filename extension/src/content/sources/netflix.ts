import { domCaptionSource } from "./dom-caption-source";

// Selectors not verified against a live Netflix session yet.
export const netflix = domCaptionSource({
  id: "netflix",
  hostPatterns: ["*://*.netflix.com/*"],
  containerSelector: ".player-timedtext",
  containerIsCaptionLayer: true,
  segmentSelector: ".player-timedtext-text-container",
  titleNoise: /\s+[-|]\s+Netflix$/,
});
