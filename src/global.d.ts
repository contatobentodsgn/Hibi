import type { NotificationEntry } from "./domain/notifications";
import type { FocusSettings } from "../electron/focus-gate.mjs";
import type {
  PresenceEvent,
  PresenceWatchRequest,
} from "../electron/focus-presence.mjs";
import type { ImportCandidate } from "./integrations/imports";
import type {
  AiNormalizedUsage,
  AiProviderRequest,
  AiProviderStreamEvent,
} from "./ai/contracts";
import type {
  ConnectorSettings,
  IntegrationAuditEvent,
  IntegrationAuthorization,
  IntegrationExecutionResult,
  IntegrationImportTarget,
  IntegrationStatus,
  NotionDataSourceDiscovery,
  PreparedIntegrationAction,
} from "./integrations/contracts";
import type { NotchDisplayState, NotchTestResult } from "./ui/notch-display";
import type { StudyData } from "./domain/models";

declare global {
  interface Window {
    hibiDesktop?: {
      info: () => Promise<{
        name: string;
        version: string;
        localOnly: boolean;
      }>;
      getUpdateState?: () => Promise<{ status: string; version: string | null; error: string | null; percent?: number }>;
      checkForUpdate?: () => Promise<{ status: string; version: string | null; error: string | null; percent?: number }>;
      downloadUpdate?: () => Promise<{ status: string; version: string | null; error: string | null; percent?: number }>;
      installUpdate?: () => Promise<void>;
      getLocalModelState?: () => Promise<{ status: string; modelId: string | null; error: string | null }>;
      runLocalModel?: (input: { requestId: string; prompt: string }) => Promise<{ requestId: string | null; status: string; text: string }>;
      cancelLocalModel?: (requestId: string) => Promise<void>;
      shutdownLocalModel?: () => Promise<void>;
      getLocalVoiceState?: () => Promise<{ status: string; locale: string; error: string | null }>;
      setLocalVoiceLocale?: (locale: string) => Promise<{ status: string; locale: string; error: string | null }>;
      stopLocalVoice?: () => Promise<{ status: string; locale: string; error: string | null }>;
      getDeviceState?: () => Promise<{ status: string; firmwareVersion: string | null; capabilities: string[] }>;
      connectDevice?: () => Promise<{ status: string; firmwareVersion: string | null; capabilities: string[] }>;
      closeDevice?: () => Promise<void>;
      onUpdateState?: (callback: (state: { status: string; version: string | null; error: string | null; percent?: number }) => void) => () => void;
      loadWorkspace?: () => Promise<StudyData | null>;
      saveWorkspace?: (data: StudyData) => Promise<StudyData>;
      migrateLegacyWorkspace?: (json: string) => Promise<boolean>;
      getOpenAtLogin?: () => Promise<boolean>;
      setOpenAtLogin?: (enabled: boolean) => Promise<boolean>;
      syncNotifications?: (
        entries: NotificationEntry[],
        context?: { settings: FocusSettings; focusUntilMs: number | null },
      ) => Promise<void>;
      showTestNotification?: () => Promise<boolean>;
      runAiTurn?: (turn: {
        request: AiProviderRequest;
        correlationId: string;
      }) => Promise<{
        content: string;
        providerLabel: string;
        model: string;
        requestId?: string;
        correlationId?: string;
        usage?: AiNormalizedUsage;
      }>;
      cancelAiTurn?: (request: {
        correlationId: string;
        requestId?: string;
      }) => Promise<boolean>;
      onAiStreamEvent?: (
        callback: (
          event: AiProviderStreamEvent & {
            requestId: string;
            correlationId: string;
          },
        ) => void,
      ) => () => void;
      getAiConfig?: () => Promise<{
        provider: "local" | "openai-compatible";
        endpoint: string;
        model: string;
        hasApiKey: boolean;
      }>;
      saveAiConfig?: (config: {
        provider: "local" | "openai-compatible";
        endpoint: string;
        model: string;
        apiKey?: string;
      }) => Promise<{
        provider: "local" | "openai-compatible";
        endpoint: string;
        model: string;
        hasApiKey: boolean;
      }>;
      deleteAiKey?: () => Promise<{
        provider: "local" | "openai-compatible";
        endpoint: string;
        model: string;
        hasApiKey: boolean;
      }>;
      listIntegrationStatus?: () => Promise<readonly IntegrationStatus[]>;
      connectIntegration?: (
        connectorId: string,
        credential: string,
      ) => Promise<IntegrationStatus>;
      listIntegrationAudit?: () => Promise<readonly IntegrationAuditEvent[]>;
      revokeIntegration?: (connectorId: string) => Promise<IntegrationStatus>;
      prepareIntegrationAction?: (input: {
        connectorId: string;
        kind: string;
        payload: Record<string, unknown>;
      }) => Promise<PreparedIntegrationAction>;
      executeApprovedIntegrationAction?: (input: {
        actionId: string;
        confirmationId: string;
      }) => Promise<IntegrationExecutionResult>;
      syncLocalApiWorkspace?: (workspace: {
        tasks: readonly unknown[];
        reminders: readonly unknown[];
        blocks: readonly unknown[];
      }) => Promise<void>;
      startLocalApi?: () => Promise<{ origin: string }>;
      stopLocalApi?: () => Promise<{ running: false }>;
      getLocalApiStatus?: () => Promise<{ running: boolean }>;
      testIntegrationConnection?: (
        connectorId: string,
      ) => Promise<{ ok: boolean; detail: string }>;
      listIntegrationImportTargets?: (
        connectorId: string,
      ) => Promise<readonly IntegrationImportTarget[]>;
      listIntegrationImportCandidates?: (
        connectorId: string,
      ) => Promise<readonly ImportCandidate[]>;
      discoverNotionDataSource?: (
        databaseId: string,
      ) => Promise<NotionDataSourceDiscovery>;
      getConnectorSettings?: (
        connectorId: string,
      ) => Promise<ConnectorSettings>;
      saveConnectorSettings?: (
        connectorId: string,
        patch: Partial<ConnectorSettings>,
      ) => Promise<ConnectorSettings>;
      isOauthSupported?: (connectorId: string) => Promise<boolean>;
      authorizeIntegration?: (
        connectorId: string,
      ) => Promise<IntegrationAuthorization>;
      refreshIntegrationAuthorization?: (
        connectorId: string,
      ) => Promise<IntegrationAuthorization>;
      cancelIntegrationAuthorization?: () => Promise<void>;
      saveOauthClientSecret?: (connectorId: string, secret: string) => Promise<{ connectorId: string; configured: boolean }>;
      deleteOauthClientSecret?: (connectorId: string) => Promise<{ connectorId: string; configured: boolean }>;
      getCalendarSyncState?: () => Promise<
        import("./ui/calendar-sync").CalendarSyncState
      >;
      requestAppleCalendarAccess?: () => Promise<{
        state: "connected";
        syncedAt: string;
      }>;
      discoverGoogleCalendars?: () => Promise<
        readonly { id: string; label: string }[]
      >;
      readCalendarSyncEvents?: (input: {
        start: string;
        end: string;
        calendars: readonly { sourceId: "apple" | "google"; id: string }[];
      }) => Promise<
        readonly {
          sourceId: "apple" | "google";
          calendarId: string;
          remoteId: string;
          revision?: string;
          title: string;
          startsAt: string;
          endsAt: string;
          allDay: boolean;
          writable: boolean;
          cancelled?: boolean;
        }[]
      >;
      saveCalendarSyncMode?: (input: {
        id: string;
        mode: import("./ui/calendar-sync").CalendarSyncMode;
      }) => Promise<import("./ui/calendar-sync").CalendarSyncState>;
      prepareCalendarPublish?: (input: {
        calendarId: string;
        block: {
          id: string;
          title: string;
          startsAt: string;
          endsAt: string;
          allDay?: boolean;
        };
      }) => Promise<{
        id: string;
        confirmationId: string;
        requiresConfirmation: true;
        calendarId: string;
        summary: string;
      }>;
      executeApprovedCalendarPublish?: (input: {
        actionId: string;
        confirmationId: string;
      }) => Promise<{ remoteId: string }>;
      prepareCalendarUpdate?: (input: {
        calendarId: string;
        block: {
          id: string;
          title: string;
          startsAt: string;
          endsAt: string;
          allDay?: boolean;
        };
      }) => Promise<{
        id: string;
        confirmationId: string;
        requiresConfirmation: true;
        calendarId: string;
        summary: string;
      }>;
      resolveCalendarConflict?: (input: {
        id: string;
        choice: "keep-calendar" | "keep-hibi";
      }) => Promise<
        | { resolved: true; choice: "keep-calendar" }
        | {
            resolved: false;
            choice: "keep-hibi";
            action: {
              id: string;
              confirmationId: string;
              requiresConfirmation: true;
              calendarId: string;
              summary: string;
            };
          }
      >;
      configureWebhook?: (
        secret: string,
      ) => Promise<{ running: boolean; hasSecret: boolean; origin?: string }>;
      startWebhook?: () => Promise<{
        running: boolean;
        hasSecret: boolean;
        origin?: string;
      }>;
      stopWebhook?: () => Promise<{
        running: boolean;
        hasSecret: boolean;
        origin?: string;
      }>;
      getWebhookStatus?: () => Promise<{
        running: boolean;
        hasSecret: boolean;
        origin?: string;
      }>;
      resolveLocalApiWrite?: (input: {
        confirmationId: string;
        approved: boolean;
      }) => Promise<{ resolved: boolean; approved?: boolean }>;
      showNotch?: (presentation: {
        requestId: string;
        kind: string;
        text: string | null;
        actions: readonly unknown[];
        interaction: "passthrough" | "capture";
      }) => Promise<{
        degraded: boolean;
        requestId: string;
        host?: "native" | "electron";
      }>;
      hideNotch?: (requestId: string) => Promise<boolean>;
      resolveNotchAction?: (
        requestId: string,
        actionId: "confirm" | "cancel",
      ) => Promise<boolean>;
      getNotchPresentation?: () => Promise<{
        requestId: string;
        kind: string;
        text: string | null;
        actions: readonly { id: string; label: string }[];
        interaction: "passthrough" | "capture";
      } | null>;
      getNotchCapabilities?: () => Promise<{
        adapter: "public" | "experimental";
        experimental: boolean;
        reason: string | null;
        bridgeLoaded: boolean;
        nativePromotion: boolean;
        nativeHost: boolean;
        screens: readonly {
          index: number;
          displayId?: number;
          frame: { x: number; y: number; width: number; height: number };
          safeAreaTop: number;
          hasCameraHousing: boolean;
        }[];
        host: {
          available: boolean;
          created?: boolean;
          visible?: boolean;
          interactive?: boolean;
          displayId?: number;
          host?: "native" | "electron";
        };
      }>;
      listNotchDisplays?: () => Promise<NotchDisplayState>;
      setNotchDisplay?: (
        displayId: number | null,
      ) => Promise<NotchDisplayState>;
      getNotchSize?: () => Promise<{ size: 'normal' | 'compact' }>;
      setNotchSize?: (size: 'normal' | 'compact') => Promise<{ size: 'normal' | 'compact' }>;
      testNotch?: (locale: "pt" | "en") => Promise<NotchTestResult>;
      onNotchDisplaysChanged?: (callback: () => void) => () => void;
      onCompanionPresentation?: (
        callback: (presentation: {
          requestId: string;
          kind: string;
          text: string | null;
          actions: readonly { id: string; label: string }[];
          interaction: "passthrough" | "capture";
        }) => void,
      ) => () => void;
      onCompanionAction?: (
        callback: (action: {
          requestId: string;
          actionId: "confirm" | "cancel";
        }) => void,
      ) => () => void;
      onNotificationTriggered?: (
        callback: (entry: NotificationEntry) => void,
      ) => () => void;
      watchFocusPresence?: (
        request: PresenceWatchRequest,
      ) => Promise<{ watching: boolean }>;
      onFocusPresence?: (
        callback: (event: PresenceEvent) => void,
      ) => () => void;
      onLocalApiConfirmation?: (
        callback: (intent: {
          confirmationId: string;
          kind: string;
          payload: Record<string, unknown>;
        }) => void,
      ) => () => void;
    };
  }
}
export {};
