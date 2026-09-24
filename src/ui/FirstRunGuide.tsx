import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { useThemePreference } from './theme-context';
import { completeGuide, deferGuide, FIRST_RUN_GUIDE_STORAGE_KEY, initialGuideState, nextGuideStep, readGuideState, resumeGuide, type FirstRunGuideState } from './first-run-guide-state';
import type { NavKey } from './shell/routes';
import type { Task } from '../domain/models';
import { formatModelSize, modelStatusKey, type LocalModelStatus } from './local-model-format';
import './first-run-guide.css';

type Props = Readonly<{
  onNavigate: (route: NavKey) => void;
  tasks: readonly Task[];
}>;

const STEP_KEYS = ['guide.step.appearance', 'guide.step.notch', 'guide.step.voice', 'guide.step.brain', 'guide.step.firstAction'] as const;
const THEME_OPTIONS = ['light', 'dark', 'system'] as const;
type LocalModelInfo = Readonly<{ status: LocalModelStatus; modelId: string | null; sizeBytes?: number }>;

export function FirstRunGuide({ onNavigate, tasks }: Props) {
  const t = useT();
  const { language, setLanguage } = useLocale();
  const { preference, setPreference } = useThemePreference();
  const [guide, setGuide] = useState<FirstRunGuideState>(() => {
    try { return readGuideState(window.localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY)); }
    catch { return initialGuideState; }
  });
  const [visible, setVisible] = useState(() => guide.status === 'in-progress');
  const [modelInfo, setModelInfo] = useState<LocalModelInfo | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const deferRef = useRef<() => void>(() => undefined);

  const save = (next: FirstRunGuideState) => {
    setGuide(next);
    try {
      window.localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the guide usable for this session when storage is unavailable.
    }
  };

  useEffect(() => {
    if (guide.status === 'deferred' && guide.step === 4 && guide.taskBaseline !== undefined && tasks.length > guide.taskBaseline) {
      save(completeGuide(guide));
      setVisible(false);
      return;
    }
    if (guide.status === 'deferred' && guide.step === 4 && guide.taskBaseline !== undefined && tasks.length < guide.taskBaseline) {
      save({ ...guide, taskBaseline: tasks.length });
    }
  }, [tasks, guide]);

  useEffect(() => {
    if (!visible || guide.step !== 3) return undefined;
    let active = true;
    void window.pixanoDesktop?.getLocalModelState?.().then((state) => {
      if (!active || !state || !['unavailable', 'missing', 'unverified', 'ready'].includes(state.status)) return;
      setModelInfo({ status: state.status as LocalModelStatus, modelId: state.modelId, sizeBytes: state.sizeBytes });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [visible, guide.step]);

  const defer = () => { save(deferGuide(guide)); setVisible(false); requestAnimationFrame(() => resumeButtonRef.current?.focus()); };
  deferRef.current = defer;
  useEffect(() => {
    if (!visible) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); deferRef.current(); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [visible]);
  const openSettings = (route: NavKey) => { defer(); onNavigate(route); };
  const startFirstTask = () => {
    const next = deferGuide({ ...guide, taskBaseline: tasks.length });
    save(next);
    setVisible(false);
    onNavigate('tasks');
  };

  if (guide.status === 'completed') return null;

  if (!visible) return <div className="first-run-guide-resume"><Sparkles aria-hidden="true" size={15} /><span>{t('guide.title')}</span><button ref={resumeButtonRef} type="button" onClick={() => { save(resumeGuide(guide)); setVisible(true); }}>{t('guide.resume')}</button></div>;

  const stepContent = guide.step === 0 ? (
    <>
      <p className="first-run-guide__detail">{t('guide.appearance.detail')}</p>
      <fieldset className="first-run-guide__fieldset"><legend>{t('guide.language')}</legend><div className="first-run-guide__choices">
        {([{ value: 'pt', label: 'guide.language.pt' }, { value: 'en', label: 'guide.language.en' }] as const).map(({ value, label }) => <button type="button" key={value} aria-pressed={language === value} className={language === value ? 'is-selected' : ''} onClick={() => setLanguage(value)}>{t(label)}</button>)}
      </div></fieldset>
      <fieldset className="first-run-guide__fieldset"><legend>{t('guide.theme')}</legend><div className="first-run-guide__choices">
        {THEME_OPTIONS.map((value) => <button type="button" key={value} aria-pressed={preference === value} className={preference === value ? 'is-selected' : ''} onClick={() => setPreference(value)}>{t(value === 'light' ? 'guide.theme.light' : value === 'dark' ? 'guide.theme.dark' : 'guide.theme.system')}</button>)}
      </div></fieldset>
    </>
  ) : guide.step === 1 ? (
    <><p className="first-run-guide__detail">{t('guide.notch.detail')}</p><button type="button" className="first-run-guide__secondary" onClick={() => openSettings('settings')}>{t('guide.notch.openSettings')} <ChevronRight aria-hidden="true" size={15} /></button></>
  ) : guide.step === 2 ? (
    <><p className="first-run-guide__detail">{t('guide.voice.detail')}</p><button type="button" className="first-run-guide__secondary" onClick={() => openSettings('assistant')}>{t('guide.voice.open')} <ChevronRight aria-hidden="true" size={15} /></button></>
  ) : guide.step === 3 ? (
    <><p className="first-run-guide__detail">{t('guide.brain.detail')}</p>{modelInfo && <p className="first-run-guide__model" role="status">{t('guide.brain.modelInfo').replace('{status}', t(modelStatusKey(modelInfo.status))).replace('{size}', formatModelSize(modelInfo.sizeBytes))}</p>}<button type="button" className="first-run-guide__secondary" onClick={() => openSettings('settings')}>{t('guide.brain.openSettings')} <ChevronRight aria-hidden="true" size={15} /></button></>
  ) : (
    <><p className="first-run-guide__detail">{t('guide.firstAction.detail')}</p><button type="button" className="first-run-guide__primary" onClick={startFirstTask}>{t('guide.firstAction.create')} <ChevronRight aria-hidden="true" size={16} /></button></>
  );

  return <div className="first-run-guide-backdrop">
    <section ref={dialogRef} className="first-run-guide" role="dialog" aria-modal="true" aria-labelledby="first-run-guide-title" aria-describedby="first-run-guide-description">
      <header className="first-run-guide__header"><span className="first-run-guide__mark"><Sparkles aria-hidden="true" size={17} /></span><span className="first-run-guide__count">{t('guide.stepCount').replace('{current}', String(guide.step + 1)).replace('{total}', '5')}</span><button type="button" className="first-run-guide__close" onClick={defer} aria-label={t('guide.close')}><X aria-hidden="true" size={17} /></button></header>
      <div className="first-run-guide__progress" aria-hidden="true"><span style={{ width: `${((guide.step + 1) / 5) * 100}%` }} /></div>
      <h2 id="first-run-guide-title">{t(STEP_KEYS[guide.step] ?? STEP_KEYS[0])}</h2>
      <p id="first-run-guide-description" className="first-run-guide__subhead">{t('guide.subtitle')}</p>
      <p className="first-run-guide__privacy">{t('guide.localPrivacy')}</p>
      <div className="first-run-guide__body">{stepContent}</div>
      <footer className="first-run-guide__footer">
        <button type="button" className="first-run-guide__defer" onClick={defer}>{t('guide.defer')}</button>
        <div className="first-run-guide__controls">
          {guide.step > 0 && <button type="button" className="first-run-guide__secondary" onClick={() => save({ ...guide, step: guide.step - 1 })}><ChevronLeft aria-hidden="true" size={15} />{t('guide.back')}</button>}
          {guide.step < 4 && <><button type="button" className="first-run-guide__skip" onClick={() => save(nextGuideStep(guide))}>{t('guide.skipStep')}</button><button type="button" className="first-run-guide__primary" onClick={() => save(nextGuideStep(guide))}>{t('guide.next')}<ChevronRight aria-hidden="true" size={15} /></button></>}
        </div>
      </footer>
    </section>
  </div>;
}
