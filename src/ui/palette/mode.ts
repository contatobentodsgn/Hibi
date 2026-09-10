export type PaletteMode = 'command' | 'assistant'

// Vazio ou começando com "/" é comando; qualquer outra coisa é uma frase para o Taby.
// `turnActive` é o que corrige o bug crítico: enviar uma mensagem limpa o campo (query vira ''),
// e sem esse sinal a paleta cairia de volta em modo comando bem quando um turno está na tela —
// mostrando a lista inteira de comandos ao lado da resposta, e fazendo ↵ navegar/fechar em vez
// de confirmar. Um campo vazio só significa "modo comando" quando não há turno em andamento.
export const paletteModeFor = (input: string, turnActive = false): PaletteMode => {
  const trimmed = input.trimStart()
  if (trimmed.startsWith('/')) return 'command'
  if (turnActive) return 'assistant'
  return trimmed === '' ? 'command' : 'assistant'
}
