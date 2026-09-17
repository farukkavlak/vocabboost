export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CaptionLine {
  text: string;
  at: number;
}

export interface CaptionSource {
  readonly id: string;
  /** URL match patterns for this platform; the manifest is generated from them. */
  readonly hostPatterns: readonly string[];
  matches(url: string): boolean;
  /** Starts reporting caption lines. Returns a detach function. */
  attach(onLine: (line: CaptionLine) => void): () => void;
  /** The caption on screen right now, or "" when none is showing. */
  readCurrent(): string;
  /** The element captions are drawn in; hidden while the panel stands in for it. */
  getCaptionElements(): HTMLElement[];
  /**
   * Where the caption text actually sits. Not the same as the caption element: players
   * draw captions inside a layer that covers the whole video, so only the text's own
   * bounds say where the words are on screen.
   */
  getCaptionRect(): Rect | null;
  /** Players scale captions with the window and with fullscreen; the panel follows. */
  getCaptionFontSize(): number | null;
  getVideo(): HTMLVideoElement | null;
  /** The video's title, without the site's name. */
  getTitle(): string;
}
