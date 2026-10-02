export interface FetchedPage {
  /** Serialized DOM after client-side rendering. */
  html: string;
  /** `document.title` at capture time. */
  title: string;
  /** URL after redirects. */
  finalUrl: string;
}

export interface FetchOptions {
  timeoutMs: number;
}

/**
 * Loads a page the way a visitor's browser would. The only real
 * implementation drives a headless Chromium; tests substitute a fake.
 */
export interface PageFetcher {
  fetch(url: string, options: FetchOptions): Promise<FetchedPage>;
  close(): Promise<void>;
}
