import type { CompanionEvent, CompanionPresentation } from './contracts';
import { initialCompanionState, reduceCompanion } from './reducer';

export type NotchCompanionPresentation = Readonly<{ requestId: string; kind: string; text: string | null; actions: readonly { id: string; label: string }[]; interaction: 'passthrough' | 'capture' }>;
type Callbacks = Readonly<{ show: (presentation: NotchCompanionPresentation) => void; hide: (requestId: string) => void }>;

const toNotchPresentation = (state: CompanionPresentation): NotchCompanionPresentation | null => state.requestId === null ? null : { requestId: state.requestId, kind: state.kind, text: state.text, actions: state.actions, interaction: state.interaction };

export class CompanionController {
  private state: CompanionPresentation = initialCompanionState;
  constructor(private readonly callbacks: Callbacks) {}
  get presentation(): CompanionPresentation { return this.state; }
  dispatch(event: CompanionEvent): CompanionPresentation {
    const previous = this.state; const next = reduceCompanion(previous, event); this.state = next;
    const presentation = toNotchPresentation(next);
    // Só apresenta quando o estado muda de verdade: o relógio despacha `time.elapsed` a cada segundo
    // e o reducer devolve o mesmo estado quando nada mudou. Reapresentar a cada tique traz de volta
    // ao notch um cartão que já foi respondido e escondido.
    if (presentation) { if (next !== previous) this.callbacks.show(presentation); }
    else if (previous.requestId) this.callbacks.hide(previous.requestId);
    return next;
  }
}
