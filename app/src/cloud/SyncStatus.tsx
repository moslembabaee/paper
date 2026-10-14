import { Check, CloudOff, HardDrive, LoaderCircle, RefreshCw } from 'lucide-react'
import type { SyncState } from './useCloudSync'

interface Props {
  state: SyncState
  status: string
  localStatus: string
  persistent: boolean
  error: string
  onRetry: () => void
}

export function SyncStatus({ state, status, localStatus, persistent, error, onRetry }: Props) {
  const localError = !persistent || localStatus.startsWith('Save unavailable')
  const saving = localStatus === 'Saving locally…'
  const retryable = ['offline', 'auth-required', 'error'].includes(state)
  const label = localError ? 'Save JSON to keep edits' : saving ? 'Saving locally…' : state === 'local' ? 'Saved on this device' : status
  const Icon = localError || retryable ? CloudOff : saving || state === 'syncing' ? LoaderCircle : state === 'synced' ? Check : HardDrive
  return <div className="sync-indicator" data-state={localError ? 'error' : state}>
    <span className="cloud-status" data-testid="sync-status" data-state={localError ? 'error' : state} role="status" aria-live="polite" title={localError ? 'Local storage is unavailable. Export a JSON copy to keep your work.' : error || 'Edits save on this device first. Cloud sync runs in the background.'}>
      <Icon size={12} aria-hidden="true" className={saving || state === 'syncing' ? 'sync-spinner' : undefined} />{label}
    </span>
    {retryable && !localError && <button type="button" className="sync-retry" aria-label="Retry cloud sync" title="Retry cloud sync" onClick={onRetry}><RefreshCw size={12} /></button>}
  </div>
}
