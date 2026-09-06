import type { NotificationEntry } from './domain/notifications';

declare global {
  interface Window {
    hibiDesktop?: {
      info: () => Promise<{ name: string; version: string; localOnly: boolean }>;
      setOpenAtLogin?: (enabled: boolean) => Promise<boolean>;
      syncNotifications?: (entries: NotificationEntry[]) => Promise<void>;
      showTestNotification?: () => Promise<boolean>;
    };
  }
}
export {};
