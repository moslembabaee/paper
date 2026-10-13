import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { parseRoadmap } from './model.ts'

const canonical = new URL('../../../ROADMAP.json', import.meta.url)
const snapshot = new URL('./snapshot.json', import.meta.url)

export async function readRoadmap(mode: 'live' | 'snapshot') {
  try {
    const source = await readFile(canonical, 'utf8')
    const metadata = await stat(canonical)
    return parseRoadmap(JSON.parse(source), { mode, updatedAt: metadata.mtime.toISOString() })
  } catch (error) {
    // Standalone app checkouts and Docker build contexts have no orchestrator files.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return parseRoadmap(JSON.parse(await readFile(snapshot, 'utf8')), { mode: 'snapshot' })
  }
}

export function roadmapPlugin(): Plugin {
  return {
    name: 'paper-roadmap',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== `${server.config.base}roadmap.json`) return next()
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        try { response.end(JSON.stringify(await readRoadmap('live'))) }
        catch { response.statusCode = 503; response.end(JSON.stringify({ error: 'Roadmap temporarily unavailable.' })) }
      })
    },
    async buildStart() {
      this.addWatchFile(fileURLToPath(canonical))
      this.addWatchFile(fileURLToPath(snapshot))
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'roadmap.json', source: JSON.stringify(await readRoadmap('snapshot'), null, 2) })
    },
  }
}
