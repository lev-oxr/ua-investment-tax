// Статичний сервер для site/. Cache-Control: no-cache змушує браузер щоразу перевіряти файл,
// інакше після оновлення коду він змішує нові модулі зі старими з кешу і сторінка падає.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SITE = resolve('site');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
};

/**
 * @param {number} port 0 — будь-який вільний
 * @returns {Promise<import('node:http').Server>}
 */
export async function serve(port) {
  const server = createServer(async (req, res) => {
    const path = join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!path.startsWith(SITE)) return res.writeHead(403).end();
    try {
      const body = await readFile(path);
      res
        .writeHead(200, {
          'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await serve(8765);
  console.log(`http://localhost:${server.address().port}`);
}
