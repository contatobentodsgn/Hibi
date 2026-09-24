import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { CalendarDays, CheckCheck, ClipboardList, FileText, Play, Plus, Sparkles, TrendingUp, Zap } from 'lucide-react';
import type { StudyData, Task } from '../../../domain/models';
import { localNoon, shiftDayKey, todayKey } from '../../../domain/date-context';
import { calculateStats, resolveStatsPeriod, type StatsPreset } from '../../../domain/stats';
import { useT } from '../../../i18n/LocaleProvider';
import { deriveDayRhythm, formatMinutes, formatWindow } from '../../day-rhythm';
import { deriveTaskRhythm, isOpen } from '../../task-rhythm';
import { ActionDialog, ActionDialogOption, ActionDialogOptions } from '../components/ActionDialog';
import { PixanoEmptyState } from '../components/PixanoEmptyState';
import { PixanoTag } from '../components/PixanoTag';
import { PixanoUiRoot } from '../components/PixanoUiRoot';
import { RoundLink } from '../components/RoundLink';
import { SectionHeader } from '../components/SectionHeader';
import type { NavKey } from '../../shell/routes';
import './today-screen.css';

type Props = Readonly<{
  data: StudyData;
  now?: Date;
  onNavigate: (route: NavKey) => void;
  onOpenCommands: () => void;
  onCreateTask?: () => void;
}>;

const categoryTone = (task: Task): 'lavender' | 'blue' | 'peach' | 'mint' => {
  if (task.category === 'important') return 'peach';
  if (task.category === 'learning') return 'blue';
  if (task.category === 'wellbeing') return 'mint';
  return 'lavender';
};

const todayLabel = (day: string) => localNoon(day).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/** A página diária do redesenho (U06). Calcula o dia com o mesmo selector usado pela Home legada. */
export function TodayScreen({ data, now = new Date(), onNavigate, onOpenCommands, onCreateTask }: Props) {
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);
  const [progressPeriod, setProgressPeriod] = useState<Extract<StatsPreset, 'week' | 'month'>>('week');
  const day = todayKey(now);
  const wallClock = now.toTimeString().slice(0, 5);
  const rhythm = deriveDayRhythm(data.blocks, day, wallClock);
  const taskRhythm = useMemo(() => deriveTaskRhythm(data.tasks, day), [data.tasks, day]);
  const priorityTasks = useMemo(() => data.tasks
    .filter(isOpen)
    .sort((left, right) => {
      const rank = (task: Task) => {
        const state = taskRhythm.deadlineStateById[task.id];
        if (state === 'overdue') return 0;
        if (state === 'today') return 1;
        if (task.category === 'important') return 2;
        return state === 'future' ? 3 : 4;
      };
      return rank(left) - rank(right) || (left.deadline ?? '').localeCompare(right.deadline ?? '') || left.title.localeCompare(right.title);
    })
    .slice(0, 4), [data.tasks, taskRhythm.deadlineStateById]);
  const next = rhythm.now ?? rhythm.later[0] ?? null;
  const progress = useMemo(() => calculateStats(data.activity, resolveStatsPeriod(progressPeriod, now)), [data.activity, now, progressPeriod]);
  const maxDailyFocus = Math.max(0, ...progress.daily.map((entry) => entry.focusMinutes));
  const weekStart = shiftDayKey(day, -((now.getDay() + 6) % 7));
  const weekdayLabels = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  const chooseCreate = (action: 'task' | 'block' | 'note') => {
    setCreateOpen(false);
    if (action === 'task' && onCreateTask) { onCreateTask(); return; }
    if (action === 'block') { onNavigate('day'); return; }
    onNavigate('notes');
  };

  return (
    <PixanoUiRoot className="today-screen">
      <SectionHeader
        title="Um dia de cada vez."
        subtitle={`${todayLabel(day)}. Vamos com calma.`}
        actions={
          <ActionDialog
            trigger={<Button variant="secondary"><Plus size={17} aria-hidden="true" />Criar algo</Button>}
            isOpen={createOpen}
            onOpenChange={setCreateOpen}
            title="O começo de uma ideia."
            description="Escolha por onde começar."
          >
            <ActionDialogOptions label="O que criar">
              <ActionDialogOption icon={CheckCheck} onPress={() => chooseCreate('task')}>Uma tarefa</ActionDialogOption>
              <ActionDialogOption icon={CalendarDays} onPress={() => chooseCreate('block')}>Um tempo na agenda</ActionDialogOption>
              <ActionDialogOption icon={FileText} onPress={() => chooseCreate('note')}>Uma nota</ActionDialogOption>
            </ActionDialogOptions>
          </ActionDialog>
        }
      />

      <div className="today-screen__top-grid">
        <Card className="today-screen__commitment" aria-labelledby="today-next-title">
          {next ? <>
            <div className="today-screen__card-top"><PixanoTag tone="lavender" dot>{rhythm.now ? `Agora · ${next.start.slice(11, 16)}` : `A seguir · ${next.start.slice(11, 16)}`}</PixanoTag><CalendarDays aria-hidden="true" size={18} /></div>
            <h2 id="today-next-title">{next.title}</h2>
            <p>{next.start.slice(11, 16)} – {next.end.slice(11, 16)} · {formatMinutes(next.minutes)}</p>
            <div className="today-screen__commitment-footer"><span>{rhythm.later.length} compromisso{rhythm.later.length === 1 ? '' : 's'} depois</span><RoundLink label="Ver calendário diário" onPress={() => onNavigate('day')} /></div>
          </> : <PixanoEmptyState icon={CalendarDays} tone="mint" title="Seu dia está livre" description="Nada agendado para agora." action={<Button variant="tertiary" size="sm" onPress={() => onNavigate('day')}>Abrir Agenda</Button>} />}
        </Card>

        <Card className="today-screen__focus-card">
          <div className="today-screen__card-top"><span className="today-screen__icon"><Zap aria-hidden="true" size={19} /></span><span>Seu momento</span></div>
          <h2>Menos abas.<br />Mais presença.</h2>
          <p>Reserve um pouco de tempo para uma coisa importante.</p>
          <Button variant="primary" fullWidth onPress={() => onNavigate('focus')}><Play size={14} fill="currentColor" aria-hidden="true" />Entrar em foco <span className="today-screen__focus-duration">25 min</span></Button>
        </Card>

        <Card className="today-screen__rhythm-card">
          <div className="today-screen__card-top"><h2>Seu ritmo</h2><RoundLink label="Ver tendências" onPress={() => onNavigate('stats')} /></div>
          <p>Pequenos passos também contam.</p>
          <div className="today-screen__week" aria-label="Resumo da semana">{weekdayLabels.map((label, index) => {
            const date = shiftDayKey(weekStart, index);
            return <span key={label} data-current={date === day}>{label}<strong>{Number(date.slice(-2))}</strong></span>;
          })}</div>
          <div className="today-screen__rhythm-footer"><span className="today-screen__leaf">⌁</span><div><strong>{formatWindow(rhythm.freeWindows[0], t('agenda.availability.noneWindow'))}</strong><small>Próxima janela livre</small></div></div>
        </Card>
      </div>

      <div className="today-screen__bottom-grid">
        <Card className="today-screen__tasks-card">
          <div className="today-screen__card-top"><div><h2>O que importa hoje</h2><PixanoTag>{priorityTasks.length}</PixanoTag></div><RoundLink label="Ver lista prioritária" onPress={() => onNavigate('tasks')} /></div>
          {priorityTasks.length ? <ul className="today-screen__task-list">{priorityTasks.map((task) => <li key={task.id}><span aria-hidden="true" className="today-screen__checkbox" /><div><strong>{task.title}</strong><PixanoTag tone={categoryTone(task)} dot>{task.category === 'important' ? 'Importante' : task.folder || 'Pessoal'}</PixanoTag></div></li>)}</ul> : <PixanoEmptyState icon={CheckCheck} tone="mint" title="Nada pendente por aqui." description="Quando surgir algo, aparece aqui." action={<Button variant="tertiary" size="sm" onPress={() => onCreateTask?.()}>Criar tarefa</Button>} />}
        </Card>

        <Card className="today-screen__progress-card">
          <div className="today-screen__card-top"><h2>Tempo bem vivido</h2><RoundLink label="Ver progresso" onPress={() => onNavigate('goals')} /></div>
          <div className="today-screen__progress-tabs" role="group" aria-label="Período do tempo em foco">
            <button type="button" aria-pressed={progressPeriod === 'week'} onClick={() => setProgressPeriod('week')}>Semana</button>
            <button type="button" aria-pressed={progressPeriod === 'month'} onClick={() => setProgressPeriod('month')}>Mês</button>
          </div>
          <strong className="today-screen__progress-time">{formatMinutes(progress.focusMinutes)}</strong><small>registrados em foco</small>
          <div className="today-screen__bars" data-period={progressPeriod} role="img" aria-label="Minutos de foco registrados por dia">{progress.daily.map((entry) => <span key={entry.date} title={`${localNoon(entry.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}: ${formatMinutes(entry.focusMinutes)}`} aria-label={`${entry.date}: ${formatMinutes(entry.focusMinutes)}`} style={{ height: `${maxDailyFocus ? Math.max(entry.focusMinutes ? 8 : 0, entry.focusMinutes / maxDailyFocus * 100) : 0}%` }} data-active={entry.date === day} />)}</div>
        </Card>
      </div>

      <nav className="today-screen__shortcuts" aria-label="Atalhos de Hoje">
        <Button variant="tertiary" onPress={() => onNavigate('habits')}><ClipboardList size={16} aria-hidden="true" />Ver Rotina</Button>
        <Button variant="tertiary" onPress={() => onNavigate('goals')}><TrendingUp size={16} aria-hidden="true" />Ver Progresso</Button>
        <Button variant="tertiary" onPress={() => onNavigate('stats')}><Sparkles size={16} aria-hidden="true" />Ver Tendências</Button>
        <Button variant="tertiary" onPress={() => onNavigate('review')}>Abrir revisão</Button>
        <Button variant="tertiary" aria-label="Open quick capture" onPress={onOpenCommands}>Captura rápida</Button>
      </nav>
    </PixanoUiRoot>
  );
}
