import { existsSync } from 'fs';
import puppeteer, { type Browser, type Page, TimeoutError } from 'puppeteer-core';
import type { FetchOptions, FetchedPage, PageFetcher } from './page-fetcher.interface';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Minimum body text (header/footer excluded) that counts as "content arrived". */
const CONTENT_READY_CHARS = 300;
const READY_POLL_MS = 1000;
const MIN_READY_WAIT_MS = 15_000;
const SETTLE_AFTER_NAVIGATION_MS = 2000;
const CAPTURE_ATTEMPTS = 4;
const FETCH_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 5000;
const DEFAULT_PROTOCOL_TIMEOUT_MS = 600_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class BrowserNotFoundError extends Error {
  constructor(tried: string[]) {
    super(
      'No Chromium-based browser found. Pass --browser <path> or set BROWSER_EXECUTABLE_PATH.' +
        (tried.length ? ` Tried: ${tried.join(', ')}` : ''),
    );
    this.name = 'BrowserNotFoundError';
  }
}

const WINDOWS_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
];
const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/**
 * Picks the browser executable: explicit argument → BROWSER_EXECUTABLE_PATH →
 * well-known install locations for the current platform.
 */
export function resolveBrowserExecutable(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): string {
  const tried: string[] = [];
  const candidates = [explicit, env.BROWSER_EXECUTABLE_PATH].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  candidates.push(
    ...(platform === 'win32'
      ? WINDOWS_CANDIDATES
      : platform === 'darwin'
        ? MAC_CANDIDATES
        : LINUX_CANDIDATES),
  );

  for (const candidate of candidates) {
    tried.push(candidate);
    if (exists(candidate)) return candidate;
  }
  throw new BrowserNotFoundError(tried);
}

/**
 * Renders pages in a headless Chromium via puppeteer-core. The city sites are
 * client-rendered and slow: navigation often hits the timeout while the DOM is
 * already populated, so a navigation timeout is not an error here — the page
 * is still captured and judged by its content length downstream.
 */
export class HeadlessBrowserFetcher implements PageFetcher {
  private browser: Browser | null = null;

  /**
   * @param protocolTimeoutMs upper bound for a single CDP call (page.content(),
   * waitForFunction…). The default 180 s of puppeteer is too tight for this
   * site, where a frame can stay busy for minutes.
   */
  constructor(
    private readonly executablePath: string,
    private readonly protocolTimeoutMs = DEFAULT_PROTOCOL_TIMEOUT_MS,
  ) {}

  async fetch(url: string, options: FetchOptions): Promise<FetchedPage> {
    // The site sometimes re-navigates right after load (city redirect, router
    // replace) so the evaluation context dies, and it drops connections under
    // load (ERR_CONNECTION_CLOSED / ERR_TIMED_OUT). Both are worth a retry.
    let lastError: unknown;
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      try {
        return await this.fetchOnce(url, options);
      } catch (err) {
        lastError = err;
        if (!isContextDestroyed(err) && !isTransientNetworkError(err)) throw err;
        if (attempt < FETCH_ATTEMPTS) await sleep(RETRY_PAUSE_MS * attempt);
      }
    }
    throw lastError;
  }

  private async fetchOnce(url: string, options: FetchOptions): Promise<FetchedPage> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    const deadline = Date.now() + options.timeoutMs;

    try {
      await page.setUserAgent(USER_AGENT);
      await page.setViewport({ width: 1366, height: 900 });

      // `domcontentloaded`, not `networkidle*`: the site keeps long-lived
      // connections (chat widget, analytics, SignalR) so the network never goes
      // idle and a networkidle wait would eat the whole budget before the
      // client-side content has been polled for even once.
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err;
      }

      await this.waitForContent(page, deadline);

      return this.capture(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** Polls until the page body carries text or the deadline passes; survives mid-poll navigations. */
  private async waitForContent(page: Page, deadline: number): Promise<void> {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      try {
        await page.waitForFunction(
          contentReady,
          { timeout: Math.max(MIN_READY_WAIT_MS, remaining), polling: READY_POLL_MS },
          CONTENT_READY_CHARS,
        );
        return;
      } catch (err) {
        if (err instanceof TimeoutError) return;
        if (isContextDestroyed(err)) {
          // A navigation in the middle of polling: let the new document settle and poll again.
          await sleep(SETTLE_AFTER_NAVIGATION_MS);
          continue;
        }
        throw err;
      }
    }
  }

  /** Serializes the DOM; a navigation can still land between polling and capture. */
  private async capture(page: Page): Promise<FetchedPage> {
    let lastError: unknown;
    for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt++) {
      try {
        const [html, title] = await Promise.all([page.content(), page.title()]);
        return { html, title, finalUrl: page.url() };
      } catch (err) {
        if (!isContextDestroyed(err)) throw err;
        lastError = err;
        await sleep(SETTLE_AFTER_NAVIGATION_MS);
      }
    }
    throw lastError;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        executablePath: this.executablePath,
        headless: true,
        protocolTimeout: this.protocolTimeoutMs,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      });
    }
    return this.browser;
  }
}

function isContextDestroyed(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /execution context was destroyed|Cannot find context|Target closed|frame was detached|detached Frame|Session closed/i.test(
    message,
  );
}

function isTransientNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /net::ERR_(TIMED_OUT|CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_REFUSED|EMPTY_RESPONSE|NETWORK_CHANGED|HTTP2_PROTOCOL_ERROR)/i.test(
    message,
  );
}

/** Runs inside the page: true once <main> (minus furniture) carries real text. */
function contentReady(minChars: number): boolean {
  const main = document.querySelector('main') ?? document.body;
  if (!main) return false;
  const clone = main.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('header, footer, nav, script, style').forEach((el) => el.remove());
  const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length >= minChars;
}
