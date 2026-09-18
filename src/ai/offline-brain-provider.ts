import type { AiProvider, AiProviderProposal, AiProviderRequest } from './contracts'
import { createCorrelationId } from './electron-provider'

type OfflineBrainBridge = {
  runLocalModel?: (input: { requestId: string; prompt: string }) => Promise<{ requestId: string | null; status: 'complete' | 'cancelled' | 'unavailable'; text: string }>
  cancelLocalModel?: (requestId: string) => Promise<boolean>
}

/** The engine runs a 2048-token context and reserves 512 for the answer; ~4k chars keeps the prompt inside the rest. */
export const OFFLINE_BRAIN_PROMPT_CHARS = 4_000
const MAX_EVIDENCE_CHARS = 1_200
const MAX_TRANSCRIPT_CHARS = 1_200
const MAX_REPLY_CHARS = 2_000
const MODEL = 'qwen3-1.7b'

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/** Keeps the newest lines that fit, so the model sees what was just said. */
function newestWithin(lines: readonly string[], max: number): string[] {
  const kept: string[] = []
  let used = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    if (used + line.length + 1 > max) break
    kept.unshift(line)
    used += line.length + 1
  }
  return kept
}

const PORTUGUESE_HINT = /[ãõçáéíóúâêô]|\b(oi|olá|você|voce|não|nao|que|para|uma|meu|minha|como|eu|estou|estiver|tudo|bem|dica|hoje|amanhã)\b/i

/** The UI does not pass its language, and the small model drifts to English unless told explicitly. */
export function offlineBrainLanguage(request: AiProviderRequest): 'pt' | 'en' {
  if (request.locale.toLowerCase().startsWith('pt') || PORTUGUESE_HINT.test(request.message)) return 'pt'
  return 'en'
}

export function buildOfflineBrainPrompt(request: AiProviderRequest): string {
  const language = offlineBrainLanguage(request) === 'pt' ? 'Brazilian Portuguese' : 'English'
  const sections = [
    `You are Taby, the assistant inside the Hibi app. Always reply in ${language}, short and direct, in at most 4 sentences. Never invent events, tasks or data that are not listed below. You cannot create, schedule, change or delete anything: never say that you did or that you will. If the user asks for an action, say you could not do it from here.`,
    `Now: ${request.currentTime}`,
  ]
  const evidence = newestWithin(request.contextEvidence.map((item) => `- ${item.label}: ${clip(item.content, 300)}`), MAX_EVIDENCE_CHARS)
  if (evidence.length) sections.push(`Context:\n${evidence.join('\n')}`)
  const transcript = newestWithin(request.recentTranscript.map((entry) => `${entry.role === 'user' ? 'User' : 'Taby'}: ${clip(entry.content, 400)}`), MAX_TRANSCRIPT_CHARS)
  if (transcript.length) sections.push(`Recent conversation:\n${transcript.join('\n')}`)
  const fixed = sections.join('\n\n')
  const suffix = '\n/no_think'
  const question = clip(request.message, OFFLINE_BRAIN_PROMPT_CHARS - fixed.length - suffix.length - 12)
  // `/no_think` turns off Qwen3's reasoning block, which would eat the 512-token answer budget.
  return `${fixed}\n\nUser: ${question}${suffix}`
}

export function cleanOfflineBrainReply(text: string): string {
  return clip(text.replace(/<think>[\s\S]*?(<\/think>|$)/g, ''), MAX_REPLY_CHARS)
}

// O modelo pequeno às vezes promete o que não pode fazer: "Marquei uma reunião amanhã às 15h" sem
// nenhum bloco criado. Quem só conversa não pode dizer que agiu — a resposta vira a verdade, com o
// jeito de pedir que o Taby entende.
const ACTION_CLAIM = /\b(marquei|agendei|criei|adicionei|anotei|salvei|reservei|removi|apaguei|exclu[íi]|cancelei|coloquei|lembrarei|vou\s+(?:te\s+|lhe\s+)?(?:lembrar|marcar|agendar|criar|adicionar|anotar|salvar|ligar|avisar)|(?:est[áa]|ficou)\s+(?:marcad|agendad|criad|salv)[ao]|I(?:'ve| have)?\s+(?:scheduled|created|added|booked|saved|set)|I(?:'ll| will)\s+(?:remind|schedule|create|add|book))\b/iu

export function honestOfflineBrainReply(reply: string, language: 'pt' | 'en'): string {
  if (!ACTION_CLAIM.test(reply)) return reply
  return language === 'pt'
    ? 'Não fiz nada ainda: por aqui eu só converso. Para eu agir, peça assim: "marque uma reunião amanhã às 15h", "crie uma tarefa revisar contrato" ou "me lembra de ligar às 16h".'
    : 'I have not done anything yet: here I can only talk. To make me act, say for example "marque uma reunião amanhã às 15h" or "crie uma tarefa revisar contrato".'
}

function abortError(): DOMException {
  return new DOMException('The AI turn was cancelled.', 'AbortError')
}

/**
 * Answers conversational turns with the verified on-device model. Anything the
 * local tools recognise as an action stays with them, and a missing or unverified
 * model falls back to their reply instead of failing the turn.
 */
export class OfflineBrainProvider implements AiProvider {
  readonly id = 'offline-brain'
  readonly label = 'Hibi offline brain'

  constructor(private readonly bridge: OfflineBrainBridge, private readonly tools: AiProvider) {}

  async generate(request: AiProviderRequest, signal: AbortSignal): Promise<AiProviderProposal> {
    const proposal = await this.tools.generate(request, signal)
    const toolsProposal: AiProviderProposal = {
      ...proposal,
      providerMetadata: { ...proposal.providerMetadata, providerId: proposal.providerMetadata?.providerId ?? this.tools.id, provider: proposal.providerMetadata?.provider ?? this.tools.label },
    }
    // Uma ação reconhecida, ou uma pergunta de volta ("não entendi o horário"), é a resposta: o modelo
    // responderia por cima dela com uma conversa.
    if (toolsProposal.toolCalls.length || toolsProposal.providerMetadata?.finishReason === 'needs-clarification' || !this.bridge.runLocalModel) return toolsProposal
    if (signal.aborted) throw abortError()
    const requestId = createCorrelationId().slice(0, 80)
    const cancel = () => { void this.bridge.cancelLocalModel?.(requestId) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      let result: Awaited<ReturnType<NonNullable<OfflineBrainBridge['runLocalModel']>>>
      try {
        result = await this.bridge.runLocalModel({ requestId, prompt: buildOfflineBrainPrompt(request) })
      } catch (error) {
        // O modelo falhou (memória, motor nativo): a pergunta segue com as ferramentas locais em vez
        // de terminar em "Provider unavailable". Cancelamento continua sendo cancelamento.
        if (signal.aborted) throw abortError()
        return toolsProposal
      }
      if (signal.aborted || result.status === 'cancelled') throw abortError()
      const reply = result.status === 'complete' ? honestOfflineBrainReply(cleanOfflineBrainReply(result.text), offlineBrainLanguage(request)) : ''
      if (!reply) return toolsProposal
      return {
        reply,
        toolCalls: [],
        notchPresentation: null,
        providerMetadata: { providerId: this.id, provider: this.label, model: MODEL },
      }
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }
}
