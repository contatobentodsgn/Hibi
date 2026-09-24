const STORAGE_KEY = 'pixano.contextual-guidance.dismissed.v1';
const MAX_DISMISSED_IDS = 80;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readDismissed(storage: StorageLike): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 100).slice(-MAX_DISMISSED_IDS);
  } catch {
    return [];
  }
}

export function isContextualGuidanceDismissed(id: string, storage = browserStorage()): boolean {
  return storage ? readDismissed(storage).includes(id) : false;
}

export function dismissContextualGuidance(id: string, storage = browserStorage()): void {
  if (!storage || !/^[a-z0-9][a-z0-9.-]{0,99}$/u.test(id)) return;
  const dismissed = readDismissed(storage);
  if (dismissed.includes(id)) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...dismissed, id].slice(-MAX_DISMISSED_IDS)));
  } catch {
    // A storage restriction must not prevent the user from dismissing the suggestion in this view.
  }
}
