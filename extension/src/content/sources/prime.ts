import { domCaptionSource } from "./dom-caption-source";

/**
 * Prime names only the caption line itself. Everything between it and the player is
 * generated (`span.fbhsa9`, `div.f1iwgj00`), so the container has to be the player and
 * the hiding has to be done on the lines.
 */
export const prime = domCaptionSource({
  id: "prime",
  hostPatterns: ["*://*.primevideo.com/*"],
  containerSelector: ".atvwebplayersdk-player-container",
  segmentSelector: ".atvwebplayersdk-captions-text",
  hideSelector: ".atvwebplayersdk-captions-text",
  containerIsCaptionLayer: false,
  titleNoise: /^Prime Video:\s*/,
});
