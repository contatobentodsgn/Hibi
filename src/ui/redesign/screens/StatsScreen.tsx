import { StatsWorkspace } from '../../StatsView'
import type { ActivityRecord } from '../../../domain/activity'
import './stats-screen.css'

type Props = Readonly<{ records: readonly ActivityRecord[]; referenceDate: Date; onEvent: (action: string, detail: string, result?: string) => void }>

/** U18: superfície visual nova, mantendo o relatório e a exportação de Estatísticas existentes. */
export function StatsScreen({ records, referenceDate, onEvent }: Props) {
  return <div className="stats-screen-host" data-screen="stats"><StatsWorkspace records={records} referenceDate={referenceDate} onEvent={onEvent} /></div>
}
