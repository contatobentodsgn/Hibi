// Sugestões dispensadas no Review, guardadas neste Mac. Antes o "Dismiss" vivia só no estado da tela e
// voltava a cada abertura. É preferência de tela, não dado do workspace: fica fora do backup.
export const REVIEW_DISMISSED_KEY = 'hibi-review-dismissed';
const LIMIT = 500;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export function readDismissedSuggestions(storage: Storage | undefined): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(REVIEW_DISMISSED_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function writeDismissedSuggestions(storage: Storage | undefined, ids: ReadonlySet<string>): void {
  try { storage?.setItem(REVIEW_DISMISSED_KEY, JSON.stringify([...ids].slice(-LIMIT))); } catch { /* armazenamento indisponível */ }
}
