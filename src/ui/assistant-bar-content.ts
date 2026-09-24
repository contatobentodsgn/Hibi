/** O que a barra do Assistant mostra; vem do processo principal (`electron/assistant-bar.cjs`). */
export type AssistantBarMode = 'input' | 'listening' | 'thinking' | 'reply' | 'confirmation' | 'notice';
export type AssistantBarContent = Readonly<{
  requestId: string;
  mode: AssistantBarMode;
  kind: string;
  text: string | null;
  actions: readonly Readonly<{ id: string; label: string }>[];
}>;
