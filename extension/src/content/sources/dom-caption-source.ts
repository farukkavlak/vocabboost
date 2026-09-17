import type { CaptionSource, Rect } from "../caption-source";
import { matchPatternToRegExp } from "./match-pattern";

const CONTAINER_POLL_MS = 1000;

interface DomCaptionSourceOptions {
  id: string;
  hostPatterns: readonly string[];
  containerSelector: string;
  segmentSelector: string;
  /**
   * What to hide while the panel stands in for the caption. Defaults to the container,
   * which is right when the container is the caption layer. Prime's nearest stable
   * ancestor is the whole player, so it hides the caption lines instead.
   */
  hideSelector?: string;
  /**
   * Whether the container is the caption layer itself. When it is, it can stand in for a
   * missing segment: its text, its bounds and its font size are the caption's. Prime's
   * container is the whole player, where each of those would be wrong.
   */
  containerIsCaptionLayer?: boolean;
  /** What the site adds to the page title around the video's own, to remove. */
  titleNoise?: RegExp;
}

/**
 * Every platform so far renders captions the same way: a container element that is
 * created and destroyed as subtitles are toggled, holding one element per segment.
 */
export function domCaptionSource(
  options: DomCaptionSourceOptions,
): CaptionSource {
  const hostMatchers = options.hostPatterns.map(matchPatternToRegExp);

  const area = (video: HTMLVideoElement): number =>
    video.clientWidth * video.clientHeight;

  // The largest one: players keep spare video elements around, and on Prime the first in
  // the document is a 0x0 placeholder.
  const getVideo = (): HTMLVideoElement | null => {
    let biggest: HTMLVideoElement | null = null;
    for (const video of document.querySelectorAll("video")) {
      if (!biggest || area(video) > area(biggest)) {
        biggest = video;
      }
    }

    return biggest;
  };

  const findContainer = (): HTMLElement | null =>
    document.querySelector(options.containerSelector);

  /**
   * On a copy, because <br> adds no whitespace to `textContent` and would glue the words
   * on either side of it together. `innerText` would handle the break, but it reads as
   * empty while the panel has the caption hidden.
   */
  const readText = (element: Element): string => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const br of copy.querySelectorAll("br")) {
      br.replaceWith(" ");
    }

    return copy.textContent ?? "";
  };

  const readCaption = (container: Element): string => {
    const segments = container.querySelectorAll(options.segmentSelector);
    const parts =
      segments.length || !options.containerIsCaptionLayer
        ? Array.from(segments, readText)
        : [readText(container)];

    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  return {
    id: options.id,
    hostPatterns: options.hostPatterns,
    getVideo,

    getCaptionElements(): HTMLElement[] {
      const container = findContainer();
      if (!container) {
        return [];
      }

      return options.hideSelector
        ? [...container.querySelectorAll<HTMLElement>(options.hideSelector)]
        : [container];
    },

    getCaptionRect(): Rect | null {
      const container = findContainer();
      if (!container) {
        return null;
      }

      const elements = [...container.querySelectorAll(options.segmentSelector)];
      if (!elements.length && !options.containerIsCaptionLayer) {
        return null;
      }

      const rects = (elements.length > 0 ? elements : [container])
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);

      const first = rects[0];
      if (!first) {
        return null;
      }

      const top = Math.min(...rects.map((rect) => rect.top));
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));

      return { top, left, width: right - left, height: bottom - top };
    },

    getCaptionFontSize(): number | null {
      const container = findContainer();
      const segment = container?.querySelector(options.segmentSelector);
      const element =
        segment ?? (options.containerIsCaptionLayer ? container : null);
      if (!element) {
        return null;
      }

      const size = parseFloat(getComputedStyle(element).fontSize);
      return Number.isFinite(size) && size > 0 ? size : null;
    },

    getTitle: () =>
      (options.titleNoise
        ? document.title.replace(options.titleNoise, "")
        : document.title
      ).trim(),

    matches: (url) => hostMatchers.some((matcher) => matcher.test(url)),

    readCurrent() {
      const container = findContainer();
      return container ? readCaption(container) : "";
    },

    attach(onLine) {
      let observed: Element | null = null;
      let observer: MutationObserver | null = null;

      let last = "";
      // Prime's container is the whole player, so this runs on every seek-bar tick.
      // Reading the time means a layout pass, so only a new line pays for it.
      const report = (container: Element): void => {
        const text = readCaption(container);
        if (!text || text === last) {
          return;
        }

        last = text;
        onLine({ text, at: getVideo()?.currentTime ?? 0 });
      };

      const detachObserver = (): void => {
        observer?.disconnect();
        observer = null;
        observed = null;
      };

      // The container comes and goes with the subtitle toggle and SPA navigation.
      // Polling for it beats observing the whole document, which fires constantly.
      const sync = (): void => {
        const container = findContainer();
        if (container === observed) {
          return;
        }

        detachObserver();
        if (!container) {
          return;
        }

        observed = container;
        observer = new MutationObserver(() => report(container));
        observer.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        report(container);
      };

      sync();
      const timer = setInterval(sync, CONTAINER_POLL_MS);

      return () => {
        clearInterval(timer);
        detachObserver();
      };
    },
  };
}
