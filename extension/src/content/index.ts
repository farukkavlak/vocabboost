import { CaptionBuffer } from "./buffer";
import {
  closeMeaning,
  closeOverlays,
  isInsidePanel,
  isMeaningOpen,
  isPanelOpen,
  openPanel,
} from "./panel";
import type { Message } from "../messages";
import { sourceFor } from "./sources";

const source = sourceFor(location.href);

if (source) {
  const buffer = new CaptionBuffer();
  source.attach((line) => buffer.push(line));

  // Only what we paused do we start again.
  let paused: HTMLVideoElement | null = null;

  const stopWatchingPlayback = (): void => {
    paused?.removeEventListener("play", onPlay);
    paused = null;
  };

  /** The player's own button, Space, a double click: none of them come through here. */
  function onPlay(): void {
    stopWatchingPlayback();
    closeOverlays();
  }

  const dismiss = (): void => {
    const video = paused;
    stopWatchingPlayback();
    closeOverlays();
    void video?.play();
  };

  /** What is on screen, falling back to the buffer once the caption has cleared. */
  const linesToShow = (): { text: string; previous?: string } | null => {
    const onScreen = source.readCurrent();
    const recent = buffer.recent(2).map((line) => line.text);
    const lines =
      onScreen && recent[recent.length - 1] !== onScreen
        ? [...recent.slice(-1), onScreen]
        : recent;

    const text = lines[lines.length - 1];
    if (!text) {
      return null;
    }

    return lines.length > 1 ? { text, previous: lines[0] } : { text };
  };

  const open = (): void => {
    const lines = linesToShow();
    if (!lines) {
      return;
    }

    const video = source.getVideo();
    if (video && !video.paused) {
      video.pause();
      video.addEventListener("play", onPlay);
      paused = video;
    }

    openPanel({
      ...lines,
      moment: {
        platform: source.id,
        title: source.getTitle(),
        url: location.href,
        seconds: Math.floor(video?.currentTime ?? 0),
      },
      captionRect: source.getCaptionRect(),
      captionElements: source.getCaptionElements(),
      captionFontSize: source.getCaptionFontSize(),
    });
  };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isPanelOpen()) {
      return;
    }

    if (isMeaningOpen()) {
      closeMeaning();
      return;
    }

    dismiss();
  });

  document.addEventListener("click", (event) => {
    if (isPanelOpen() && !isInsidePanel(event.target)) {
      dismiss();
    }
  });

  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type !== "LOOKUP_SUBTITLE") {
      return;
    }

    // The shortcut toggles: pressing it again puts the video back.
    if (isPanelOpen()) {
      dismiss();
      return;
    }

    open();
  });
}
