import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedDiagnostics, validateAppInBrowser } from '../dist/server/app-validation.js'
import { redactSensitiveText } from '../dist/src/make/model-protocol.js'

test('diagnostic caps apply after redaction, including embedded image payloads', () => {
  const input = Array.from({ length: 30 }, () => ({ file: 'src/App.tsx', line: 1, column: 1, code: 'RUNTIME_ERROR', severity: 'error', message: 'sk-abcdefghijk data:image/jpeg;base64,PRIVATEIMAGE ' + 'x'.repeat(2000) }))
  const result = boundedDiagnostics(input, redactSensitiveText)
  assert.equal(result.length, 8)
  assert.ok(result.every(d => d.message.length <= 500))
  assert.doesNotMatch(JSON.stringify(result), /sk-abcdefghijk|PRIVATEIMAGE/)
})

test('missing browser and pre-aborted validation return blockers, never passing results or screenshots', async () => {
  const previous = process.env.PAPER_VALIDATION_CHROMIUM
  process.env.PAPER_VALIDATION_CHROMIUM = '/nonexistent/paper-validation-browser'
  try {
    for (const aborted of [false, true]) {
      const controller = new AbortController()
      if (aborted) controller.abort()
      const result = await validateAppInBrowser({ entryPoint: 'src/App.tsx', html: '<main>Candidate</main>', js: '', css: '' }, controller.signal)
      assert.equal(result.status, 'blocked')
      assert.deepEqual(result.screenshots, [])
      assert.equal(result.diagnostics.at(-1).code, 'VALIDATION_BLOCKED')
    }
  } finally {
    if (previous === undefined) delete process.env.PAPER_VALIDATION_CHROMIUM
    else process.env.PAPER_VALIDATION_CHROMIUM = previous
  }
})
