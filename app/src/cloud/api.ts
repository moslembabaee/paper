import type { CloudProject, CloudUser } from './model'

export interface CloudSession { user: CloudUser | null; providers: { google: boolean; github: boolean } }
export class ApiError extends Error {
  status: number
  current?: CloudProject | null
  constructor(status: number, message: string, current?: CloudProject | null) { super(message); this.status = status; this.current = current }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Paper-Client': 'web', ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(10_000),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError(503, 'Cloud is unavailable on this host')
  const value = await response.json()
  if (!response.ok) throw new ApiError(response.status, value.error ?? 'Cloud request failed', value.current)
  return value as T
}
