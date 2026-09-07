import type { NotificationEntry } from './domain/notifications';
import type { AiProviderRequest } from './ai/contracts';

declare global {
  interface Window {
    hibiDesktop?: {
      info: () => Promise<{ name: string; version: string; localOnly: boolean }>;
      getOpenAtLogin?: () => Promise<boolean>;
      setOpenAtLogin?: (enabled: boolean) => Promise<boolean>;
      syncNotifications?: (entries: NotificationEntry[]) => Promise<void>;
      showTestNotification?: () => Promise<boolean>;
      runAiTurn?: (turn: { request: AiProviderRequest }) => Promise<{ content: string; providerLabel: string; model: string }>;
      cancelAiTurn?: () => Promise<boolean>;
      getAiConfig?: () => Promise<{ provider: 'local' | 'openai-compatible'; endpoint: string; model: string; hasApiKey: boolean }>;
      saveAiConfig?: (config: { provider: 'local' | 'openai-compatible'; endpoint: string; model: string; apiKey?: string }) => Promise<{ provider: 'local' | 'openai-compatible'; endpoint: string; model: string; hasApiKey: boolean }>;
      deleteAiKey?: () => Promise<{ provider: 'local' | 'openai-compatible'; endpoint: string; model: string; hasApiKey: boolean }>;
      showNotch?: (presentation: { requestId: string; kind: string; text: string | null; actions: readonly unknown[]; interaction: 'passthrough' | 'capture' }) => Promise<{ degraded: boolean; requestId: string }>;
      hideNotch?: (requestId: string) => Promise<boolean>;
      resolveNotchAction?: (requestId: string, actionId: 'confirm' | 'cancel') => Promise<boolean>;
      getNotchCapabilities?: () => Promise<{ adapter: 'public' | 'experimental'; experimental: boolean; reason: string | null; bridgeLoaded: boolean; nativePromotion: boolean; screens: readonly { index: number; frame: { x: number; y: number; width: number; height: number }; safeAreaTop: number; hasCameraHousing: boolean }[] }>;
      onCompanionPresentation?: (callback: (presentation: { requestId: string; kind: string; text: string | null; actions: readonly { id: string; label: string }[]; interaction: 'passthrough' | 'capture' }) => void) => () => void;
      onCompanionAction?: (callback: (action: { requestId: string; actionId: 'confirm' | 'cancel' }) => void) => () => void;
      onNotificationTriggered?: (callback: (entry: NotificationEntry) => void) => () => void;
    };
  }
}
export {};
