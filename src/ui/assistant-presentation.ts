import type { AiProviderFailure } from '../ai/contracts';
import type { CompanionEvent } from '../companion/contracts';

export const confirmationPresentationFor = (requestId: string, text: string) => ({ requestId, kind: 'confirmation', text, interaction: 'capture' as const, actions: [{ id: 'confirm', label: 'Confirmar' }, { id: 'cancel', label: 'Cancelar' }] });
export const failurePresentationFor = (failure: AiProviderFailure) => {
  if (failure.code === 'invalid_credentials') return { title: 'Check the API key', detail: 'The configured provider rejected its credentials. Your key remains in Keychain.', canRetry: false, canUseLocalFallback: true };
  if (failure.code === 'rate_limited') return { title: 'Rate limit reached', detail: `The provider is temporarily limiting requests.${failure.retryAfterMs ? ` Try again in about ${Math.max(1, Math.ceil(failure.retryAfterMs / 1_000))} seconds.` : ''}`, canRetry: true, canUseLocalFallback: true };
  if (failure.code === 'unavailable') return { title: 'Provider unavailable', detail: 'The provider is temporarily unavailable. You can retry or continue locally.', canRetry: true, canUseLocalFallback: true };
  if (failure.code === 'cancelled') return { title: 'Request cancelled', detail: 'No action was performed.', canRetry: true, canUseLocalFallback: false };
  // O pedido é que foi recusado (endpoint ou id de modelo errado): oferecer "tentar de novo" aqui
  // só repetiria a mesma configuração inválida, então a saída é corrigir os Ajustes ou ir de local.
  if (failure.code === 'invalid_request') return { title: 'Check the endpoint and model', detail: 'The provider rejected the request itself. Check the endpoint and the model id in AI settings; retrying will not help.', canRetry: false, canUseLocalFallback: true };
  return { title: 'Invalid provider response', detail: 'The provider returned an invalid response. No action was performed.', canRetry: true, canUseLocalFallback: true };
};
export const companionEventFor = (kind: 'listening' | 'thinking' | 'acting' | 'confirmation' | 'result' | 'error', requestId: string, text: string, nowMs: number): CompanionEvent => {
  if (kind === 'confirmation') return { type: 'confirmation.requested', requestId, text, nowMs, expiresInMs: 60_000, actions: confirmationPresentationFor(requestId, text).actions };
  if (kind === 'result') return { type: 'ai.result', requestId, text, nowMs, expiresInMs: 4_000 };
  if (kind === 'error') return { type: 'error.raised', requestId, text, nowMs, expiresInMs: 5_000 };
  return { type: 'ai.stage', requestId, stage: kind, text, nowMs };
};
