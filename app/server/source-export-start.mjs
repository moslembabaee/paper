// Local-only static host. Never execute source, serve arbitrary files or bind publicly.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
export async function createAppServer() {
const html = await readFile(new URL('../dist/index.html', import.meta.url))
return createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method) || !['/', '/index.html'].includes(req.url)) {
    res.writeHead(404); res.end(); return
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
  res.end(req.method === 'HEAD' ? undefined : html)
})
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
const server = await createAppServer()
server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log(`Paper app: http://127.0.0.1:${server.address().port}`))
}
