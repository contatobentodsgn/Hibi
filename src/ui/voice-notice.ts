import type { DictionaryKey } from '../i18n/dictionary';

export type VoiceResult = Readonly<{ status: string; error: string | null; reason?: string | null }> | null;

/**
 * O que a tela diz quando uma escuta termina.
 *
 * Terminar bem não é aviso: antes, qualquer fim — inclusive o de quem clicou em "Parar voz" —
 * mostrava "A voz existe no app de desktop…", como se a voz não existisse. E quando o helper
 * explicava o motivo (permissão, idioma sem modelo no Mac, sem microfone), a tela o descartava.
 */
export function voiceNotice(result: VoiceResult, t: (key: DictionaryKey) => string): string {
  if (!result) return t('assistant.voice.unavailable');
  if (result.status === 'ready' || result.status === 'listening') return '';
  if (result.status === 'unavailable') return t('assistant.voice.unavailable');
  if (result.reason === 'permission') return t('voice.error.permission');
  if (result.reason === 'no-on-device') return t('voice.error.noOnDevice');
  if (result.reason === 'no-microphone') return t('voice.error.noMicrophone');
  return result.error || t('voice.error.generic');
}
