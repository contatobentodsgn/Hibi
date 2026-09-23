import type { ReactElement, ReactNode } from 'react';
import type { Task } from '../../../domain/models';
import { EntityDetailsPanel } from '../components/EntityDetailsPanel';
import { PixanoTag, type PixanoTagTone } from '../components/PixanoTag';

/** O painel de uma tarefa fica separado da lista para que Agenda e Lembretes reutilizem o mesmo padrão na U09/U08. */
export function TaskDetailsPanel({ task, trigger, isOpen, onOpenChange, deadline, deadlineTone, children }: Readonly<{
  task: Task;
  trigger: ReactElement;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  deadline: string;
  deadlineTone: PixanoTagTone;
  children: ReactNode;
}>) {
  return <EntityDetailsPanel
    trigger={trigger}
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    title={task.title}
    tag={<PixanoTag tone={deadlineTone}>{deadline}</PixanoTag>}
    facts={[
      { label: 'Pasta', value: task.folder?.trim() || 'Sem pasta' },
      { label: 'Duração', value: `${task.durationMinutes} min` },
      { label: 'Estado', value: task.status === 'completed' ? 'Concluída' : task.status === 'paused' ? 'Pausada' : 'Em aberto' },
      { label: 'Prazo', value: deadline },
    ]}
    actions={children}
  />;
}
