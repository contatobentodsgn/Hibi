import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { CalendarDays, CheckCheck, ClipboardList, FileText, Play, Plus, Sparkles, TrendingUp, Zap } from 'lucide-react';
import type { StudyData, Task } from '../../../domain/models';
import { localNoon, todayKey } from '../../../domain/date-context';
import { deriveDayRhythm, formatMinutes, formatWindow } from '../../day-rhythm';
import { ActionDialog, ActionDialogOption, ActionDialogOptions } from '../components/ActionDialog';
import { HibiEmptyState } from '../components/HibiEmptyState';
import { HibiTag } from '../components/HibiTag';
import { HibiUiRoot } from '../components/HibiUiRoot';
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
  const [createOpen, setCreateOpen] = useState(false);
  const day = todayKey(now);
  const wallClock = now.toTimeString().slice(0, 5);
  const rhythm = deriveDayRhythm(data.blocks, day, wallClock);
  const priorityTasks = useMemo(() => data.tasks.filter((task) => task.status !== 'completed').slice(0, 4), [data.tasks]);
  const next = rhythm.now ?? rhythm.later[0] ?? null;
  const complete = rhythm.completed.length;
  const total = Math.max(1, rhythm.workCount + complete);

  const chooseCreate = (action: 'task' | 'block' | 'note') => {
    setCreateOpen(false);
    if (action === 'task' && onCreateTask) { onCreateTask(); return; }
    if (action === 'block') { onNavigate('day'); return; }
    onNavigate('notes');
  };

  return (
    <HibiUiRoot className="today-screen">
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
            <div className="today-screen__card-top"><HibiTag tone="lavender" dot>{rhythm.now ? `Agora · ${next.start.slice(11, 16)}` : `A seguir · ${next.start.slice(11, 16)}`}</HibiTag><CalendarDays aria-hidden="true" size={18} /></div>
            <h2 id="today-next-title">{next.title}</h2>
            <p>{next.start.slice(11, 16)} – {next.end.slice(11, 16)} · {formatMinutes(next.minutes)}</p>
            <div className="today-screen__commitment-footer"><span>{rhythm.later.length} compromisso{rhythm.later.length === 1 ? '' : 's'} depois</span><RoundLink label="Ver calendário diário" onPress={() => onNavigate('day')} /></div>
          </> : <HibiEmptyState icon={CalendarDays} tone="mint" title="Seu dia está livre" description="Nada agendado para agora." action={<Button variant="tertiary" size="sm" onPress={() => onNavigate('day')}>Abrir Agenda</Button>} />}
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
          <div className="today-screen__week" aria-label="Resumo da semana">{['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((label, index) => <span key={label} data-current={index === now.getDay() - 1 || (now.getDay() === 0 && index === 6)}>{label}<strong>{Math.max(1, now.getDate() - (now.getDay() + 6 - index) % 7)}</strong></span>)}</div>
          <div className="today-screen__rhythm-footer"><span className="today-screen__leaf">⌁</span><div><strong>{formatWindow(rhythm.freeWindows[0])}</strong><small>Próxima janela livre</small></div></div>
        </Card>
      </div>

      <div className="today-screen__bottom-grid">
        <Card className="today-screen__tasks-card">
          <div className="today-screen__card-top"><div><h2>O que importa hoje</h2><HibiTag>{priorityTasks.length}</HibiTag></div><RoundLink label="Ver lista prioritária" onPress={() => onNavigate('tasks')} /></div>
          {priorityTasks.length ? <ul className="today-screen__task-list">{priorityTasks.map((task) => <li key={task.id}><span aria-hidden="true" className="today-screen__checkbox" /><div><strong>{task.title}</strong><HibiTag tone={categoryTone(task)} dot>{task.category === 'important' ? 'Importante' : task.folder || 'Pessoal'}</HibiTag></div></li>)}</ul> : <HibiEmptyState icon={CheckCheck} tone="mint" title="Nada pendente por aqui." description="Quando surgir algo, aparece aqui." action={<Button variant="tertiary" size="sm" onPress={() => onCreateTask?.()}>Criar tarefa</Button>} />}
        </Card>

        <Card className="today-screen__progress-card">
          <div className="today-screen__card-top"><h2>Tempo bem vivido</h2><RoundLink label="Ver progresso" onPress={() => onNavigate('goals')} /></div>
          <div className="today-screen__progress-tabs"><span>Semana</span><span>Mês</span></div>
          <strong className="today-screen__progress-time">{formatMinutes(rhythm.plannedMinutes)}</strong><small>dedicados ao que importa</small>
          <div className="today-screen__bars" aria-label={`${complete} de ${total} blocos concluídos`}>{[3, 5, 4, 6, 2, 1, 1].map((height, index) => <span key={index} style={{ height: `${height * 10}%` }} data-active={index === now.getDay() - 1 || (now.getDay() === 0 && index === 6)} />)}</div>
        </Card>
      </div>

      <nav className="today-screen__shortcuts" aria-label="Atalhos de Hoje">
        <Button variant="tertiary" onPress={() => onNavigate('habits')}><ClipboardList size={16} aria-hidden="true" />Ver Rotina</Button>
        <Button variant="tertiary" onPress={() => onNavigate('goals')}><TrendingUp size={16} aria-hidden="true" />Ver Progresso</Button>
        <Button variant="tertiary" onPress={() => onNavigate('stats')}><Sparkles size={16} aria-hidden="true" />Ver Tendências</Button>
        <Button variant="tertiary" onPress={() => onNavigate('review')}>Abrir revisão</Button>
        <Button variant="tertiary" aria-label="Open quick capture" onPress={onOpenCommands}>Captura rápida</Button>
      </nav>
    </HibiUiRoot>
  );
}
