/** O que a barra do Taby mostra; vem do processo principal (`electron/taby-bar.cjs`). */
export type TabyBarMode = 'input' | 'listening' | 'thinking' | 'reply' | 'confirmation' | 'notice';
export type TabyBarContent = Readonly<{
  requestId: string;
  mode: TabyBarMode;
  kind: string;
  text: string | null;
  actions: readonly Readonly<{ id: string; label: string }>[];
}>;
