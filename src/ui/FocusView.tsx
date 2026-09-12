import React, { useEffect, useMemo, useRef, useState } from 'react';
import { absenceStartMs, decideAwayResponse, resolveFocusLoopAnimationId, sanitizePresenceEvent, type PresenceEvent, type PresenceWatchRequest } from '../../electron/focus-presence.mjs';
import type { CompanionEvent } from '../companion/contracts';
import type { ActivityRecord } from '../domain/activity';
import { localNoon, todayKey } from '../domain/date-context';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { pluralize } from '../i18n/plural';
import { CompanionAnimation } from './CompanionAnimation';
import { IDLE_FOCUS_LIFECYCLE, ignoresDurationChoice, remainingSeconds, runningEndsAtMs, stepFocusLifecycle, type FocusAbsence, type FocusLifecycleAction, type FocusLifecycleEvent } from './focus-lifecycle';
import { deriveFocusMood, focusSessionsCompletedToday } from './focus-mood';
import { DEFAULT_FOCUS_SETTINGS, type AwayBehavior, type FocusLoopAnimation } from './focus-settings';

export type FocusMode = 'focus' | 'break';
/** A ponte de presença do processo principal: pedir vigia e ouvir ausência e retorno. */
export type FocusPresenceBridge = Readonly<{
  watch?: (request: PresenceWatchRequest) => unknown;
  subscribe?: (callback: (event: PresenceEvent) => void) => () => void;
}>;
type CompanionActionInput = Readonly<{ requestId: string; actionId: 'confirm' | 'cancel' }>;
type Props = { onEvent: (action: string, detail: string, result?: string) => void; onFocusStarted?: () => void; onFocusCompleted?: () => void; onFocusLifecycle?: (event: FocusLifecycleEvent) => void; onFocusWindowChange?: (endsAtMs: number | null) => void; mode?: FocusMode; onModeChange?: (mode: FocusMode) => void; sessionMinutes?: number; awayBehavior?: AwayBehavior; idleMinutes?: number; focusLoopAnimation?: FocusLoopAnimation; activity?: readonly ActivityRecord[]; presence?: FocusPresenceBridge; onCompanionEvent?: (event: CompanionEvent) => void; subscribeCompanionActions?: (callback: (action: CompanionActionInput) => void) => () => void };

// A pergunta do `focus.idle_check` e a oferta do `focus.resume_prompt`, cada uma com o id da
// apresentação no companion — é por ele que uma resposta dada no notch encontra a pergunta daqui.
// `away-review` é a mesma pergunta depois que a volta foi percebida: aí já se sabe quanto tempo a pessoa
// ficou fora, e o que se pergunta é se aquele tempo foi foco.
type PresencePrompt =
  | Readonly<{ kind: 'idle-check'; requestId: string; absence: FocusAbsence; idleSeconds: number }>
  | Readonly<{ kind: 'away-review'; requestId: string; absence: Required<FocusAbsence> }>
  | Readonly<{ kind: 'resume'; requestId: string }>;

// Foco e pausa usam o mesmo relógio, mas nunca os mesmos eventos: uma pausa concluída não pode contar
// como sessão de foco — o /stats soma sessões e minutos a partir de focus.*.
const BREAK_DURATIONS: readonly number[] = [5, 10, 15];
const PROMPT_EXPIRES_MS = 60_000;

export function FocusView({ onEvent, onFocusStarted, onFocusCompleted, onFocusLifecycle, onFocusWindowChange, mode = 'focus', onModeChange, sessionMinutes, awayBehavior, idleMinutes, focusLoopAnimation, activity, presence, onCompanionEvent, subscribeCompanionActions }: Props) {
  const t = useT();
  const { language } = useLocale();
  const onBreak = mode === 'break';
  // A duração da sessão vem de Ajustes › Foco. O padrão continua 25: atualizar o app não muda o
  // hábito de ninguém.
  const DURATIONS: readonly number[] = onBreak ? BREAK_DURATIONS : [sessionMinutes ?? DEFAULT_FOCUS_SETTINGS.sessionMinutes];
  const initial = DURATIONS[0]!;
  const behavior = awayBehavior ?? DEFAULT_FOCUS_SETTINGS.awayBehavior;
  const idle = idleMinutes ?? DEFAULT_FOCUS_SETTINGS.idleMinutes;
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(initial);
  const [seconds, setSeconds] = useState(initial * 60);
  const [prompt, setPrompt] = useState<PresencePrompt | null>(null);
  const [pausedAway, setPausedAway] = useState(false);
  // Só uma pausa AUTOMÁTICA por ausência espera a volta: quem respondeu "Pausar" já está na frente do
  // Mac, e oferecer retomar segundos depois seria insistir.
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  // Sessões concluídas hoje no registro local: recontadas quando o registro muda ou o dia vira.
  const today = todayKey();
  const completedToday = useMemo(() => focusSessionsCompletedToday(activity ?? [], localNoon(today)), [activity, today]);
  // Refs, não estado: o cancelamento sai de um cleanup, que só enxerga valores da renderização em que foi criado.
  const lifecycle = useRef(IDLE_FOCUS_LIFECYCLE);
  const promptRef = useRef<PresencePrompt | null>(null);
  const awaitingReturnRef = useRef(false);
  const onFocusLifecycleRef = useRef(onFocusLifecycle);
  useEffect(() => { onFocusLifecycleRef.current = onFocusLifecycle; });
  // A janela da sessão é avisada à parte do ledger de atividade: são dois assuntos diferentes — um
  // alimenta o /stats, o outro diz ao agendador até quando segurar os lembretes de bem-estar.
  const onFocusWindowRef = useRef(onFocusWindowChange);
  useEffect(() => { onFocusWindowRef.current = onFocusWindowChange; });
  const companionRef = useRef(onCompanionEvent);
  const presenceRef = useRef(presence);
  const subscribeActionsRef = useRef(subscribeCompanionActions);
  useEffect(() => { companionRef.current = onCompanionEvent; presenceRef.current = presence; subscribeActionsRef.current = subscribeCompanionActions; });

  const setAwaiting = (value: boolean) => { awaitingReturnRef.current = value; setAwaitingReturn(value); };
  // Trocar ou fechar a pergunta sempre descarta a apresentação anterior no companion: sem isso o notch
  // continuaria mostrando, até expirar, uma pergunta que já foi respondida aqui.
  const replacePrompt = (next: PresencePrompt | null) => {
    const previous = promptRef.current;
    if (previous && previous.requestId !== next?.requestId) companionRef.current?.({ type: 'presentation.dismissed', requestId: previous.requestId });
    promptRef.current = next;
    setPrompt(next);
  };
  // A ausência de uma pergunta de presença ainda sem resposta. Quem fecha a pergunta lê isto ANTES de fechá-la.
  const pendingAbsence = (): FocusAbsence | undefined => { const open = promptRef.current; return open && open.kind !== 'resume' ? open.absence : undefined; };
  const minutesText = (ms: number) => pluralize(language, Math.max(1, Math.round(ms / 60_000)), 'focus.count.minute.one', 'focus.count.minute.other');
  const awayReviewText = (absence: Required<FocusAbsence>) => t('focus.presence.awayReview.title').replace('{duration}', () => minutesText(absence.untilMs - absence.sinceMs));

  // A duração escolhida limita o tempo medido: com o notebook dormindo, o relógio de parede corre e a contagem não.
  // Presença não confirmada não conta como foco: com uma pergunta de presença aberta, pausar, concluir ou
  // abandonar desconta o tempo ausente antes do evento.
  const emitLifecycle = (action: FocusLifecycleAction, pending: FocusAbsence | undefined = pendingAbsence()) => {
    const step = stepFocusLifecycle(mode, action, lifecycle.current, Date.now(), duration * 60_000, pending);
    lifecycle.current = step.state;
    setPausedAway(step.state.phase === 'paused' && step.state.pauseReason === 'away');
    if (typeof action === 'string') setAwaiting(false);
    // A pausa que descontou a ausência devolve os minutos ao mostrador.
    if (pending && action === 'pause' && step.state.phase === 'paused') { const left = remainingSeconds(step.state); if (left !== null) setSeconds(left); }
    if (step.event) {
      onFocusWindowRef.current?.(step.event.type === 'started' || step.event.type === 'resumed' ? step.event.endsAtMs ?? null : null);
      onFocusLifecycleRef.current?.(step.event);
    }
  };
  // Sair da tela ou trocar de modo abandona a sessão iniciada. No mount/unmount extra do StrictMode
  // nada foi iniciado ainda, então não há evento.
  useEffect(() => () => emitLifecycle('abandon'), [mode]);
  useEffect(() => () => { const open = promptRef.current; if (open) companionRef.current?.({ type: 'presentation.dismissed', requestId: open.requestId }); }, []);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Conclusão fora do updater: updaters precisam ser puros (o StrictMode os chama duas vezes), e cada
  // conclusão precisa virar exatamente um evento — o /stats conta sessões a partir deles.
  useEffect(() => {
    if (!running || seconds > 0) return;
    // A pergunta de presença sem resposta entra na conclusão: o tempo ausente sai antes do evento.
    const pending = pendingAbsence();
    setRunning(false);
    setSeconds(duration * 60);
    replacePrompt(null);
    if (onBreak) onEvent('break-complete', 'Completed break', 'pass');
    else { emitLifecycle('complete', pending); onFocusCompleted?.(); onEvent('focus-complete', 'Completed focus session', 'pass'); }
  }, [running, seconds, duration, onBreak, onEvent, onFocusCompleted]);
  // Escolher outra duração com a sessão pausada zera o relógio: a sessão anterior foi abandonada.
  // A mesma duração não muda nada, para um clique no botão já ativo não descartar a sessão.
  const chooseDuration = (minutes: number) => { if (ignoresDurationChoice({ mode, running, paused: lifecycle.current.phase === 'paused' || seconds < duration * 60, selectedMinutes: duration, nextMinutes: minutes })) return; emitLifecycle('abandon'); replacePrompt(null); setDuration(minutes); setSeconds(minutes * 60); onEvent(onBreak ? 'break-duration' : 'focus-duration', `${minutes} minute ${onBreak ? 'break' : 'session'}`, 'pass'); };
  const toggle = () => {
    const starting = !running;
    const pending = pendingAbsence();
    setRunning(starting);
    replacePrompt(null);
    if (onBreak) { onEvent(starting ? 'break-start' : 'break-stop', starting ? 'Started break' : 'Stopped break', 'pass'); return; }
    if (starting) onFocusStarted?.();
    emitLifecycle(starting ? 'start' : 'pause', pending);
    onEvent(starting ? 'focus-start' : 'focus-stop', starting ? 'Started Post 1 focus' : 'Stopped focus session', 'pass');
  };

  // Pausa por ausência: pela máquina de estados, com o período ausente descontado, e o relógio da tela
  // volta a mostrar o que falta pelo tempo medido — os minutos em que ninguém estava ali são devolvidos.
  const pauseForAway = (absence: FocusAbsence, awaitReturn: boolean) => {
    emitLifecycle({ type: 'pause-away', absence });
    if (lifecycle.current.phase !== 'paused') return;
    setRunning(false);
    const left = remainingSeconds(lifecycle.current);
    if (left !== null) setSeconds(left);
    setAwaiting(awaitReturn);
    onEvent('focus-away', 'Paused focus session: away', 'paused');
  };

  // "Descontar" depois da volta: o período ausente sai SEM pausar — a pessoa está de volta. O mostrador e a
  // janela que segura os lembretes passam a contar com os minutos devolvidos.
  const discountAway = (absence: FocusAbsence) => {
    const before = lifecycle.current;
    emitLifecycle({ type: 'discount-away', absence });
    if (lifecycle.current === before) return;
    const left = remainingSeconds(lifecycle.current);
    if (left !== null) setSeconds(left);
    onFocusWindowRef.current?.(runningEndsAtMs(lifecycle.current));
    onEvent('focus-away', 'Discounted time away from focus session', 'discounted');
  };

  const askAboutAbsence = (absence: Required<FocusAbsence>) => {
    const requestId = `focus-returned-${crypto.randomUUID()}`;
    replacePrompt({ kind: 'away-review', requestId, absence });
    companionRef.current?.({ type: 'focus.idle_check', requestId, text: awayReviewText(absence), nowMs: Date.now(), expiresInMs: PROMPT_EXPIRES_MS, actions: [{ id: 'confirm', label: t('focus.presence.countIt') }, { id: 'cancel', label: t('focus.presence.discountIt') }] });
  };

  const offerResume = () => {
    const requestId = `focus-resume-${crypto.randomUUID()}`;
    replacePrompt({ kind: 'resume', requestId });
    companionRef.current?.({ type: 'focus.resume_prompt', requestId, pauseReason: 'away', text: t('focus.presence.resume.title'), nowMs: Date.now(), expiresInMs: PROMPT_EXPIRES_MS, actions: [{ id: 'confirm', label: t('focus.presence.resume') }, { id: 'cancel', label: t('focus.presence.notNow') }] });
  };

  const handlePresence = (raw: unknown) => {
    const event = sanitizePresenceEvent(raw);
    if (!event) return;
    if (event.type === 'away') {
      const response = decideAwayResponse({ mode, phase: lifecycle.current.phase, behavior });
      const absence: FocusAbsence = { sinceMs: absenceStartMs(event) };
      if (response === 'pause') { pauseForAway(absence, true); return; }
      // Sem resposta, nada muda: a sessão segue contando como estava.
      const open = promptRef.current;
      if (response === 'ask' && open?.kind !== 'idle-check') {
        // Uma volta ainda sem resposta não foi confirmada como foco: aquele tempo sai antes da nova pergunta.
        if (open?.kind === 'away-review') discountAway(open.absence);
        const requestId = `focus-idle-${crypto.randomUUID()}`;
        replacePrompt({ kind: 'idle-check', requestId, absence, idleSeconds: event.idleSeconds });
        companionRef.current?.({ type: 'focus.idle_check', requestId, text: t('focus.presence.idleCheck.title'), nowMs: Date.now(), expiresInMs: PROMPT_EXPIRES_MS, actions: [{ id: 'confirm', label: t('focus.presence.stillHere') }, { id: 'cancel', label: t('focus.presence.pause') }] });
      }
      return;
    }
    // A volta com a pergunta ainda aberta muda a pergunta. Quem se afastou de verdade não respondeu, e na
    // volta "Ainda estou aqui" contaria o tempo fora como foco. Agora a duração é conhecida, e o que se
    // pergunta é se aquele tempo foi foco — o período termina na volta, e o que veio depois conta.
    const open = promptRef.current;
    if (open?.kind === 'idle-check') askAboutAbsence({ sinceMs: open.absence.sinceMs, untilMs: event.atMs });
    if (awaitingReturnRef.current && lifecycle.current.phase === 'paused' && lifecycle.current.pauseReason === 'away') { setAwaiting(false); offerResume(); }
  };

  const answerIdleCheck = (stillHere: boolean) => {
    const open = promptRef.current;
    if (open?.kind !== 'idle-check') return;
    replacePrompt(null);
    if (stillHere) { onEvent('focus-presence', 'Confirmed presence during focus', 'present'); return; }
    pauseForAway(open.absence, false);
  };
  const answerAwayReview = (countsAsFocus: boolean) => {
    const open = promptRef.current;
    if (open?.kind !== 'away-review') return;
    replacePrompt(null);
    if (countsAsFocus) { onEvent('focus-presence', 'Counted time away as focus', 'present'); return; }
    discountAway(open.absence);
  };
  const answerResume = (resume: boolean) => {
    if (promptRef.current?.kind !== 'resume') return;
    replacePrompt(null);
    if (resume && !running && lifecycle.current.phase === 'paused') toggle();
  };
  const handleCompanionAction = (action: CompanionActionInput) => {
    const open = promptRef.current;
    if (!open || action?.requestId !== open.requestId) return;
    if (open.kind === 'idle-check') answerIdleCheck(action.actionId === 'confirm');
    else if (open.kind === 'away-review') answerAwayReview(action.actionId === 'confirm');
    else answerResume(action.actionId === 'confirm');
  };
  // As assinaturas são feitas uma vez; o que elas chamam é sempre o da renderização mais recente.
  const handlersRef = useRef({ handlePresence, handleCompanionAction });
  useEffect(() => { handlersRef.current = { handlePresence, handleCompanionAction }; });
  useEffect(() => presenceRef.current?.subscribe?.((event) => handlersRef.current.handlePresence(event)) ?? undefined, []);
  useEffect(() => subscribeActionsRef.current?.((action) => handlersRef.current.handleCompanionAction(action)) ?? undefined, []);

  // Vigia só com sessão de foco rodando, ou pausada sozinha esperando a volta. "Continuar contando" não
  // reage a nada, então nem pede vigia: sem pedido o processo principal não arma intervalo algum.
  const watching = !onBreak && behavior !== 'keep' && (running || awaitingReturn);
  useEffect(() => {
    if (!watching) return;
    const send = (request: PresenceWatchRequest) => { try { void Promise.resolve(presenceRef.current?.watch?.(request)).catch(() => undefined); } catch { /* ponte indisponível */ } };
    send({ watching: true, idleMinutes: idle });
    return () => send({ watching: false, idleMinutes: idle });
  }, [watching, idle]);

  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const heading = onBreak ? (running ? t('focus.breakTitle') : t('focus.breakReady')) : (running ? 'Post 1 — Kabrito digital' : 'Ready to focus.');
  const subhead = onBreak ? (running ? t('focus.breakRunning') : `${duration} ${t('focus.breakOnClock')}`) : (running ? 'One clear block. No back-to-back nudges.' : `Pick a task — ${duration}m on the clock.`);
  const action = onBreak ? (running ? t('focus.stopBreak') : t('focus.startBreak')) : (running ? 'Pause session' : 'Start focus');
  const promptCard = prompt?.kind === 'idle-check'
    ? <div role="alert" className="notice focus-presence-prompt" style={{ margin: '16px auto 0', maxWidth: 520 }}><div><strong>{t('focus.presence.idleCheck.title')}</strong><p>{t('focus.presence.idleCheck.detail').replace('{duration}', () => minutesText(prompt.idleSeconds * 1000))}</p></div><div style={{ display: 'flex', gap: 8 }}><button className="primary" onClick={() => answerIdleCheck(true)}>{t('focus.presence.stillHere')}</button><button className="outline" onClick={() => answerIdleCheck(false)}>{t('focus.presence.pause')}</button></div></div>
    : prompt?.kind === 'away-review'
    ? <div role="alert" className="notice focus-presence-prompt" style={{ margin: '16px auto 0', maxWidth: 520 }}><div><strong>{awayReviewText(prompt.absence)}</strong></div><div style={{ display: 'flex', gap: 8 }}><button className="primary" onClick={() => answerAwayReview(true)}>{t('focus.presence.countIt')}</button><button className="outline" onClick={() => answerAwayReview(false)}>{t('focus.presence.discountIt')}</button></div></div>
    : prompt?.kind === 'resume'
      ? <div role="alert" className="notice focus-presence-prompt" style={{ margin: '16px auto 0', maxWidth: 520 }}><div><strong>{t('focus.presence.resume.title')}</strong></div><div style={{ display: 'flex', gap: 8 }}><button className="primary" onClick={() => answerResume(true)}>{t('focus.presence.resume')}</button><button className="outline" onClick={() => answerResume(false)}>{t('focus.presence.notNow')}</button></div></div>
      : null;
  // O loop tocado com a sessão rodando é o ajuste "Animação durante o foco" no humor do momento: entediado
  // enquanto uma ausência espera a volta, animado a partir da terceira sessão concluída hoje. O movimento
  // reduzido do sistema continua valendo dentro de CompanionAnimation.
  const focusMood = deriveFocusMood({ awayPending: prompt?.kind === 'idle-check' || awaitingReturn, completedToday });
  return <div className="focus-view"><div className="eyebrow">{onBreak ? t('focus.breakEyebrow') : 'FOCUS MODE · LOCAL SESSION'}</div><CompanionAnimation state={running && !onBreak ? resolveFocusLoopAnimationId(focusLoopAnimation, focusMood) : 'idle'} label={onBreak ? t('focus.breakCompanion') : 'Focus companion'} /><div className={`focus-ring ${running ? 'is-running' : ''}`}><span>{time}</span><small>{t('focus.minutes')}</small></div><h1>{heading}</h1><p className="subhead">{subhead}</p><button className="primary focus-button" onClick={toggle}>{action}</button>{promptCard}{pausedAway && !running && <p className="muted" role="status">{t('focus.presence.pausedAway')}</p>}<div className="focus-options">{DURATIONS.map((minutes) => <button key={minutes} className={`filter ${duration === minutes ? 'active' : ''}`} aria-pressed={DURATIONS.length > 1 ? duration === minutes : undefined} disabled={running} onClick={() => chooseDuration(minutes)}>{onBreak ? `${minutes}m` : `${minutes}m focus`}</button>)}<button className="outline" disabled={running} onClick={() => onModeChange?.(onBreak ? 'focus' : 'break')}>{onBreak ? t('focus.backToFocus') : t('focus.takeBreak')}</button></div>{!onBreak && <p className="muted">{t('focus.quiet')}</p>}</div>;
}
