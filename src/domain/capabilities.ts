export type CapabilityStatus = 'available' | 'unavailable';
export type CapabilityScope = 'local' | 'external' | 'hardware';

export interface LocalCapability {
  id: 'tasks' | 'reminders' | 'calendar' | 'focus' | 'notes' | 'external-ai' | 'hardware';
  label: string;
  status: CapabilityStatus;
  scope: CapabilityScope;
  description: string;
}

export const LOCAL_CAPABILITIES: LocalCapability[] = [
  { id: 'tasks', label: 'Tasks', status: 'available', scope: 'local', description: 'Read your tasks from this device.' },
  { id: 'reminders', label: 'Reminders', status: 'available', scope: 'local', description: 'Read your active reminders from this device.' },
  { id: 'calendar', label: 'Calendar', status: 'available', scope: 'local', description: 'Read scheduled blocks from this device.' },
  { id: 'focus', label: 'Focus', status: 'available', scope: 'local', description: 'Help with the local focus timer.' },
  { id: 'notes', label: 'Notes', status: 'available', scope: 'local', description: 'Read your notes from this device.' },
  { id: 'external-ai', label: 'External AI', status: 'unavailable', scope: 'external', description: 'Não acessa serviços de IA externos ou a internet.' },
  { id: 'hardware', label: 'Hardware', status: 'unavailable', scope: 'hardware', description: 'Não controla microfone, câmera ou outros dispositivos.' },
];
