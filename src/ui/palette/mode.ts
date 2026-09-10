export type PaletteMode = 'command' | 'assistant'

// Vazio ou começando com "/" é comando; qualquer outra coisa é uma frase para o Taby.
export const paletteModeFor = (input: string): PaletteMode => { const trimmed = input.trimStart(); return trimmed === '' || trimmed.startsWith('/') ? 'command' : 'assistant' }
