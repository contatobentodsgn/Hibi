import { provenanceLabel } from '../../ai/assistant-turn'
import { useT } from '../../i18n/LocaleProvider'
import { failurePresentationFor } from '../assistant-presentation'
import type { AssistantTurnControls } from '../useAssistantTurn'

type Props = Readonly<{ submitted: string; state: AssistantTurnControls['state']; turn: AssistantTurnControls }>

// Extraído de CommandPalette: a densidade da JSX inline (seis status num só bloco) foi o que
// escondeu o bug crítico do modo. Mantém a mesma marcação e classes, só isolada e legível.
export function PaletteTurn({ submitted, state, turn }: Props) {
  const t = useT()
  const failure = state.status === 'failure' ? failurePresentationFor(state.failure) : null
  const provenance = state.status === 'streaming' || state.status === 'replied' || state.status === 'confirmation' ? provenanceLabel(state.provenance) : ''

  return <div className="palette-turn" aria-live="polite">
    <div className="palette-line"><span className="tag orange">{t('palette.you')}</span><span>{submitted}</span></div>
    {state.status === 'streaming' && <div className="palette-line" role="status"><span className="tag orange">{t('palette.assistant')}</span><div><strong>{state.text || (state.cancelRequested ? t('palette.cancelling') : t('palette.thinking'))}</strong>{provenance && <small className="palette-provenance">{provenance}</small>}<div className="palette-actions"><button type="button" className="outline" onClick={turn.stop}>{t('palette.stop')}</button></div></div></div>}
    {state.status === 'replied' && <div className="palette-line"><span className="tag orange">{t('palette.assistant')}</span><div><span className="palette-reply">{state.text}</span>{provenance && <small className="palette-provenance">{provenance}</small>}</div></div>}
    {state.status === 'confirmation' && <div className="palette-line" role="alert"><span className="tag amber">{t('palette.confirmation')}</span><div><strong className="palette-reply">{state.text}</strong>{provenance && <small className="palette-provenance">{provenance}</small>}<div className="palette-actions"><button type="button" className="primary" onClick={() => void turn.confirm()}>{t('palette.confirm')}</button><button type="button" className="outline" onClick={() => void turn.cancelConfirmation()}>{t('palette.cancel')}</button></div></div></div>}
    {state.status === 'executed' && <div className="palette-line"><span className={`tag ${state.partialFailure ? 'amber' : 'green'}`}>{t('palette.assistant')}</span><span className="palette-reply">{state.summary}</span></div>}
    {state.status === 'cancelled' && <div className="palette-line"><span className="tag amber">{t('palette.assistant')}</span><span>{state.text}</span></div>}
    {failure && <div className="palette-line" role="alert"><span className="tag amber">{t('palette.assistant')}</span><div><strong>{failure.title}</strong><p className="muted">{failure.detail}</p><div className="palette-actions">{failure.canRetry && <button type="button" className="outline" onClick={() => void turn.retry()}>{t('palette.retry')}</button>}{failure.canUseLocalFallback && <button type="button" className="primary" onClick={() => void turn.useLocalFallback()}>{t('palette.useLocal')}</button>}</div></div></div>}
  </div>
}
