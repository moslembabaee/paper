import type { IncomingMessage, ServerResponse } from 'node:http'
import { createService } from './service.ts'

const provider = (name: string) => {
  const clientId = process.env[`${name}_CLIENT_ID`]
  const clientSecret = process.env[`${name}_CLIENT_SECRET`]
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}
const service = await createService({ root: process.env.PAPER_DATA_DIR ?? '/data', secret: process.env.PAPER_SESSION_SECRET ?? '', origin: process.env.PAPER_PUBLIC_URL ?? 'http://localhost:3000', google: provider('GOOGLE'), github: provider('GITHUB') })
// The HTTP handler is shared with integration tests; Fastify owns production connections and body limits.
const moduleName = 'fastify'
const { default: fastify } = await import(moduleName)
const app = fastify({ logger: true, bodyLimit: 17 * 1024 * 1024 })
app.all('/*', async (request: { raw: IncomingMessage; body: unknown }, reply: { raw: ServerResponse; hijack: () => void }) => {
  reply.hijack()
  await service.handler(request.raw, reply.raw, request.body)
})
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { service.close(); void app.close() })
await app.listen({ host: '0.0.0.0', port: Number(process.env.PAPER_API_PORT ?? 3001) })
