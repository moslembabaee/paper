import { writeFile } from 'node:fs/promises'
import { bundlePreviewRuntime } from './dist/src/make/compiler-runtime.js'

// Only Paper's fixed package allowlist enters this build; no project code is read.
await writeFile(new URL('./dist/src/make/preview-runtime.js', import.meta.url), await bundlePreviewRuntime())
