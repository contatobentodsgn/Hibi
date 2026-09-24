import { useEffect, useRef, useState } from 'react';
import type { AssistantTurnState } from '../ai/assistant-turn';
import type { CompanionEvent } from '../companion/contracts';
import { useT } from '../i18n/LocaleProvider';
import { voiceNotice } from './voice-notice';
import { correctToVocabulary } from '../ai/voice-vocabulary';

export type VoiceStart = Readonly<{ notch?: boolean }>;
export type VoiceTurnControls = Readonly<{
  listening: boolean;
  speaking: boolean;
  sendMode: 'pause' | 'manual';
  setSendMode: (mode: 'pause' | 'manual') => Promise<void>;
  statusText: string;
  stopSpeaking: () => Promise<void>;
  clearTranscript: () => void;
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
 * A voz do Assistant, do começo ao fim de um pedido, compartilhada pelo botão Falar, pelo atalho e pelo notch.
 *
 * - A escuta termina sozinha quando a fala para, e o que foi ouvido é enviado — antes era preciso
 *   apertar Parar e depois Enviar. Parar pelo botão continua deixando o texto no campo, para editar.
 * - Com `notch`, o notch mostra "Ouvindo…" e o que vai sendo reconhecido; a resposta chega lá como
 *   qualquer outra resposta do Assistant. É o caminho do atalho quando a janela nem aparece.
 * - A resposta de um pedido feito por voz é lida em voz alta, se o ajuste estiver ligado. Quem decide é o
 *   processo principal, que recusa quando o ajuste está desligado.
 */
export function useVoiceTurn({ ask, turnState, onCompanionEvent, vocabulary }: Options): VoiceTurnControls {
  const t = useT();
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sendMode, setSendModeState] = useState<'pause' | 'manual'>('pause');
  const [statusText, setStatusText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState('');
  const transcriptRef = useRef('');
  const vocabularyRef = useRef<readonly string[]>([]);
  const listeningRef = useRef(false);
  const notchRequest = useRef<string | null>(null);
  const awaitingReply = useRef(false);
  const speakingRequest = useRef(0);
  const lastSpokenTurn = useRef('');
  const sendModeRef = useRef<'pause' | 'manual'>('pause');
  const latest = useRef({ ask, onCompanionEvent, t, vocabulary });
  latest.current = { ask, onCompanionEvent, t, vocabulary };

  const showInNotch = (text: string) => {
    const requestId = notchRequest.current;
    if (requestId) latest.current.onCompanionEvent({ type: 'ai.stage', stage: 'listening', requestId, text, nowMs: Date.now(), expiresInMs: LISTENING_EXPIRES_MS });
  };

  // Os nomes do Hibi são corrigidos aqui, no que aparece na barra e no que vai para o Assistant: o reconhecedor
  // ainda escreve "cabrito" às vezes, mesmo com o vocabulário.
  useEffect(() => window.pixanoDesktop?.onLocalVoiceText?.((heard) => {
    const text = correctToVocabulary(heard, vocabularyRef.current);
    transcriptRef.current = text;
    setTranscript(text);
    setStatusText(text);
    showInNotch(text);
  }) ?? (() => undefined), []);

  useEffect(() => {
    const bridge = window.pixanoDesktop;
    void bridge?.getVoiceSettings?.().then((settings) => {
      const mode = settings.voiceSendMode === 'manual' ? 'manual' : 'pause';
      sendModeRef.current = mode;
      setSendModeState(mode);
    }).catch(() => undefined);
    const update = (event: Event) => {
      const mode = (event as CustomEvent<{ voiceSendMode?: string }>).detail?.voiceSendMode === 'manual' ? 'manual' : 'pause';
      sendModeRef.current = mode;
      setSendModeState(mode);
    };
    window.addEventListener('pixano:voice-settings-changed', update);
    return () => window.removeEventListener('pixano:voice-settings-changed', update);
  }, []);

  const setSendMode = async (mode: 'pause' | 'manual') => {
    const saved = await window.pixanoDesktop?.setVoiceSettings?.({ voiceSendMode: mode }).catch(() => null);
    if (!saved || saved.error) return;
    sendModeRef.current = mode;
    setSendModeState(mode);
    window.dispatchEvent(new CustomEvent('pixano:voice-settings-changed', { detail: saved }));
  };

  const start = async ({ notch = false }: VoiceStart = {}) => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    const savedSettings = await window.pixanoDesktop?.getVoiceSettings?.().catch(() => null);
    if (savedSettings) {
      const mode = savedSettings.voiceSendMode === 'manual' ? 'manual' : 'pause';
      sendModeRef.current = mode;
      setSendModeState(mode);
    }
    const listen = window.pixanoDesktop?.listenLocalVoice;
    if (!listen) { listeningRef.current = false; setNotice(latest.current.t('assistant.voice.unavailable')); return; }
    transcriptRef.current = '';
    setTranscript('');
    setNotice('');
    setStatusText(latest.current.t('voice.listening'));
    setListening(true);
    notchRequest.current = notch ? `voice-${crypto.randomUUID()}` : null;
    // Sem texto ainda: a barra mostra "Ouvindo…" como dica, e o que chega do ditado toma o lugar dela.
    showInNotch('');
    vocabularyRef.current = latest.current.vocabulary?.() ?? [];
    const result = await listen({ autoStop: true, vocabulary: vocabularyRef.current }).catch(() => null);
    listeningRef.current = false;
    setListening(false);
    const requestId = notchRequest.current;
    notchRequest.current = null;
    const heard = transcriptRef.current.trim();
    if (result?.ended === 'silence' && heard) {
      if (sendModeRef.current === 'manual') {
        setStatusText(latest.current.t('voice.reviewBeforeSend'));
        setNotice(latest.current.t('voice.reviewBeforeSend'));
        if (requestId) latest.current.onCompanionEvent({ type: 'presentation.dismissed', requestId });
        return;
      }
      awaitingReply.current = true;
      setStatusText(latest.current.t('voice.sending'));
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
    setStatusText(message);
    // Sem a janela à vista, o aviso vai para o notch; senão a pessoa não saberia por que nada aconteceu.
    if (requestId && message) latest.current.onCompanionEvent({ type: 'error.raised', requestId: `${requestId}-notice`, text: message, nowMs: Date.now(), expiresInMs: 4_000 });
  };

  const stop = async () => {
    await window.pixanoDesktop?.stopLocalVoice?.();
    setStatusText(transcriptRef.current.trim() ? latest.current.t('voice.reviewBeforeSend') : '');
  };

  useEffect(() => {
    if (!awaitingReply.current) return;
    const turnKey = 'requestId' in turnState ? `${turnState.requestId}:${turnState.status}` : '';
    const speak = (text: string) => {
      if (!text.trim()) return;
      if (turnKey && lastSpokenTurn.current === turnKey) return;
      lastSpokenTurn.current = turnKey;
      const request = ++speakingRequest.current;
      setSpeaking(true);
      setStatusText(latest.current.t('voice.speaking'));
      void window.pixanoDesktop?.speakLocalVoice?.(text).catch(() => undefined).finally(() => {
        if (speakingRequest.current === request) { setSpeaking(false); setStatusText(''); }
      });
    };
    if (turnState.status === 'replied') { awaitingReply.current = false; speak(turnState.text); }
    else if (turnState.status === 'confirmation') speak(turnState.text);
    else if (turnState.status === 'executed') { awaitingReply.current = false; speak(turnState.summary); }
    else if (turnState.status === 'failure' || turnState.status === 'cancelled') awaitingReply.current = false;
  }, [turnState]);

  const stopSpeaking = async () => {
    speakingRequest.current += 1;
    await window.pixanoDesktop?.stopLocalVoice?.();
    setSpeaking(false);
    setStatusText('');
  };

  const clearTranscript = () => { transcriptRef.current = ''; setTranscript(''); setStatusText(''); setNotice(''); };

  return { listening, speaking, sendMode, setSendMode, statusText, stopSpeaking, clearTranscript, transcript, notice, start, stop };
}
