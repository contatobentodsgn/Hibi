import { useEffect, useRef, useState } from 'react';
import type { AssistantTurnState } from '../ai/assistant-turn';
import type { CompanionEvent } from '../companion/contracts';
import { useT } from '../i18n/LocaleProvider';
import { voiceNotice } from './voice-notice';

export type VoiceStart = Readonly<{ notch?: boolean }>;
export type VoiceTurnControls = Readonly<{
  listening: boolean;
  /** O que foi ouvido até agora; volta a vazio depois de enviado. */
  transcript: string;
  notice: string;
  start: (options?: VoiceStart) => Promise<void>;
  stop: () => Promise<void>;
}>;

type Options = Readonly<{
  ask: (text: string) => void;
  turnState: AssistantTurnState;
  onCompanionEvent: (event: CompanionEvent) => void;
  /** Os nomes que o reconhecedor deve favorecer, lidos na hora de começar a ouvir. */
  vocabulary?: () => readonly string[];
}>;

const LISTENING_EXPIRES_MS = 20_000;

/**
 * A voz do Taby, do começo ao fim de um pedido, compartilhada pelo botão Falar, pelo atalho e pelo notch.
 *
 * - A escuta termina sozinha quando a fala para, e o que foi ouvido é enviado — antes era preciso
 *   apertar Parar e depois Enviar. Parar pelo botão continua deixando o texto no campo, para editar.
 * - Com `notch`, o notch mostra "Ouvindo…" e o que vai sendo reconhecido; a resposta chega lá como
 *   qualquer outra resposta do Taby. É o caminho do atalho quando a janela nem aparece.
 * - A resposta de um pedido feito por voz é lida em voz alta, se o ajuste estiver ligado. Quem decide é o
 *   processo principal, que recusa quando o ajuste está desligado.
 */
export function useVoiceTurn({ ask, turnState, onCompanionEvent, vocabulary }: Options): VoiceTurnControls {
  const t = useT();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState('');
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);
  const notchRequest = useRef<string | null>(null);
  const awaitingReply = useRef(false);
  const latest = useRef({ ask, onCompanionEvent, t, vocabulary });
  latest.current = { ask, onCompanionEvent, t, vocabulary };

  const showInNotch = (text: string) => {
    const requestId = notchRequest.current;
    if (requestId) latest.current.onCompanionEvent({ type: 'ai.stage', stage: 'listening', requestId, text, nowMs: Date.now(), expiresInMs: LISTENING_EXPIRES_MS });
  };

  useEffect(() => window.hibiDesktop?.onLocalVoiceText?.((text) => {
    transcriptRef.current = text;
    setTranscript(text);
    showInNotch(text);
  }) ?? (() => undefined), []);

  const start = async ({ notch = false }: VoiceStart = {}) => {
    if (listeningRef.current) return;
    const listen = window.hibiDesktop?.listenLocalVoice;
    if (!listen) { setNotice(latest.current.t('taby.voice.unavailable')); return; }
    listeningRef.current = true;
    transcriptRef.current = '';
    setTranscript('');
    setNotice('');
    setListening(true);
    notchRequest.current = notch ? `voice-${crypto.randomUUID()}` : null;
    // Sem texto ainda: a barra mostra "Ouvindo…" como dica, e o que chega do ditado toma o lugar dela.
    showInNotch('');
    const result = await listen({ autoStop: true, vocabulary: latest.current.vocabulary?.() ?? [] }).catch(() => null);
    listeningRef.current = false;
    setListening(false);
    const requestId = notchRequest.current;
    notchRequest.current = null;
    const heard = transcriptRef.current.trim();
    if (result?.ended === 'silence' && heard) {
      awaitingReply.current = true;
      transcriptRef.current = '';
      setTranscript('');
      // Primeiro o pedido, depois a escuta sai: o "pensando" toma o lugar do "ouvindo" no notch e na
      // barra. Na ordem inversa o mascote voltava ao repouso por um instante — o piscar entre os dois.
      latest.current.ask(heard);
      if (requestId) latest.current.onCompanionEvent({ type: 'presentation.dismissed', requestId });
      return;
    }
    if (requestId) latest.current.onCompanionEvent({ type: 'presentation.dismissed', requestId });
    const message = result?.ended === 'no-speech' ? latest.current.t('voice.noSpeech') : voiceNotice(result, latest.current.t);
    setNotice(message);
    // Sem a janela à vista, o aviso vai para o notch; senão a pessoa não saberia por que nada aconteceu.
    if (requestId && message) latest.current.onCompanionEvent({ type: 'error.raised', requestId: `${requestId}-notice`, text: message, nowMs: Date.now(), expiresInMs: 4_000 });
  };

  const stop = async () => {
    await window.hibiDesktop?.stopLocalVoice?.();
  };

  useEffect(() => {
    if (!awaitingReply.current) return;
    const speak = (text: string) => { if (text.trim()) void window.hibiDesktop?.speakLocalVoice?.(text).catch(() => undefined); };
    if (turnState.status === 'replied') { awaitingReply.current = false; speak(turnState.text); }
    else if (turnState.status === 'confirmation') speak(turnState.text);
    else if (turnState.status === 'executed') { awaitingReply.current = false; speak(turnState.summary); }
    else if (turnState.status === 'failure' || turnState.status === 'cancelled') awaitingReply.current = false;
  }, [turnState]);

  return { listening, transcript, notice, start, stop };
}
