# Auditoria dos kits de UI (`/Volumes/Games/Projetos/Hibi/UI`)

Data: 2026-09-09. Método: os cinco `.fig` foram abertos como contêineres (`meta.json`, `thumbnail.png`, `images/`) e o `canvas.fig` foi descompactado (deflate no arquivo de 2024, zstd nos de 2026) para extrair nomes de componentes, variantes, estilos, fontes e autoria. Valores exatos de cor e tipografia exigem os arquivos abertos no Figma e ficam como pendência no fim.

## 1. O que são os arquivos

Todos os cinco são **produtos comerciais da UI8** (`ui8.net/bento-cards`, `– by UI8`, `tam@ui8.net`). Não são desenhos do Hibi.

| # | Arquivo | Tamanho | Formato | Identidade interna | O que contém |
| --- | --- | --- | --- | --- | --- |
| 1 | `Bento Card v3_ SimpleList.fig` | 298,7 MB | fig-kiwi 2024 (deflate) | "Bento Cards v. 4 · UI Components" | Template de produto ("SimpleList", página link-in-bio) montado sobre o kit Bento Cards. Componentes com **estados de interação** (default/hover/active/focus/press/disable/placeholder/typing/selected): Avatar, Button, Circle Icon Button, Follow button, Comment input, toggles, progress bar, Card. 225 imagens embutidas respondem pelo tamanho. |
| 2 | `Bento Pro_ Multipurpose v2.fig` | 61,0 MB | fig-kiwi 2026 (zstd) | "Bento Pro: Multipurpose v2" | Widgets/cards de dashboard, escuro-primeiro, com variante booleana **`Light mode`** em 56 conjuntos. Sistema de tokens real (ver §3). Guia "How to edit Bento Colors", Docs, `Effects.mp4`, mockups de iPhone (variantes Titanium). |
| 3 | `Bento Pro_ Multipurpose.fig` | 79,8 MB | fig-kiwi 2026 (zstd) | "Bento Pro: Multipurpose" | Versão anterior de (2): 17 conjuntos com `Light mode` contra 56. **Subconjunto de (2).** |
| 4 | `BentoCards-v1.fig` | 104,8 MB | fig-kiwi 2026 (zstd) | "BentoCards" | 29 cards ilustrados de *feature* (`Card=<nome>` × `Horizontal view=on/off` × `Text=Top/Bottom/Left/Right`) e 31 ilustrações numeradas. Contém **shaders GLSL** (lygia SDF) em preenchimentos. |
| 5 | `BentoCards.fig` | 104,7 MB | fig-kiwi 2026 (zstd) | "BentoCards" | **Mesmo arquivo que (4)** re-salvo: 78 766 strings em comum, 5 exclusivas. |

Conjunto efetivo: **três kits**, não cinco. (3) é redundante com (2); (5) é redundante com (4).

## 2. Redundância e limpeza

| Ação | Arquivo | Ganho |
| --- | --- | --- |
| Remover | `Bento Pro_ Multipurpose.fig` (3) | 79,8 MB; elimina ambiguidade sobre qual versão vale |
| Remover | `BentoCards-v1.fig` (4) ou `BentoCards.fig` (5) — são iguais | 104,8 MB |
| Manter | (2) Bento Pro v2, um dos BentoCards, (1) SimpleList como referência de estados | — |

A pasta `UI/` é irmã do repositório e não está rastreada — deve continuar assim. Os `.fig` não devem entrar no git (650 MB e licença; ver §6).

Erro de digitação a corrigir se o kit for editado: a propriedade de variante em (4)/(5) chama-se `Vertical vew` (sic).

## 3. O que tem valor de engenharia

**Bento Pro v2 traz um sistema de tokens de verdade** — é a única peça dos cinco arquivos que vale importar como estrutura, e não como desenho:

- Escala neutra `shade01…shade10`, cada uma com passos de opacidade `10…100` (100 tokens primitivos).
- Semânticos: `Backgrounds/{primary, surface1, surface2, surface3, subtle, highlight, pop, card, dark1, dark2, wireframe, transparent}`, `Stroke/{subtle, superlight, bright, focus, highlight, stroke1, stroke2, card-dark, card-light, gradient-horizontal}`, `Text/{primary, secondary, tertiary, hero, fixed, light}`, `Depth/{card-dark, card-light, dark, light}`, `Accent/Accent`.
- Tema claro/escuro modelado como **variante booleana por componente** (`Light mode=True/False`), não como modo de variável. Isso é bom para inspecionar no Figma e ruim para gerar código: no CSS o correto é um único componente com tokens que mudam por tema.

**Escala tipográfica** (SimpleList e BentoCards): pares tamanho/entrelinha `10/12, 12/16, 12/20, 14/20, 14/24, 16/24, 20/24, 24/28, 32/40, 40/48, 48/56` — grade de entrelinha em múltiplos de 4. Estilos nomeados `Display, H2, Body 1/2 (R/M/SB/B), Caption 1/2`.

**Estados de interação** (SimpleList): o único kit com hover/focus/press/disable modelados. Útil como referência de comportamento para botões e inputs do Hibi, independentemente da estética.

## 4. Compatibilidade com o Hibi atual

| Dimensão | Hibi hoje ([`src/ui/theme.css`](../src/ui/theme.css)) | Kits | Tensão |
| --- | --- | --- | --- |
| Tema | Só claro. Sem `prefers-color-scheme`, sem `data-theme`. | Escuro-primeiro (fundos `#191919`–`#373737`), claro como variante. | **Alta.** Adotar os kits implica criar tema escuro do zero. |
| Tokens | 8 variáveis: `--paper #f3f2ef`, `--ink #151515`, `--muted`, `--line`, `--orange #fb7017`, `--green`, `--blue`, `--amber`. Arquivo minificado em uma linha (12 KB). | ~145 tokens semânticos + 100 primitivos (Bento Pro v2). | **Alta.** Não há camada de tokens; a migração é o momento de desminificar o CSS. |
| Identidade | Editorial em papel: Georgia serif para display (12 usos), Inter no corpo, laranja como acento. | Vidro escuro, gradientes, brilho, mono. | **Alta.** São direções opostas. |
| Fontes | Inter + Georgia (sistema). | 9 famílias no conjunto: JetBrains Mono (dominante em Bento Pro, 421 refs), Inter/Inter Display, SF Pro, Instrument Sans, Rubik, Manrope, Poppins, DM Sans, Satoshi. | **Média.** App offline-first precisa empacotar fontes; SF Pro não pode ser empacotada (só via sistema no macOS). |
| Tipografia | Títulos fluidos com `clamp()` (38–64 px, 58–105 px); corpo 10–16 px. | Escala fixa em grade de 4 px. | Média. |
| Efeitos | Sombras simples, cantos 9–24 px. | Shaders GLSL, vídeos, máscaras em gradiente. | **Alta para tradução.** Shader não vira CSS: precisa rasterizar (PNG/WebP) ou descartar. |
| Escopo dos componentes | Superfícies de produto: tarefas, calendário, foco, lembretes, paleta. | Bento Pro: widgets de dashboard (progress, cloud drive, analytics, user video). BentoCards: cards de *marketing/landing*. | BentoCards é quase irrelevante para as telas do produto; serve para estados vazios, onboarding e "Sobre". |

Cards de BentoCards com encaixe plausível em estados vazios do Hibi: `Calendar`, `Roadmap`, `Workspace`, `Invite team member`, `Toggle`, `Performance`, `File - Folder`, `Integrations`.

## 5. A decisão que precede tudo

O [documento de design](hey-taby-replica-design.md) define o Hibi como **réplica de estudo do Hey Taby**, e existe um [`parity-audit.md`](parity-audit.md) que mede fidelidade ao original. A estética dos kits — escura, de vidro, mono — **rompe a paridade** por definição.

Os trabalhos recentes (IA em produção, conectores, OAuth, API local) apontam para o Hibi como produto próprio, e não mais como réplica. Se essa for a direção, adotar identidade própria faz sentido. Mas é uma decisão de produto, não de UI, e precisa ser tomada explicitamente antes de mover um pixel: os dois caminhos levam a trabalhos incompatíveis.

## 6. Licença

Kits da UI8 são licenciados por assento e permitem uso em produtos finais; **não permitem redistribuir os arquivos-fonte**. Pontos a confirmar com o comprovante de compra:

- A licença cobre a equipe que vai editar os arquivos (não só quem comprou).
- Uso em aplicativo distribuído (DMG assinado) está dentro do permitido — normalmente sim.
- Satoshi (Fontshare) e SF Pro (Apple) têm licenças próprias; as demais são OFL.

Os `.fig` ficam fora do repositório em qualquer cenário.

## 7. Recomendação

1. **Decidir**: réplica com paridade ou produto próprio (§5). Nada abaixo faz sentido sem isso.
2. Se produto próprio: importar de Bento Pro v2 **o sistema de tokens e o modelo claro/escuro**, não os widgets. Mapear o tema claro atual do Hibi (papel, tinta, laranja) para os semânticos `Backgrounds/Text/Stroke/Depth` e derivar o escuro deles. Fontes: **Inter + JetBrains Mono** apenas.
3. Usar SimpleList como referência de **estados** para botões, inputs e toggles.
4. Reservar BentoCards para estados vazios/onboarding; não para as superfícies de tarefa e calendário.
5. Limpar a pasta: remover (3) e um de (4)/(5) — cerca de 185 MB.
6. Validar contraste de `Text/Tertiary` e `Text/Secondary` sobre `Backgrounds/subtle` e `surface1-3` antes de adotar — é o ponto onde kits escuros de vidro costumam falhar em acessibilidade. Não dá para medir sem os hex.

## 8. Pendências que exigem o Figma aberto

O acesso ao Figma está autenticado (conta Kizuna). Com os arquivos importados no Figma e as URLs compartilhadas, dá para extrair:

- Definições exatas das variáveis (hex por modo) para gerar `tokens.css`.
- Inventário de conjuntos de componentes com contagem de variantes.
- Capturas em alta resolução dos widgets candidatos e medição de contraste.
