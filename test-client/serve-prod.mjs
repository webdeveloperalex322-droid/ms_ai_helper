// Local chat UI against the PROD backend.
//
// Serves test-client/index.html and proxies /v1/* to prod, so the browser sees a
// single origin (prod CORS only allows the prod domain) and the prod client key
// stays out of the html: it is read from .env.prod and injected as X-API-Key.
//
// Usage: pnpm chat:prod  ->  open http://localhost:8787, set Base URL to
//        http://localhost:8787/v1 in the client header.
// Env:   CHAT_PORT (default 8787), PROD_API_URL (default https://mshelper.al-developer.ru)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CHAT_PORT ?? 8787);
const UPSTREAM = (process.env.PROD_API_URL ?? 'https://mshelper.al-developer.ru').replace(/\/$/, '');

function readProdClientKey() {
  const env = readFileSync(join(here, '..', '.env.prod'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('CLIENT_API_KEYS='));
  if (!line) throw new Error('CLIENT_API_KEYS not found in .env.prod');
  // Format: label:key[,label:key...] — take the first key.
  const first = line.slice('CLIENT_API_KEYS='.length).split(',')[0].trim();
  return first.slice(first.indexOf(':') + 1);
}

const apiKey = readProdClientKey();
const indexHtml = join(here, 'index.html');

createServer(async (req, res) => {
  try {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexHtml));
      return;
    }
    if (!req.url.startsWith('/v1/')) {
      res.writeHead(404).end();
      return;
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const upstream = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] ?? 'application/json',
        'x-api-key': apiKey,
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    });
    res.end(buf);
    console.log(`${req.method} ${req.url} -> ${upstream.status}`);
  } catch (err) {
    console.error(`${req.method} ${req.url} failed:`, err.message);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `Proxy error: ${err.message}` }));
  }
}).listen(PORT, () => {
  console.log(`Chat UI: http://localhost:${PORT}  (API -> ${UPSTREAM})`);
  console.log(`Set Base URL in the client header to http://localhost:${PORT}/v1`);
});
