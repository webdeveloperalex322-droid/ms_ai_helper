/**
 * Site knowledge crawler: renders the informational pages of a city site in a
 * headless Chromium (Edge/Chrome) and writes a JSON snapshot that
 * `pnpm site:import` loads into the database.
 *
 * Usage:
 *   pnpm site:crawl --url https://tyumen.sushi-master.ru --rn <uuid> --br <uuid> --out data/site-pages/tyumen.json
 *   pnpm site:crawl --help
 *
 * Needs a browser on this machine (--browser or BROWSER_EXECUTABLE_PATH, else
 * auto-detected). No database access. The logic lives in
 * src/modules/site-knowledge; this file only wires argv, browser and output.
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import * as dotenv from 'dotenv';
import {
  EXIT_ERROR,
  EXIT_NO_BROWSER,
  EXIT_OK,
  EXIT_PARTIAL,
  formatCrawlHelp,
  parseCrawlArgs,
} from '../src/modules/site-knowledge/cli-options';
import {
  BrowserNotFoundError,
  HeadlessBrowserFetcher,
  resolveBrowserExecutable,
} from '../src/modules/site-knowledge/crawler/headless-browser.fetcher';
import { HtmlTextExtractor } from '../src/modules/site-knowledge/crawler/html-text-extractor';
import { SiteCrawlerService } from '../src/modules/site-knowledge/crawler/site-crawler.service';
import type { CrawlSnapshotPage } from '../src/modules/site-knowledge/snapshot';

dotenv.config({ path: resolve(process.cwd(), '.env') });

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`;
}

async function main(): Promise<number> {
  const parsed = parseCrawlArgs(process.argv.slice(2));

  if (parsed.kind === 'help') {
    console.log(formatCrawlHelp());
    return EXIT_OK;
  }
  if (parsed.kind === 'error') {
    console.error(`Error: ${parsed.message}\n`);
    console.error(formatCrawlHelp());
    return EXIT_ERROR;
  }

  const options = parsed.options;

  let executablePath: string;
  try {
    executablePath = resolveBrowserExecutable(options.browser);
  } catch (err) {
    if (err instanceof BrowserNotFoundError) {
      console.error(err.message);
      return EXIT_NO_BROWSER;
    }
    throw err;
  }

  console.log('Site knowledge crawl');
  console.log(`  site:        ${options.siteUrl}`);
  console.log(`  rn/br:       ${options.rn} / ${options.br}`);
  console.log(`  browser:     ${executablePath}`);
  console.log(`  pages:       ${options.pages.length} (${options.pages.join(', ')})`);
  console.log(
    `  promotions:  ${options.promotionDetails ? 'follow detail links' : 'list only'}   ` +
      `timeout: ${options.pageTimeoutMs} ms   concurrency: ${options.concurrency}`,
  );
  console.log('');

  const fetcher = new HeadlessBrowserFetcher(executablePath);
  const crawler = new SiteCrawlerService(fetcher, new HtmlTextExtractor());
  const startedAt = Date.now();
  const timings = new Map<string, number>();
  let lastTick = Date.now();

  const onPage = (page: CrawlSnapshotPage) => {
    const now = Date.now();
    timings.set(page.path, now - lastTick);
    lastTick = now;
    const status = page.status === 'ok' ? 'ok    ' : 'FAILED';
    const detail = page.status === 'ok' ? `${page.content.length} chars` : page.error ?? '';
    console.log(`  ${status} ${page.path.padEnd(40)} ${detail}`);
  };

  const citySlug = new URL(options.siteUrl).hostname.split('.')[0];
  const snapshot = await crawler.crawl({
    siteUrl: options.siteUrl,
    rn: options.rn,
    br: options.br,
    citySlug,
    pages: options.pages,
    promotionDetails: options.promotionDetails,
    pageTimeoutMs: options.pageTimeoutMs,
    concurrency: options.concurrency,
    onPage,
  });

  const outPath = resolve(process.cwd(), options.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

  const ok = snapshot.pages.filter((p) => p.status === 'ok').length;
  const failed = snapshot.pages.length - ok;

  console.log('');
  console.log(`snapshot: ${outPath}`);
  console.log(`pages: ok=${ok} failed=${failed}   duration: ${formatDuration(Date.now() - startedAt)}`);
  if (failed > 0) {
    console.log('failed pages:');
    for (const page of snapshot.pages.filter((p) => p.status === 'failed')) {
      console.log(`  ${page.path}: ${page.error}`);
    }
  }

  return failed > 0 ? EXIT_PARTIAL : EXIT_OK;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Crawl failed:', err instanceof Error ? err.stack ?? err.message : err);
    process.exit(EXIT_ERROR);
  });
