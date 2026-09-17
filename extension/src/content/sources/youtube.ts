import { domCaptionSource } from "./dom-caption-source";

export const youtube = domCaptionSource({
  id: "youtube",
  hostPatterns: ["*://*.youtube.com/*"],
  containerSelector: ".ytp-caption-window-container",
  containerIsCaptionLayer: true,
  segmentSelector: ".ytp-caption-segment",
  titleNoise: /\s+-\s+YouTube$/,
});
