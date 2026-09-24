type ModelStatus = 'unavailable' | 'missing' | 'unverified' | 'ready' | 'unknown';
type PermissionStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unavailable' | 'unknown';

const MODEL_STATES = new Set<ModelStatus>(['unavailable', 'missing', 'unverified', 'ready', 'unknown']);
const PERMISSION_STATES = new Set<PermissionStatus>(['not-determined', 'granted', 'denied', 'restricted', 'unavailable', 'unknown']);
const INTEGRATION_STATES = new Set(['connected', 'disconnected', 'error', 'expired']);
const safeText = (value: unknown, max = 80): string | null => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\r\n\0]/.test(value) ? value : null;

/**
 * Privacy boundary for the support file. Deliberately reads only known fields and never accepts or
 * spreads workspace data, error messages, paths, credentials, or integration audit payloads.
 */
export function buildSupportDiagnostics(input: {
  exportedAt: string;
  application: { name: string; version: string; localOnly: boolean };
  platform: string;
  model: { status: string; modelId: string | null; sizeBytes?: number; error?: string | null };
  microphone: { permission: string; voiceAvailable: boolean; error?: string | null };
  integrations: readonly { id: string; label: string; state: string; hasCredential: boolean; error?: string; lastSyncAt?: string }[];
}) {
  const modelStatus = MODEL_STATES.has(input.model?.status as ModelStatus) ? input.model.status as ModelStatus : 'unknown';
  const permission = PERMISSION_STATES.has(input.microphone?.permission as PermissionStatus) ? input.microphone.permission as PermissionStatus : 'unknown';
  const platform = ['darwin', 'win32', 'linux'].includes(input.platform) ? input.platform : 'unknown';
  const integrations = (Array.isArray(input.integrations) ? input.integrations : []).flatMap((item) => {
    const id = safeText(item?.id, 40);
    if (!id || !INTEGRATION_STATES.has(item.state)) return [];
    return [{ id, label: safeText(item.label, 60) ?? id, state: item.state, hasCredential: item.hasCredential === true }];
  });
  return {
    schemaVersion: 1,
    exportedAt: safeText(input.exportedAt, 40) ?? new Date().toISOString(),
    app: {
      name: safeText(input.application?.name, 40) ?? 'Pixano',
      version: safeText(input.application?.version, 40) ?? 'unknown',
      localOnly: input.application?.localOnly === true,
    },
    runtime: { platform },
    model: {
      status: modelStatus,
      modelId: safeText(input.model?.modelId, 60),
      ...(Number.isSafeInteger(input.model?.sizeBytes) && input.model.sizeBytes! >= 0 ? { sizeBytes: input.model.sizeBytes } : {}),
    },
    microphone: { permission, voiceAvailable: input.microphone?.voiceAvailable === true },
    integrations,
  } as const;
}
