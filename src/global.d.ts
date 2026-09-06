import type { NotificationEntry } from './domain/notifications';

declare global {
  interface Window {
    hibiDesktop?: {
      info: () => Promise<{ name: string; version: string; localOnly: boolean }>;
      getOpenAtLogin?: () => Promise<boolean>;
      setOpenAtLogin?: (enabled: boolean) => Promise<boolean>;
      syncNotifications?: (entries: NotificationEntry[]) => Promise<void>;
      showTestNotification?: () => Promise<boolean>;
      runAiTurn?: (turn: { message: string; surface: 'desktop' | 'notch' }) => Promise<{ reply: string; providerLabel: string }>;
      cancelAiTurn?: () => Promise<boolean>;
      showNotch?: (presentation: { requestId: string; kind: string; text: string | null; actions: readonly unknown[]; interaction: 'passthrough' | 'capture' }) => Promise<{ degraded: boolean; requestId: string }>;
      hideNotch?: (requestId: string) => Promise<boolean>;
    };
  }
}
export {};
