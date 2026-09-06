export type AdapterId =
  | 'local-persistence'
  | 'native-notifications'
  | 'launch-at-login'
  | 'external-ai'
  | 'hardware';

export type AdapterStatus = 'available' | 'unavailable';
export type AdapterScope = 'local' | 'external' | 'hardware';

export interface AdapterStatusEntry {
  id: AdapterId;
  label: string;
  status: AdapterStatus;
  scope: AdapterScope;
}

const OFFLINE_SAFE_ADAPTER_STATUSES: readonly AdapterStatusEntry[] = [
  { id: 'local-persistence', label: 'Local persistence', status: 'available', scope: 'local' },
  { id: 'native-notifications', label: 'Native notifications', status: 'available', scope: 'local' },
  { id: 'launch-at-login', label: 'Launch at login', status: 'available', scope: 'local' },
  { id: 'external-ai', label: 'External AI', status: 'unavailable', scope: 'external' },
  { id: 'hardware', label: 'Hardware', status: 'unavailable', scope: 'hardware' },
];

export function getCurrentAdapterStatuses(): AdapterStatusEntry[] {
  return OFFLINE_SAFE_ADAPTER_STATUSES.map((adapter) => ({ ...adapter }));
}
