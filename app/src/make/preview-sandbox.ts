// Bounded message protocol and isolation policy for Paper Make previews.
// Preview iframes run in an opaque origin with restrictive CSP and no credential or navigation privileges.

export const PREVIEW_SANDBOX_POLICY = 'allow-scripts' as const

export const PREVIEW_CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'none'"],
  'script-src': ["'unsafe-inline'", 'data:'],
  'style-src': ["'unsafe-inline'", 'data:'],
  'img-src': ['data:', 'blob:'],
  'font-src': ['data:'],
  'connect-src': ["'none'"],
  'media-src': ['data:', 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-src': ["'none'"],
  'worker-src': ["'none'"],
  'manifest-src': ["'none'"],
  'webrtc': ["'block'"],
})

export const PREVIEW_CSP_HEADER = Object.entries(PREVIEW_CSP_DIRECTIVES)
  .map(([key, values]) => `${key} ${values.join(' ')}`)
  .join('; ')

export const PREVIEW_MESSAGE_CHANNEL = 'paper-make-preview' as const
export const PREVIEW_PROTOCOL_VERSION = 1 as const
export const MAX_PREVIEW_MESSAGE_BYTES = 64 * 1024 // 64 KiB maximum message payload

export type PreviewHostMessageType =
  | 'preview:ping'
  | 'preview:set-theme'
  | 'preview:reset'

export type PreviewGuestMessageType =
  | 'preview:ready'
  | 'preview:pong'
  | 'preview:error'
  | 'preview:event'
  | 'preview:console'

export type PreviewMessageType = PreviewHostMessageType | PreviewGuestMessageType

export interface PreviewThemeConfig {
  readonly mode?: 'dark' | 'light'
  readonly background?: string
  readonly foreground?: string
  readonly accent?: string
  readonly grid?: string
}

export interface PreviewReadyPayload {
  readonly entryPoint: string
  readonly timestamp: number
}

export interface PreviewErrorPayload {
  readonly message: string
  readonly stack?: string
  readonly source?: string
  readonly line?: number
  readonly column?: number
}

export interface PreviewPongPayload {
  readonly pingId?: string
  readonly timestamp: number
}

export interface PreviewPingPayload {
  readonly pingId?: string
  readonly timestamp: number
}

export interface PreviewEventPayload {
  readonly name: string
  readonly data?: unknown
}

export interface PreviewMessageEnvelope<TType extends string = string, TPayload = unknown> {
  readonly channel: typeof PREVIEW_MESSAGE_CHANNEL
  readonly version: typeof PREVIEW_PROTOCOL_VERSION
  readonly source: 'paper-host' | 'paper-preview'
  readonly type: TType
  readonly id: string
  readonly timestamp: number
  readonly payload: TPayload
}

// Keep the validator self-contained: the exact same code runs in the trusted
// relay and in the guest. Do not reference module bindings from this function.
function validateEnvelope(raw: unknown, expectedSource: string | undefined, maxBytes: number): string | null {
  try {
    let budget = maxBytes
    let nodes = 0
    const seen = new Set<object>()
    function visit(value: unknown, depth: number): boolean {
      if (++nodes > 4096 || depth > 16 || budget < 0) return false
      if (value === null || typeof value === 'boolean') { budget -= 5; return true }
      if (typeof value === 'number') { budget -= 24; return Number.isFinite(value) }
      if (typeof value === 'string') { budget -= value.length; return budget >= 0 }
      if (!value || typeof value !== 'object' || seen.has(value)) return false
      const proto = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return false
      seen.add(value)
      const keys = Object.keys(value)
      if (keys.length > 4096 || Object.getOwnPropertySymbols(value).length) return false
      for (const key of keys) {
        budget -= key.length + 4
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !('value' in descriptor) || !visit(descriptor.value, depth + 1)) return false
      }
      seen.delete(value)
      return budget >= 0
    }
    if (!visit(raw, 0)) return 'Payload is not bounded JSON data or exceeds byte limit'
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Message must be an object'
    const m = raw as Record<string, unknown>
    if (Object.keys(m).sort().join(',') !== 'channel,id,payload,source,timestamp,type,version') return 'Invalid envelope fields'
    if (m.channel !== 'paper-make-preview' || m.version !== 1) return 'Invalid channel or version'
    if (m.source !== 'paper-host' && m.source !== 'paper-preview') return 'Invalid message source'
    if (expectedSource && m.source !== expectedSource) return 'Unexpected source'
    if (typeof m.id !== 'string' || !m.id || m.id.length > 64) return 'Invalid message ID'
    if (typeof m.timestamp !== 'number' || !Number.isFinite(m.timestamp) || m.timestamp <= 0) return 'Invalid timestamp'
    const payload = m.payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Payload must be an object'
    const p = payload as Record<string, unknown>
    const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
    const time = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0
    let valid = false
    if (m.source === 'paper-host') {
      if (m.type === 'preview:ping') valid = time(p.timestamp) && (p.pingId === undefined || text(p.pingId, 64))
      if (m.type === 'preview:reset') valid = Object.keys(p).length === 0
      if (m.type === 'preview:set-theme') valid = Object.entries(p).every(([key, value]) =>
        key === 'mode' ? value === 'dark' || value === 'light' :
        ['background', 'foreground', 'accent', 'grid'].includes(key) && text(value, 128))
    } else {
      if (m.type === 'preview:ready') valid = text(p.entryPoint, 256) && time(p.timestamp)
      if (m.type === 'preview:pong') valid = time(p.timestamp) && (p.pingId === undefined || text(p.pingId, 64))
      if (m.type === 'preview:error') valid = text(p.message, 8192) &&
        (p.stack === undefined || text(p.stack, 16384)) && (p.source === undefined || text(p.source, 1024)) &&
        [p.line, p.column].every(v => v === undefined || (Number.isSafeInteger(v) && (v as number) >= 0))
      if (m.type === 'preview:event') valid = text(p.name, 128) && (p.name as string).length > 0
      if (m.type === 'preview:console') valid = ['log', 'warn', 'error', 'info'].includes(p.level as string) &&
        Array.isArray(p.args) && p.args.length <= 16 && p.args.every(arg => text(arg, 4096))
    }
    if (!valid) return 'Invalid message type or payload'
    if (new TextEncoder().encode(JSON.stringify(raw)).length > maxBytes) return 'Message exceeds byte limit'
    return null
  } catch {
    return 'Payload could not be serialized safely'
  }
}

export function isAllowedPreviewSandbox(sandbox: unknown): boolean {
  return typeof sandbox === 'string' && sandbox.trim() === PREVIEW_SANDBOX_POLICY
}

let messageSequence = 0
export function createPreviewMessage<TType extends PreviewMessageType, TPayload>(
  source: 'paper-host' | 'paper-preview', type: TType, payload: TPayload, id?: string,
): PreviewMessageEnvelope<TType, TPayload> {
  const message = {
    channel: PREVIEW_MESSAGE_CHANNEL, version: PREVIEW_PROTOCOL_VERSION, source, type,
    id: id ?? `msg-${Date.now()}-${++messageSequence}`, timestamp: Date.now(), payload,
  }
  const error = validateEnvelope(message, source, MAX_PREVIEW_MESSAGE_BYTES)
  if (error) throw new Error(`Preview message payload exceeds maximum or is invalid: ${error}`)
  return Object.freeze(message)
}

export type ParsePreviewMessageResult =
  | { readonly valid: true; readonly message: PreviewMessageEnvelope<PreviewMessageType> }
  | { readonly valid: false; readonly error: string }

export function parsePreviewMessage(raw: unknown, expectedSource?: 'paper-host' | 'paper-preview'): ParsePreviewMessageResult {
  const error = validateEnvelope(raw, expectedSource, MAX_PREVIEW_MESSAGE_BYTES)
  return error ? { valid: false, error } : { valid: true, message: raw as PreviewMessageEnvelope<PreviewMessageType> }
}

export const PREVIEW_PERMISSIONS_POLICY = "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'"
export const MAX_PREVIEW_MESSAGES_PER_SECOND = 120

function protocolRuntime(): string {
  return `const validate = ${validateEnvelope.toString()};
    const MAX_BYTES = ${MAX_PREVIEW_MESSAGE_BYTES};
    let windowStart = 0, count = 0;
    function accept(data, source) {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      if (++count > ${MAX_PREVIEW_MESSAGES_PER_SECOND}) return false;
      return validate(data, source, MAX_BYTES) === null;
    }`
}

export function getPreviewGuestScript(): string {
  return `(function() {
    ${protocolRuntime()}
    let sequence = 0;
    function send(type, payload) {
      const message = { channel: 'paper-make-preview', version: 1, source: 'paper-preview',
        type, id: 'guest-' + (++sequence), timestamp: Date.now(), payload };
      if (accept(message, 'paper-preview')) parent.postMessage(message, '*');
    }
    window.__paperNotifyReady = function(entryPoint) {
      send('preview:ready', { entryPoint, timestamp: Date.now() });
    };
    window.__paperNotifyError = function(error) {
      const payload = { message: String(error && error.message || error).slice(0, 8192) };
      if (error && error.stack) payload.stack = String(error.stack).slice(0, 16384);
      send('preview:error', payload);
    };
    addEventListener('error', event => window.__paperNotifyError(event.error || event.message));
    addEventListener('unhandledrejection', event => window.__paperNotifyError(event.reason));
    addEventListener('message', event => {
      if (event.source !== parent || !accept(event.data, 'paper-host')) return;
      const { type, id, payload } = event.data;
      if (type === 'preview:ping') send('preview:pong', { pingId: payload.pingId || id, timestamp: Date.now() });
      if (type === 'preview:set-theme') {
        const root = document.documentElement;
        for (const [key, name] of Object.entries({ background: '--paper-bg', foreground: '--paper-fg', accent: '--paper-accent', grid: '--paper-grid' })) {
          if (payload[key]) root.style.setProperty(name, payload[key]);
        }
        if (payload.mode) root.dataset.theme = payload.mode;
      }
    });
  })();`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// All untrusted bytes stay in a JS string literal, never HTML or executable code.
function scriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/**
 * A trusted outer document owns the untrusted iframe. Its frame-src policy also
 * blocks that child's self-navigation (the child's own connect-src cannot).
 * about:srcdoc needs no network request and inherits the outer CSP.
 * Never insert generated code in this document's execution context.
 */
export function createIsolatedPreviewDocument(html: string): string {
  return `<!doctype html><html lang="en"><head>
    <meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP_HEADER}">
    <meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off"><title>Paper Preview Boundary</title>
    <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block;overflow:hidden;background:#080808}</style>
    </head><body><iframe title="Compiled app" sandbox="${PREVIEW_SANDBOX_POLICY}" allow="${PREVIEW_PERMISSIONS_POLICY}" credentialless referrerpolicy="no-referrer"></iframe>
    <script>(function() {
      ${protocolRuntime()}
      const frame = document.querySelector('iframe');
      addEventListener('message', event => {
        if (event.source === frame.contentWindow && event.origin === 'null' && accept(event.data, 'paper-preview')) {
          parent.postMessage(event.data, '*');
        } else if (event.source === parent && accept(event.data, 'paper-host')) {
          frame.contentWindow.postMessage(event.data, '*');
        }
      });
      frame.srcdoc = ${scriptString(html)};
    })();</script></body></html>`
}

export interface GeneratePreviewHtmlOptions {
  readonly js: string
  readonly css: string
  readonly entryPoint?: string
  readonly title?: string
  readonly extraBaseCss?: string
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Compiled app document; always mount it through PreviewFrame's trusted boundary. */
export function generatePreviewHtml({ js, css, entryPoint = 'src/App.tsx', title = 'Paper Preview', extraBaseCss = '' }: GeneratePreviewHtmlOptions): string {
  return `<!doctype html><html lang="en"><head>
    <meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP_HEADER}">
    <meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="paper-entry-point" content="${escapeHtml(entryPoint)}"><title>${escapeHtml(title)}</title>
    <style id="paper-preview-base">
      *,*::before,*::after{box-sizing:border-box}
      :root{--paper-bg:#080808;--paper-fg:#edebe1;--paper-accent:#81adec;--paper-grid:#222222}
      html,body{margin:0;padding:0;width:100%;height:100%;background-color: #080808;background-color:var(--paper-bg);color:var(--paper-fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
      #root{width:100%;min-height:100%;display:flex;flex-direction:column}
    </style>
    <link rel="stylesheet" href="data:text/css;base64,${toBase64(extraBaseCss + '\n' + css)}">
    <script>${getPreviewGuestScript()}</script></head><body><div id="root"></div>
    <script src="data:text/javascript;base64,${toBase64(js)}"></script></body></html>`
}
