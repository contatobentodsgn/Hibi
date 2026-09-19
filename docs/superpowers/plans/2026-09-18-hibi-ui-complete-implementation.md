# Hibi — Plano completo de implementação da nova UI

> **For agentic workers:** Executar por unidade revisável usando `subagent-driven-development` ou `executing-plans`. As caixas indicam trabalho pendente, não funcionalidades ausentes na aplicação atual. Conferir `AGENTS.md` e as reservas da issue #48 antes de implementar cada unidade.

**Goal:** Aplicar a linguagem visual aprovada a todas as superfícies do Hibi, com Adaptive Notch Navigation Bar oficial, temas claro/escuro, posição superior/inferior configurável, preservação das funções atuais e validação no app real.

**Architecture:** Manter React, Electron, domínio, persistência e serviços atuais. Migrar apresentação em entregas pequenas sobre tokens Hibi e componentes HeroUI; reutilizar os contratos existentes. A navegação da janela, o mascote nativo e a barra rápida do Taby são superfícies distintas e precisam de integração visual sem misturar seus ciclos de vida.

**Tech Stack:** React 19, TypeScript e Vite existentes; HeroUI React/Styles v3, Tailwind CSS v4, Motion e Lucide conforme compatibilidade validada pelo responsável pelas dependências; Electron/AppKit e serviços locais atuais.

---

## 0. Estado da execução

Atualizado a cada unidade por quem a implementa. **Desde 19/09/2026, por decisão do usuário, o Claude implementa as unidades e o Codex revisa os PRs.** Cada PR traz as provas e os números reais das suítes. Este quadro diz em que ponto a migração está e o que a próxima unidade precisa saber.

| Unidade | Estado | PR | Observações para a revisão |
| --- | --- | --- | --- |
| U00 | Concluída (Codex) | #165, #166 | Faltou medir o desempenho da UI atual; o Claude mediu no #166 (`docs/redesign/performance-baseline.md`). As capturas do app atual foram feitas na U03 (`docs/redesign/u03-assets/antes/`, as 17 telas nos dois temas); a matriz por ação fica para cada tela. |
| U01 | Concluída (Claude) | #167 | HeroUI 3.2.6, Tailwind 4.3.3, Motion 12.43.0, Lucide 0.577.0. Integração isolada das telas atuais; guia em `docs/redesign/u01-foundation.md`. |
| U02 | Concluída (Claude) | #168 | Tokens do preview em `src/ui/redesign/theme.css`, `HibiUiRoot`, galeria só em desenvolvimento (`?overlay=ui-gallery`), reset do Tailwind restrito à nova UI e tema aplicado antes do primeiro desenho. |
| U02b | Concluída (Claude) | #169 | Correção de fidelidade ao preview, pedida pelo usuário depois de uma auditoria contra o código e as capturas dele: ação principal escura, os quatro tons do preview, etiquetas pastéis, "Mais contraste", "Reduzir movimento", fonte do sistema, respiro do cartão e Ajustes conciliados com o preview. Comparação lado a lado em `docs/redesign/u02b-assets/`. |
| U03 | Concluída (Claude) | #170 | A Adaptive Notch Navigation substituiu o dock: Hoje · Agenda · Tarefas · Notas · Taby na barra, e Comandos, "Mais" (provisório) e Ajustes no notch da direita. O notch confere pixel a pixel com o preview (claro em cima e embaixo, escuro contra o preview assentado, em 1x e Retina), sem emendas em larguras ímpares. Achou e corrigiu dois defeitos da base (ordem das camadas e variante `dark` do HeroUI). Comparações, capturas da janela real e da UI antiga em `docs/redesign/u03-assets/`. Duas pendências para a U04, abaixo. |
| U04 | Concluída (Claude) | #171 | A seção Aparência da nova UI (`src/ui/redesign/settings/AppearanceSettings.tsx`) nos Ajustes atuais: os três painéis do preview (Tema, "Um toque de cor", Reduzir movimento e Mais contraste), que conferem 0 px com o preview em 1x, e o painel novo "Menu de navegação" (Superior/Inferior, com miniaturas). A posição fica guardada, vale na hora e não remonta telas, rascunhos nem a sessão de foco. Comparações em `docs/redesign/u04-assets/`. |
| U04b | Concluída (Claude) | #172 | Posição automática, decidida pelo usuário: a barra desce só quando o mascote do notch e a janela do Hibi estão no mesmo monitor; em monitores diferentes, fica em cima. "Automática" vira o padrão; Superior e Inferior fixam a posição. O processo principal diz à tela se os dois dividem o monitor e avisa quando isso muda (canal `hibi:notch:window-placement`). |
| U04c | Em revisão (Claude) | este PR | Tema escuro com as telas atuais: o conteúdo para antes do notch claro, que sumia sobre a ilha clara, em cima (rolando) e embaixo (sempre). A regra depende de `.legacy-surface` e some sozinha com as telas novas, que voltam ao desenho do preview. |
| U05–U28 | Pendentes | — | A U05 é a próxima. |

**Decisões registradas durante a execução:**
- **Licença do componente da navegação** (`adaptive-notch-navigation-bar.tsx`): o usuário o desenvolveu no Codex, a partir de um prompt. É obra do projeto, sem licença de terceiros a conferir, e está liberado para a U03.
- **Contraste acima do preview:** o texto branco sobre os acentos do preview e o texto secundário sobre o fundo claro ficavam entre 4,0:1 e 4,3:1. Os tokens foram escurecidos o mínimo para passar de 4,5:1: Lavanda `#8071a7` → `#7c6da1`, Azul `#5882ac` → `#5279a0`, Menta `#4d8765` → `#498060`, Pêssego `#a56e50` → `#9d684c`, texto secundário `#74747d` → `#6e6e76`. Um e2e mede os dois temas nos quatro tons.
- **Os quatro tons do preview (U02b), no lugar dos cinco do Hibi.**
  - O preview oferece Lavanda (o padrão), Azul, Menta e Pêssego, "nos detalhes, sem chamar mais atenção que você".
  - A escolha salva é convertida: aurora e iris → Lavanda, ocean → Azul, moss → Menta, rose → Pêssego.
  - As telas atuais usam o tom antigo mais próximo (Lavanda o de Íris, Azul o de Oceano, Menta o de Musgo, Pêssego o laranja padrão). **Consequência visível:** para quem nunca escolheu tom, os detalhes das telas atuais passam de laranja a lavanda.
  - As chaves antigas `tint.aurora/ocean/moss/iris/rose` ficaram no dicionário, porque o protocolo só permite acrescentar; a U28 as remove.
- **Ação principal é o botão escuro do preview (U02b).** No preview, "Entrar em foco" e as demais ações principais são `#242428` com texto branco nos dois temas (`.dark-button`), e ele nunca usa o botão de acento do HeroUI. O botão secundário é papel com sombra (`.soft-button`). O acento fica nos detalhes: etiquetas, dia atual, gráficos, foco e seleção.
- **Etiquetas pastéis do preview** (`HibiTag`: neutra, lavanda, azul, pêssego e menta, com o pontinho opcional), distintas do `Chip` do HeroUI, que fica para estados (sucesso, aviso, erro).
- **"Mais contraste" e "Reduzir movimento"** existem no preview (Aparência) e não estavam no plano. Agora:
  - são preferências do `ThemePreference` (`data-contrast`, `data-motion`), com interruptores provisórios em Ajustes › Aparência das telas atuais, até a U04;
  - valem na nova UI (os valores do preview) e nas telas atuais.
- **Fonte:** a nova UI usa a fonte do sistema, como o preview. A Inter das telas atuais vazava pelo `--default-font-family` do reset do Tailwind, e só a comparação lado a lado mostrou isso.

**Decisões da U03 (navegação oficial):**
- **Semântica de navegação, não de abas:** `nav` com `aria-current="page"` no destino atual; setas, Home e End percorrem a barra; no modo compacto, a lista fechada sai do Tab (`inert`), abrir leva o foco ao destino atual, escolher ou Escape devolvem o foco ao botão.
- **O texto da barra é o que o preview mostra, não o que o código dele declara.** O CSS global do preview (`button { font: inherit; color: inherit }`, sem camada) vence os utilitários do componente: nas capturas aprovadas, todos os itens ficam no branco da barra, com peso normal. A pílula e o ícone marcam o destino atual. O Hibi reproduz esse resultado.
- **Ajustes, Comandos e "Mais" no notch da direita**, o espaço de ações do componente (`rightContent`, com o `.notch-action` do preview). O "Mais" é provisório: guarda Foco, Lembretes, Hábitos, Metas, Revisão, Estatísticas, Ajuda, Eventos, Feedback, Atualizações e Hardware até a U19 dar os acessos pelo contexto. Foco saiu da barra, porque na nova arquitetura é uma sessão aberta a partir de Hoje e das tarefas.
- **Um lugar marcado por vez:** o destino onde a rota mora (Lembretes marca Tarefas; Hábitos, Metas, Revisão e Estatísticas marcam Hoje), Ajustes para Ajuda, Feedback, Eventos, Atualizações e Hardware, e o "Mais" durante a sessão de foco. A trilha do topo do preview mostra o caminho: "Meu espaço / Tarefas / Lembretes". `routes.ts` resolve toda rota antiga (`destinationFor`), e o tipo obriga cada uma a ter lugar.
- **"Hoje" em vez de "Home":** chave nova `redesign.nav.today`; `nav.home` continua até a U28.
- **Modo compacto abaixo de 1280 px**, o ponto do preview. Na janela do app (mínimo de 960 px), ele aparece entre 960 e 1279 px, com as ações na própria ilha.
- **Botões do macOS dentro da moldura:** fechar, minimizar e ampliar passaram de (14, 12) para (20, 19): antes cortavam a quina da moldura; agora ficam na superfície, no eixo dos itens da barra.
- **Barra de rolagem fina e sem trilho**, como a do preview (`--hibi-scrollbar`).
- **Capturas escuras do preview:** `notch-dark-top.png` foi tirada no meio da transição de cor de 200 ms. A comparação escura usa o preview congelado servido de novo, que confere pixel a pixel com as capturas claras e a móvel.

**Decisões da U04 (preferências de aparência):**
- **A Aparência do preview, na nova UI, dentro dos Ajustes atuais.** Ela substitui o seletor de tema e os controles provisórios da U02b (`TintSettings` saiu). Os três painéis do preview conferem 0 px em 1x com o preview servido no modo notch, nos dois temas; o painel "Menu de navegação" é novo e segue o desenho das miniaturas de tema. Dentro das telas atuais, a seção leva o canvas da nova UI (`framed`): sem ele, o título claro do tema escuro sumia sobre a ilha clara.
- **Rádios do React Aria** (`RadioGroup`/`Radio` do HeroUI) no lugar dos botões com `aria-pressed` do preview: as setas trocam a opção e o leitor de tela diz qual está marcada.
- **Interruptor desligado em #d6d6dd nos dois temas**, como no preview (`--hibi-switch-off`); ligado, o acento.
- **Posição da barra:** chave `hibi.ui.navigation-position.v1` (seção 6); qualquer valor diferente de `bottom` vale como em cima. Se o armazenamento recusar, a posição vale até fechar o Hibi, e a seção diz isso. O `NavigationPreferencesProvider` (em `main.tsx`) é compartilhado entre o shell e os Ajustes; a prévia de desenvolvimento pode fixar a posição com `&position=`.
- **Nada remonta ao trocar tema, tom ou posição:** um e2e prova com um rascunho (o mesmo elemento continua lá) e com uma sessão de foco em andamento. O rascunho do Taby já se perde ao sair da tela hoje, então esse fluxo não o preserva e não entrou na prova.
- **O monitor do mascote não muda:** a Aparência nunca chama `setNotchDisplay` (e2e).

**Decisão da U04b (do usuário, 19/09): a barra desce quando o mascote divide a tela com a janela.**
- O problema: a janela nativa do mascote fica no centro do topo da tela e cobria o meio da barra quando a janela do Hibi encostava no topo (em tela cheia, sempre), com Agenda e Tarefas atrás do gato (`docs/redesign/u03-assets/app-real-tela-cheia-mascote.png`).
- A escolha, entre três caminhos: com o mascote na tela, a barra fica embaixo. **Só quando os dois estão no mesmo monitor**: com o mascote num monitor e a janela em outro, a barra continua em cima.
- Como ficou: "Automática" é o padrão da posição e segue essa regra na hora, quando a janela troca de monitor, quando os monitores mudam e quando o mascote muda de tela. "Superior" e "Inferior" continuam como escolhas fixas. O processo principal decide (`electron/mascot-placement.cjs`: a tela da janela é a que contém a maior parte dela) e só avisa quando a resposta muda.
- Digitar e enviar no Taby continua movendo o mascote (`mascote-ao-digitar-no-taby.png`).

**Decisão da U04c (pedida pelo usuário, 19/09): no escuro, as telas atuais não passam por baixo do notch.** No tema escuro o notch é claro, e as telas atuais são uma ilha clara nos dois temas: rolando por baixo dele (em cima) ou sempre (embaixo), o branco apagava o notch. Enquanto houver `.legacy-surface` na área de trabalho, a faixa da barra deixa de ser respiro dentro da rolagem e vira margem fora dela (`notch.css`): o conteúdo termina antes da faixa, e o notch fica sobre a superfície escura, como no preview. No claro nada muda, e as telas novas, escuras, voltam sozinhas ao desenho aprovado (conteúdo passando por baixo). Capturas em `docs/redesign/u04c-assets/`.

**Regras que valem para todas as próximas unidades** (nascidas na U01 e na U02 e seguradas por `tests/e2e/heroui-foundation.spec.ts`):
1. Toda superfície nova é montada dentro de `HibiUiRoot` (`src/ui/redesign/components/HibiUiRoot.tsx`), que cria o contêiner `.hibi-ui` e desenha popovers, menus e diálogos dentro dele.
2. **Todo CSS da nova UI vai em camada** (`@layer theme`, `components` ou `utilities`). Dentro de `.hibi-ui`, cada elemento descarta o CSS sem camada (`all: revert-layer`), porque é assim que o CSS das telas atuais fica de fora. Uma regra nova sem camada seria descartada do mesmo jeito. Estilo em linha continua valendo.
3. O Tailwind só lê `src/ui/redesign` e `src/ui/shell`. O reset dele vale só dentro de `.hibi-ui`, e a cópia é gerada por `scripts/scoped-preflight.mjs`.
4. As classes `tag`, `empty-state`, `block`, `filter` e `outline` existem nas telas atuais e no HeroUI ou no Tailwind; uma camada de proteção as isola fora de `.hibi-ui`. Classe nova nas telas atuais não pode repetir nome de componente do HeroUI nem de utilitário do Tailwind.
5. Cores só pelos tokens `--hibi-*` e pelas variáveis do HeroUI já mapeadas em `theme.css`; nada de hexadecimal solto numa tela.
6. **Toda unidade visual compara lado a lado com as capturas do preview antes do PR** (`preview-web/.impeccable/review/*.png`, com os hashes do `reference-manifest.md`) e anexa a comparação em `docs/redesign/<unidade>-assets/`. Conferir valores de CSS não basta: foi a comparação que achou a ação principal roxa, as etiquetas erradas e a fonte trocada.
7. A ação principal é o botão escuro (`variant="primary"`); o acento não pinta botões. Etiqueta do preview é `HibiTag`; `Chip` é só para estado.
8. Com "Reduzir movimento" (do Hibi ou do sistema), nenhuma animação da nova UI dura mais que um instante. Hoje a regra global das telas atuais (`motion.css`) também cobre a nova UI; na U28, ao remover `motion.css`, a regra de `theme.css` passa a ser a única, e o e2e continua valendo. Desde a U03, `HibiUiRoot` leva a preferência também ao Motion (`MotionConfig`), cujas animações rodam em JavaScript.
9. **`heroui.css` é o primeiro import de `src/main.tsx`** (U03). A primeira menção a uma camada fixa a ordem, e o CSS de um componente entra quando o módulo dele é avaliado; com outro CSS em camada antes, o reset passa por cima dos utilitários.
10. **`dark:` segue só o `data-theme` da raiz** (U03). A variante do HeroUI caía na preferência do macOS e casava com elementos aninhados na mesma classe; `heroui.css` a redefine.
11. **As primitivas `--hibi-*` ficam na raiz** (U03); as variáveis que o HeroUI lê, só dentro de `.hibi-ui`.
12. **Janela do macOS:** nada acima da barra declara `-webkit-app-region`. O Chromium monta as regiões na ordem da árvore e herda o valor, e até `none` vira `no-drag`. A faixa do topo arrasta; botões, conteúdo e menus, não.
13. **As telas atuais ficam fora de `.hibi-ui`** dentro do shell; cada tela reconstruída monta a própria `HibiUiRoot`. A prévia do shell sem as telas é `?overlay=ui-navigation`, só no desenvolvimento.

## 1. Estado deste documento e evidências

Plano consolidado em 18/09/2026. Substitui o plano de 17/09 para sequência e cobertura; o anterior permanece como histórico. Este documento é uma entrega de planejamento: não significa que as telas foram migradas, que houve reserva externa ou que testes do app foram executados nesta etapa.

Raiz do app: `/Volumes/Games/Projetos/Hibi/Hibi`.
Raiz do preview aprovado: `/Volumes/Games/Projetos/Hibi/preview-web`.
Arquivo de referência: `/Volumes/Games/Projetos/Hibi/Hibi-preview-adaptive-notch-validado-2026-09-18.zip`.

Base consultada após atualizar a referência remota: `origin/main` em `56859d3`, merge do PR #161. A `main` local observada estava em `6c0b7f1`; portanto, não usar o nome da branch local como prova de atualização. O checkout não foi trocado para escrever este plano. A branch `codex/local-ai-voice-device` é referência histórica, não a base de implementação: contém diferenças que removeriam correções posteriores se fosse promovida inteira.

Fontes efetivamente consultadas:

- `AGENTS.md`, árvore de `src/ui/` em `origin/main`, `src/main.tsx`, `src/App.tsx`, shell, rotas, tema e configurações.
- `SettingsView.tsx`, `AvailabilityView.tsx`, `UpdatePanel.tsx`, `TabyBar.tsx` e integração de calendários na principal.
- Comentários recentes da issue #48: o lote de produtividade do Claude foi concluído e liberado; PRs #138–#145 incorporados.
- Plano de 17/09 e implementação do preview, incluindo o componente original adaptado e seus caminhos SVG.
- Exportações locais de HeroUI 3.2.6 instaladas no preview. Os componentes citados abaixo existem nessa instalação; conferir assinaturas e compatibilidade na versão travada para o app antes de escrever código.

### Correções incorporadas à base que não podem regredir

| Recurso | Situação observada | Consequência para a migração |
| --- | --- | --- |
| Pontos de restauração | Lista e ação já presentes em Dados; PR #117 mencionado no status | Redesenhar e completar estados; não reconstruir banco, IPC ou adaptador |
| Foco persistente | Sessão continua após navegar, #138 | Não acoplar duração da sessão à montagem da nova tela |
| Calendário | Correções de ICS, dia inteiro, grade fora de 08h–22h e sincronização, #139/#144 | Reaproveitar helpers e callbacks atuais |
| Tarefas | Criação rápida respeita pasta filtrada, #140 | Manter contexto no formulário novo |
| Data local | Atualização na virada do dia, #141 | Reutilizar `useCalendarDay` e funções locais |
| Revisão, metas e lembretes | Ações reais e dispensas persistentes, #142 | Trocar apresentação preservando efeitos e validações |
| Notion | Prévia obsoleta recusada, #143 | Não ocultar nem contornar a recusa |
| Voz/modelo | Novos hooks, normalização e cancelamento presentes na principal | Integrar a versão atual, não copiar hooks antigos do preview |
| Barra rápida do Taby | Entrada separada `overlay=bar` em `src/main.tsx` | Incluir como superfície obrigatória na migração |
| Atualizações | `UpdatePanel` ligado a serviço real, coexistindo com texto estático em Availability | Consolidar a apresentação em torno do estado real |

## 2. Resultado esperado e limites

Ao terminar, todas as telas e todos os diálogos usados em produção terão os mesmos tokens, controles, padrões de interação e qualidade de acabamento. Nenhuma área acessível continuará com aparência legada por esquecimento. As funções atuais continuarão operando com dados reais.

Incluído: navegação, componentes compartilhados, cinco destinos principais, áreas secundárias, Ajustes completos, integrações, recuperação, estados vazios/erro/carregamento, barra de comandos, formulários, notificações dentro da janela, barra rápida do Taby e compatibilidade visual do notch nativo.

Não é requisito criar novas regras de produto para terminar a UI: projetos, subtarefas, anexos, conta/nuvem, automações propositivas e hardware ainda sem protocolo ficam no backlog de evolução da seção 15. Caso uma função já tenha entrado na principal quando sua tela for migrada, ela passa a fazer parte da matriz de paridade.

O preview aprova aparência e navegação visual. Não comprova persistência, permissões, disponibilidade de serviços ou funcionamento de botões. Cada tela de produção deve ligar os controles aos contratos atuais; números e mensagens demonstrativos não podem ser copiados como dados reais.

## 3. Arquitetura de informação oficial

### 3.1 Navegação diária

Menu principal, nesta ordem: **Hoje · Agenda · Tarefas · Notas · Taby**. Ajustes tem acesso separado e permanente, também alcançável pela busca de comandos. A navegação usa a Adaptive Notch Navigation Bar aprovada.

| Rota atual | Destino na nova UI | Acesso secundário obrigatório |
| --- | --- | --- |
| `home` | Hoje | Compromisso, próximas tarefas, foco, rotina, progresso e revisão |
| `agenda`, `day`, `week` | Agenda | Modos Dia/Semana; estado ativo comum |
| `tasks` | Tarefas | Pastas, filtros e criar tarefa |
| `reminders` | Tarefas → Lembretes | Link direto e comando; lembrete mantém modelo próprio |
| `notes` | Notas | Lista, busca e editor |
| `taby` | Taby | Histórico, conversa e voz |
| `focus`, `break` | Sessão de Foco/Pausa | Ação em Hoje, tarefas, comandos e indicador de sessão ativa |
| `habits` | Hoje → Rotina | Voltar para Hoje sem perder a data selecionada |
| `goals` | Hoje → Progresso | Acesso a metas e tendências |
| `stats` | Progresso → Tendências | Períodos e métricas existentes |
| `review` | Hoje → Revisão | Sugestões e ações existentes |
| `settings` | Ajustes | Busca e seções internas |
| `help`, `feedback` | Ajustes → Ajuda | Links e comandos existentes |
| `instrumentation` | Ajustes → Avançado → Diagnósticos | Sem poluir navegação diária |
| `updates` | Ajustes → Sobre e atualizações | Estado real do atualizador |
| `hardware` | Ajustes → Dispositivos | Disponibilidade e diagnóstico reais |

Não apagar rotas antigas na primeira entrega. Criar resolução para seu contexto novo. A remoção do menu Mais depende de todos os acessos substitutos estarem disponíveis; durante a transição ele pode permanecer temporariamente, mas não integra a versão final.

Hábitos, metas, estatísticas e revisão são ferramentas de uso, não configurações: ficam acessíveis por Hoje e comandos. Ajustes concentra preferências, conexões e manutenção.

### 3.2 Ajustes

**Conciliada com o preview em 19/09 (U02b).** A estrutura é a do preview: cinco grupos e dez seções, com os nomes dele. As funções do app que o preview não mostra entram na seção que as acolhe; só duas seções novas foram necessárias, marcadas como acréscimo.

| Grupo (preview) | Seção | Conteúdo |
| --- | --- | --- |
| Experiência | Aparência (preview) | Claro/Escuro/Sistema, os quatro tons ("Um toque de cor"), Mais contraste, Reduzir movimento; posição superior/inferior do menu; idioma e formato de horário |
| Experiência | Notch e personagem (preview) | Monitor, tamanho, teste do notch, mostrar o Taby ao abrir, reações do personagem; o Taby físico (dispositivo) quando existir |
| Experiência | Notificações (preview) | Estado real de permissão, teste e preferências disponíveis |
| Experiência | **Foco** (acréscimo) | Duração, ausência, pausa, timeout e alertas de foco existentes: o preview não tem lugar para eles |
| Experiência | **Geral** (acréscimo) | Iniciar ao entrar no Mac e comportamento da janela: o preview não tem lugar para eles |
| Assistente | IA e modelo local (preview) | Provedor, fallback, uso e modelo local (baixar, verificar, cancelar, remover) |
| Assistente | Voz (preview) | Voz pelo atalho, respostas faladas, permissões de microfone e reconhecimento |
| Conexões | Integrações (preview) | Google Calendar, Calendários do Mac/iCloud via EventKit, Notion e demais conectores existentes |
| Dados e sistema | Dados e recuperação (preview) | Exportar, importar, pontos de restauração e ações destrutivas |
| Dados e sistema | Privacidade (preview) | O que fica neste Mac, conversas fora do backup, API local e webhooks (tokens e segredos), diagnósticos e exportação de suporte |
| Suporte | Atalhos (preview) | Atalho global do Taby e a lista de atalhos do app |
| Suporte | Sobre o Hibi (preview) | Versão real, atualizações (verificar, baixar e instalar), ajuda e feedback |

As unidades U21 a U25 seguem esta tabela. Onde o título de uma unidade citar um grupo antigo ("Geral", "Taby e voz", "Dispositivos", "Avançado"), vale a seção correspondente acima.

Seções curtas podem compartilhar página, e não se criam páginas vazias. A busca abre a seção e destaca o controle encontrado; os textos pesquisáveis têm pt/en. Em janela estreita, a lista de seções vira um seletor acessível, mantendo título, busca e retorno.

## 4. Contrato visual e interativo

### 4.1 Referências congeladas

- Referência 16: composição dos widgets e hierarquia da tela Hoje.
- Referência 15: acabamento de estatísticas, métricas e controles segmentados.
- Referência 17: superfícies, cartões e detalhes de menus.
- Preview aprovado: forma da navegação, moldura, recortes curvos, claro/escuro e posição superior/inferior.
- ~~Preservar fonte e licença do componente anexado; confirmar licença antes de redistribuir o componente na aplicação pública.~~ Resolvido em 19/09: o componente foi desenvolvido pelo próprio usuário no Codex, a partir de um prompt (ver seção 0).

Antes do primeiro PR, conferir integridade do ZIP, extrair em diretório temporário e registrar hashes do componente, CSS e lockfile. Salvar capturas comparáveis do preview nos quatro modos e em janela estreita. Isso é a baseline de comparação; não depender de um servidor que pode ser alterado durante o desenvolvimento.

### 4.2 Adaptive Notch Navigation Bar

Fonte: `preview-web/src/components/ui/adaptive-notch-navigation-bar.tsx`. Destino proposto: `src/ui/shell/AdaptiveNotchNavigation.tsx`.

- Reutilizar a geometria SVG de `NotchLeftWing`, `NotchRightWing`, `NotchCornerLeftWing` e `NotchCornerRightWing`. Não substituir os encontros entre moldura e notch por retângulos com `border-radius`.
- Moldura contínua, conteúdo interno arredondado e barra conectada visualmente à borda escolhida, conforme referência.
- Claro: moldura/menu escuros; escuro: moldura/menu claros, seguindo a inversão aprovada. Adaptar cores por tokens sem alterar a silhueta.
- ~~Topo é o padrão para preferências ausentes.~~ Desde a U04b (decisão do usuário), o padrão é "Automática": em cima, e embaixo só quando o mascote do notch está no mesmo monitor que a janela. Superior e Inferior são escolhas fixas, persistentes, disponíveis em Ajustes.
- Manter indicação animada do destino ativo, foco visível, tooltip dos ícones e estados pressionado/desabilitado.
- Em larguras insuficientes, usar o modo compacto do componente aprovado. Não trocar silenciosamente para a variante híbrida/sidebar, que permanece apenas como comparativo histórico.
- Os cinco destinos e Ajustes continuam acessíveis no modo compacto; fechar menu após selecionar e devolver foco corretamente ao fechar sem seleção.
- A área de conteúdo reserva espaço para barra, moldura e controles da janela. Última linha, botões fixos e compositor não podem ficar cobertos.
- Ajustes/Busca precisam de acesso explícito mesmo se os slots opcionais de logo/ação estiverem ocultos no layout de referência.
- Revisar semântica: para rotas independentes preferir `nav` e `aria-current="page"`; se mantiver tablist, implementar o contrato completo de tabs com painel e teclado. Fidelidade visual não exige copiar problemas semânticos.

### 4.3 Tokens e componentes

Usar tokens semânticos para canvas, superfície, superfície elevada, texto principal/secundário, borda, foco, destaque, sucesso, atenção e erro. Fonte de verdade em `src/ui/redesign/theme.css`, ligada ao `ThemeProvider` atual. Não criar uma segunda preferência de tema.

Valores iniciais: ritmo de 4/8 px; paddings de 16/24 px; raios de 10–14 px para controles e 20–24 px para cartões; texto de corpo 14–16 px; tipografia de sistema; números tabulares para timer e agenda. Copiar valores medidos do preview quando já definidos, documentando ajustes para o desktop.

HeroUI fornece os controles; a identidade Hibi vem dos tokens e composições. Não criar wrapper de cada componente da biblioteca. Criar uma composição apenas quando houver responsabilidade própria ou repetição real.

| Necessidade | HeroUI previsto | Composição Hibi |
| --- | --- | --- |
| Ações | Button, ButtonGroup, Tooltip, Kbd | Ação principal, secundária, destrutiva e botão com estado assíncrono |
| Cartões | Card, Surface, Separator | Widget, cabeçalho de seção e resumo |
| Campos | Form, TextField, Input, TextArea, Label, Description, FieldError | Linha de preferência e campo com ajuda |
| Escolhas | Select, ComboBox, RadioGroup, Switch, Checkbox | Filtro, seleção de fontes e preferências |
| Datas | DatePicker, DateField, TimeField, Calendar | Adaptadores de valores para os formatos locais existentes |
| Listas | ListBox, Table, SearchField, Chip | Linha de tarefa, lembrete e ponto de restauração |
| Sobreposições | Modal, Drawer, Popover, Dropdown, AlertDialog | Detalhes, criação e confirmação |
| Estados | Skeleton, Spinner, Alert, EmptyState, Toast | Carregando, erro com tentar novamente e estado indisponível |
| Métricas | ProgressBar, ProgressCircle, Meter, Tabs | Resumos e gráficos específicos do Hibi |
| Conteúdo denso | Disclosure, Accordion, ScrollShadow | Avançado, histórico e detalhes técnicos |

A grade semanal, o timer, as mensagens do Taby, os gráficos e a geometria do notch são componentes próprios. O Calendar de HeroUI é seletor de data, não substituto automático da grade de compromissos.

### 4.4 Movimento e acessibilidade

- Feedback de controles: 100–160 ms; menus: 160–220 ms; expansão de painel: 220–320 ms como valores iniciais. **Tokens desde a U02b:** `--hibi-duration-control` 140 ms, `--hibi-duration-menu` 200 ms, `--hibi-duration-panel` 280 ms e `--hibi-ease`, zerados com "Reduzir movimento" do Hibi ou do sistema.
- Animar preferencialmente opacidade e transform; não animar altura de toda uma conversa a cada token.
- Respeitar redução de movimento do sistema; uma preferência explícita no app pode reduzir ainda mais, nunca impor movimento a quem o sistema protege.
- Estados não dependem só de cor. Texto normal com contraste mínimo 4,5:1; controles/foco com contraste suficiente contra adjacentes.
- Todas as ações disponíveis por teclado; ordem de foco acompanha leitura; Escape fecha camada superior; foco retorna ao invocador.
- Usar nomes acessíveis nos botões de ícone, erros associados ao campo e anúncios moderados para processos assíncronos.
- Mensagens de voz/streaming não podem anunciar cada caractere ao leitor de tela.
- Ações importantes não aparecem exclusivamente no hover.

### 4.5 Layout e macOS

Matriz desktop mínima: 960×620, 1024×768, 1280×820 e 1440×900. Matriz responsiva adicional no preview/web: 768×900 e 390×844. Se a versão nativa mantiver largura mínima maior, não afirmar que o teste estreito comprova a janela nativa nessa largura.

Em listas e formulários, a janela não deve ganhar rolagem horizontal. Na grade semanal pode existir rolagem horizontal interna explícita, com horários e controles usáveis. Disponibilizar modo Dia em largura reduzida sem mudar a seleção silenciosamente.

No macOS: reservar controles de fechar/minimizar/ampliar, manter regiões arrastáveis somente onde não há interação, `no-drag` em controles e testar tela cheia. O padrão `.shell` e transparência da overlay têm consumidores existentes; preservar até substituir o contrato com validação equivalente.

## 5. Organização do código e responsabilidades

Todos os caminhos abaixo são relativos à raiz do app. Novos caminhos são propostas deste plano; não são arquivos já presentes.

| Caminho | Responsabilidade |
| --- | --- |
| `src/ui/redesign/theme.css` | Tokens e estilos compartilhados, isolados da UI legada durante transição |
| `src/ui/redesign/motion.ts` | Transições reutilizadas, somente quando necessárias |
| `src/ui/redesign/components/` | Composições compartilhadas com consumidores reais |
| `src/ui/redesign/screens/` | Telas novas mantendo contratos das views atuais |
| `src/ui/redesign/settings/` | Seções, busca e navegação interna de Ajustes |
| `src/ui/shell/AdaptiveNotchNavigation.tsx` | Componente visual aprovado e comportamento acessível |
| `src/ui/shell/navigation-preferences.ts` | Ler, validar e gravar posição do menu |
| `src/ui/shell/NavigationPreferencesProvider.tsx` | Estado compartilhado entre shell e Ajustes |
| `src/ui/shell/routes.ts` | Destinos, agrupamento e resolução de rotas antigas |
| `src/ui/shell/AppShell.tsx` | Montagem do shell, sem regras de domínio |
| `src/ui/redesign/preview/ComponentGallery.tsx` | Galeria de desenvolvimento, excluída da navegação de produção |
| `src/ui/__tests__/` | Testes de apresentação estática e helpers puros |
| `tests/e2e/redesign-*.spec.ts` | Comportamento real de controles e fluxos |
| `docs/redesign/` | Matriz de paridade, decisões e evidências |

**Desde 19/09 (decisão do usuário):** o Claude implementa todas as unidades, inclusive as de apresentação, e mantém a seção 0 deste plano em dia; o Codex revisa cada PR e aponta o que precisa mudar. A divisão original fica abaixo como referência de território.

**Codex:** apresentação, CSS, componentes, tokens, navegação, testes de UI e documentação deste plano.

**Claude:** dependências/lockfile e configuração associada; `electron/`, `native/`, `src/data/`, scripts, IPC, `src/global.d.ts`, CI e status operacional. Se uma tela precisar de capacidade ausente, especificar entrada, saída, erros e disponibilidade em pedido separado; não inventar API nem contornar o adaptador.

**Arquivos compartilhados:** funcionalidades em arquivos novos; `App.tsx` e `SettingsView.tsx` recebem somente integração mínima necessária, sem reformatação ampla. Reorganização maior exige unidade coordenada. O prefixo `data.*` continua com Claude; propor `redesign.*` para novas mensagens de UI e reutilizar chaves existentes.

## 6. Preferências e preservação de estado

Tema usa `src/ui/theme-context.tsx` e `src/ui/theme.ts`. Posição do menu é uma preferência visual local independente de monitor/posição do mascote.

Contrato proposto para a preferência nova:

```ts
export type NavigationPosition = 'top' | 'bottom';
// Desde a U04b: a automática é o padrão (embaixo só com o mascote no mesmo monitor da janela).
export type NavigationPreference = NavigationPosition | 'auto';
export const NAVIGATION_POSITION_KEY = 'hibi.ui.navigation-position.v1';
export function parseNavigationPreference(value: unknown): NavigationPreference {
  return value === 'top' || value === 'bottom' ? value : 'auto';
}
```

Leitura/gravação deve tolerar storage indisponível; o app continua utilizável e comunica quando a preferência não pôde ser persistida. Troca aplica imediatamente, não remonta o workspace nem reinicia a sessão. Não estender formato de backup silenciosamente: se exportação de preferências visuais for desejada, Claude altera o contrato em PR próprio.

Preservar ao navegar: sessão de foco, conversa em geração, rascunho quando o fluxo atual o preserva, filtros e data da Agenda. Não colocar `key` baseada em tema, posição do menu ou rota no componente que possui dados/sessões persistentes.

CSS global e portais: validar o escopo de Tailwind/estilos HeroUI antes de habilitar reset global. Conteúdo de Drawer/Modal/Popover renderizado em portal precisa receber os mesmos tokens e tema. Overlay do mascote e barra rápida não podem ganhar canvas opaco pelo reset da aplicação principal.

## 7. Sequência de implementação e dependências

Cada unidade abaixo corresponde a um PR coeso. Dividir uma unidade caso misture mudança de contrato com apresentação. Cada item começa com leitura da principal atualizada e reserva na issue #48; este plano não é uma reserva.

| Ordem | Unidade | Depende de | Responsável |
| --- | --- | --- | --- |
| U00 | Baseline, inventário e referência preservada | Nenhuma | Codex |
| U01 | Dependências e integração de estilos | U00 | Claude, com prova de UI do Codex |
| U02 | Tokens, controles e galeria | U01 | Codex |
| U03 | Adaptive Notch no shell real | U02 | Codex |
| U04 | Preferências de aparência e posição | U03 | Codex |
| U05 | Diálogos, detalhes e estados comuns | U02 | Codex |
| U06 | Hoje | U03, U05 | Codex |
| U07 | Tarefas | U05, U06 | Codex |
| U08 | Lembretes | U07 | Codex |
| U09 | Agenda local Dia/Semana | U03, U05 | Codex |
| U10 | Calendários externos e conflitos | U09 | Codex; núcleo com Claude |
| U11 | Foco/Pausa e continuidade | U06 | Codex |
| U12 | Notas | U05 | Codex |
| U13 | Taby, histórico e voz | U03, U05 | Codex |
| U14 | Barra rápida e compatibilidade do mascote | U13 | Codex; host com Claude |
| U15 | Rotina/Hábitos | U06 | Codex |
| U16 | Metas e Progresso | U06 | Codex |
| U17 | Revisão | U07, U09 | Codex |
| U18 | Tendências/Estatísticas | U16 | Codex |
| U19 | Busca de comandos e rotas secundárias | U03; finalizar após U06–U18 | Codex |
| U20 | Estrutura final de Ajustes | Telas diárias estabilizadas | Codex |
| U21 | Geral, aparência, foco e notificações | U20, U04, U11 | Codex |
| U22 | Taby, voz, modelo e notch em Ajustes | U20, U13, U14 | Codex |
| U23 | Integrações em Ajustes | U20, U10 | Codex |
| U24 | Dados e recuperação | U20 | Codex |
| U25 | Ajuda, atualização, dispositivos e diagnósticos | U20 | Codex |
| U26 | Auditoria visual, acessibilidade e idiomas | U06–U25 | Codex |
| U27 | Regressão real, produção e desempenho | U26 | Codex + Claude por território |
| U28 | Remoção do legado e entrega | U27 | Codex; status com Claude |

São 29 unidades de trabalho, não estimativa de 29 dias. O número final de PRs pode aumentar para manter revisões pequenas. Não prometer prazo antes de U00/U02 revelarem baseline, compatibilidade e custo do piloto.

Paralelismo útil depois de U05: Tarefas/Lembretes, Agenda, Notas e Taby podem ser trabalhados separadamente, com arquivos exclusivos. Integrações no App, ajustes de tokens e merge ficam serializados. Não disparar agentes diferentes sobre o mesmo arquivo de tela, shell ou dicionário. Revisores podem auditar contratos sem editar.

## 8. Caderno de execução — fundação e navegação

### U00 — Baseline e inventário verificável

**Criar:** `docs/redesign/baseline.md`, `docs/redesign/parity-matrix.md`, `docs/redesign/reference-manifest.md`.

- [x] Registrar commit remoto, checkout, alterações locais e reservas vigentes. Preservar a branch histórica e os dois planos. (#165, `baseline.md`)
- [x] Comparar o inventário deste documento com rotas, modais, overlays e configurações da principal atual. (#165, `parity-matrix.md`)
- [ ] Para cada ação atual, registrar origem, destino novo, serviço/callback, estado disponível e teste que a cobre. **Parcial:** a matriz do #165 é por tela, sem o callback de cada ação; cada unidade de tela completa as linhas dela.
- [x] Verificar ZIP e assets; registrar hashes e capturas dos quatro modos do preview, sem alterar a referência. (#165, `reference-manifest.md`; as capturas do preview ficam no diretório editável, sem hash)
- [ ] Abrir o app atual com dados de teste; capturar telas e superfícies auxiliares e registrar falhas preexistentes. **Parcial:** o #165 capturou só a Home clara pelo Vite. A U01 e a U02 compararam 20 telas, o notch e a barra, nos dois temas, antes e depois (80 capturas por rodada), mas as imagens não foram arquivadas; a U03 arquiva as da UI atual antes de trocar a navegação.
- [x] Medir tempo de abertura, custo de troca de telas e CPU/memória em ociosidade com mascote visível. (#166, `performance-baseline.md`, pelo Claude)
- [x] Separar recursos implementados, indisponíveis e simulados pela apresentação atual; não chamar texto estático de capacidade funcional. (#165, lacunas da matriz)

**Aceite:** todas as rotas da seção 3 e janelas de `src/main.tsx` possuem linha na matriz. A versão de referência pode ser reaberta a partir do arquivo preservado.

### U01 — Dependências e isolamento de estilos

**Responsável:** Claude para `package.json`, lockfile e configuração. **Entrada:** versões usadas no preview: HeroUI React/Styles 3.2.6, Tailwind v4, Motion e Lucide. Essas versões são evidência local, não prescrição de atualização indiscriminada.

- [x] Validar versões compatíveis com React 19, Vite 8 e TypeScript da principal; fixar resolução no lockfile. (#167: versões exatas; 85 pacotes novos, nenhum existente alterado)
- [x] Definir ordem de estilos, descoberta das classes e escopo do reset. Identificar o caminho de build dos três renderers. (#167; o reset restrito à nova UI veio na U02)
- [x] Provar um Button, um campo e um Popover no desktop de desenvolvimento e na versão empacotada. (#167, no app instalado; a página de prova foi substituída pela galeria da U02)
- [x] Conferir licença da navegação anexada e das dependências. (dependências no #167; o componente é do usuário, seção 0)
- [x] Confirmar que nenhum estilo global remove transparência de `overlay=notch`/`overlay=bar`. (#167: comparação pixel a pixel e barra transparente no app instalado)

**Aceite:** instalação reproduzível, controles funcionais e assets locais resolvidos no pacote. Núcleo e configuração entregues em PR separado quando necessário.

### U02 — Tokens e galeria

**Criar:** `src/ui/redesign/theme.css`, `src/ui/redesign/preview/ComponentGallery.tsx`; composições mínimas em `components/`.
**Reutilizar:** `theme-context.tsx`, `theme.ts`, `tokens.css`, `motion.css`.

- [x] Mapear tokens do preview para claro/escuro e tint atual, mantendo uma fonte de preferência. (`theme.css`: tokens `--hibi-*` ligados às variáveis do HeroUI; o tom continua sendo o `data-tint` do `ThemeProvider`)
- [x] Montar catálogo com botão, campo, seleção, toggle, card, menu, diálogo e estados desabilitado/processando/erro/foco. (`ComponentGallery.tsx`; capturas em `docs/redesign/u02-assets/`)
- [x] Incluir textos longos, pt/en, zoom 200% e múltiplos itens sem dados pessoais. (o zoom de 200% é testado como janela de 640 px sem rolagem lateral)
- [x] Verificar portais, contraste e ausência de flash de tema na abertura. (e2e: popovers e menus dentro de `.hibi-ui`; 4,5:1 nos dois temas e cinco tons; o tema piscava um quadro na abertura e passou para `useLayoutEffect`)
- [x] Restringir galeria ao desenvolvimento; não criar um novo destino visível no app final. (`import.meta.env.DEV`: o build de produção não contém a galeria)

**Aceite:** mesma aparência e interação em todas as composições; o acabamento replica o preview aprovado. A galeria serve como instrumento de implementação, não como nova decisão estética pendente.

### U03 — Navegação oficial no app

**Criar:** `src/ui/shell/AdaptiveNotchNavigation.tsx` e estilos associados.
**Modificar:** `AppShell.tsx`, `routes.ts`, `shell.css`; montagem no App apenas se exigida.
**Verificar:** `tests/e2e/redesign-navigation.spec.ts` e teste de resolução de rotas.

- [x] Portar componente e SVG aprovados, preservando proporção entre borda, asas e raios.
- [x] Conectar ids do componente aos `NavKey` existentes; não copiar hashes/dados demonstrativos do preview para a lógica de produção.
- [x] Manter comandos e Ajustes acessíveis; providenciar acessos contextuais antes de retirar entradas antigas.
- [x] Tratar geometria superior e inferior desde o componente, com superior como padrão inicial.
- [x] Implementar modo compacto, teclado, item ativo e retorno de foco.
- [x] Conferir regiões de arraste, controles do macOS, tela cheia, rolagem e ausência de sobreposição com conteúdo.
- [x] Comparar capturas ampliadas das quinas nos quatro modos. Observar emendas de 1 px em escala Retina e durante resize.

**Aceite:** todos os destinos abrem a tela real; nenhuma rota fica órfã; moldura e quinas correspondem à referência. Digitar/enviar no Taby mantém o mascote funcionando.

### U04 — Preferências de aparência

**Criar:** arquivos de preferência da seção 5 e `src/ui/redesign/settings/AppearanceSettings.tsx`.
**Modificar:** shell e montagem mínima em `SettingsView.tsx`.

- [x] Ler posição com fallback seguro; aplicar sem remontar conteúdo.
- [x] Expor Claro/Escuro/Sistema usando provider existente, tint e posição Superior/Inferior com pequenas prévias.
- [x] Persistir posição ao reabrir; tratar valor antigo/inválido e storage recusado.
- [x] Responder à mudança do tema do sistema somente quando preferência for Sistema.
- [x] Testar alternância durante conversa com rascunho e durante sessão ativa.

**Aceite:** quatro combinações manuais funcionam; Sistema acompanha macOS; nenhuma preferência de monitor do mascote é alterada.

### U05 — Formulários, painéis e feedback

**Criar conforme consumo:** `EntityDetailsPanel.tsx`, `ConfirmActionDialog.tsx`, `AsyncNotice.tsx`, `SectionHeader.tsx` em `src/ui/redesign/components/`.

- [ ] Definir detalhe em Drawer no desktop e apresentação adaptada em janela estreita; modal para ação curta e confirmação.
- [ ] Padronizar salvar/cancelar, erro por campo, envio em andamento e prevenção de clique duplicado.
- [ ] Definir erro recuperável com tentar novamente sem perder edição; se serviço atual não reportar erro, registrar limitação do contrato e pedir correção ao dono.
- [ ] Padronizar vazio inicial, busca sem resultado, indisponibilidade de bridge e falta de permissão.
- [ ] Usar Toast para feedback não bloqueante; erro que exige decisão fica visível junto à ação.
- [ ] Testar foco, Escape, clique fora e descarte de rascunho conforme tipo de formulário; confirmação destrutiva nunca fecha como sucesso implícito.

**Aceite:** componentes consumidos pelo piloto; nenhuma arquitetura genérica de formulários sem necessidade real.

## 9. Caderno de execução — telas diárias

### U06 — Hoje

**Fonte:** `HomeView.tsx`, `day-rhythm.ts`, `useCalendarDay.ts`, `home-atelier.css`.
**Destino:** `src/ui/redesign/screens/TodayScreen.tsx` e composições de widgets.
**HeroUI:** Card, Surface, Button, Chip, Checkbox, Tabs, Tooltip.

- [ ] Compor compromisso seguinte, tarefas prioritárias, iniciar/retomar foco e resumo de rotina/progresso com a hierarquia do preview.
- [ ] Usar dados e ações existentes; ausência de compromisso mostra espaço livre, não reunião fictícia.
- [ ] Ligar criar tarefa/bloco/nota aos formulários reais.
- [ ] Dar acesso a Rotina, Progresso, Tendências e Revisão sem aumentar menu principal.
- [ ] Cobrir dia vazio, atrasos, muitas tarefas, títulos longos, meia-noite e retomada após janela escondida.
- [ ] Garantir que cards clicáveis não tenham ações internas com cliques conflitantes.

**Aceite:** widgets mostram dados coerentes e cada ação produz o efeito previsto; tela funciona em largura mínima sem cards comprimidos ou cortados.

### U07 — Tarefas e seus diálogos

**Fontes:** `TasksView.tsx`, `TaskCreateModal.tsx`, `DeadlineEditModal.tsx`, `TasksAtelierSummary.tsx`, `task-rhythm.ts`.
**Destino:** `TasksScreen.tsx` e `TaskDetailsPanel.tsx` em `redesign/`.
**HeroUI:** SearchField, Checkbox, ListBox, Dropdown, Chip, Drawer, TextField, Select, DatePicker, NumberField.

- [ ] Reconstruir lista, pastas/filtros e resumo com seleção e ações claras.
- [ ] Preservar criação rápida na pasta filtrada e valores padrão atuais.
- [ ] Unificar criar/editar quando compartilhar campos; manter prazo, duração, status e pasta conforme modelo real.
- [ ] Manter concluir, reabrir e excluir; oferecer confirmação/recuperação conforme comportamento existente.
- [ ] Ligar agendar/iniciar foco somente às ações existentes; não introduzir recorrência ou subtarefas decorativas.
- [ ] Cobrir títulos longos, filtro vazio, pasta removida e mudança de tarefa enquanto painel está aberto.

**Aceite:** criar → editar → concluir → reabrir → reiniciar mantém dados corretos; filtros não mudam pasta de uma tarefa inadvertidamente.

### U08 — Lembretes

**Fontes:** `RemindersView.tsx`, `ReminderCreateModal.tsx`, `reminder-rhythm.ts`, `RemindersAtelierSummary.tsx`.
**Destino:** `RemindersScreen.tsx`, como subseção de Tarefas.
**HeroUI:** Select, DateField, TimeField, Switch, Chip, AlertDialog.

- [ ] Exibir próxima ocorrência, recorrência e estado pausado de forma distinta.
- [ ] Preservar criação/edição, pausar/retomar e remoção.
- [ ] Mostrar resumo legível da agenda de recorrência antes de salvar.
- [ ] Reutilizar validação que impede lembrete único no passado; manter dados ao mostrar erro.
- [ ] Fazer Review spacing abrir o lembrete correto; teste de notificação respeita permissões reais.

**Aceite:** horário local e recorrência preservados; lembrete não vira tarefa; estado indisponível não aparece como agendado com sucesso.

### U09 — Agenda local

**Fontes:** `AgendaView.tsx`, `DayView.tsx`, `WeekView.tsx`, `calendar-grid.ts`, `agenda-storage.ts`, `AgendaAvailability.tsx`, `ConflictSummary.tsx`.
**Destino:** `AgendaScreen.tsx`, componentes próprios de grade e detalhe.
**HeroUI:** Tabs, ButtonGroup, DatePicker, TimeField, Popover, Drawer, Chip.

- [ ] Cabeçalho com período, Hoje, anterior/próximo, Dia/Semana e criar bloco.
- [ ] Grade aproveita largura disponível; coluna de horários estável e rolagem interna previsível.
- [ ] Preservar visibilidade de blocos antes das 08h/depois das 22h; não fixar recorte antigo.
- [ ] Diferenciar eventos de dia inteiro, blocos locais e externos sem depender apenas de cor.
- [ ] Implementar detalhe e edição pelos callbacks existentes, com duração e horários locais corretos.
- [ ] Preservar formato 12h/24h, disponibilidade e detecção real de sobreposição.
- [ ] Cobrir eventos simultâneos, muitos eventos, semana vazia, meia-noite e títulos extensos.
- [ ] Arraste/redimensionamento só entra se já existir como função estável; a migração não cria esse contrato por aparência.

**Aceite:** nenhum evento desaparece por recorte; modo Dia resolve janela estreita; navegação entre semanas não altera vínculos externos.

### U10 — Eventos externos e conflitos

**Fontes:** `ExternalCalendarAgenda.tsx`, `CalendarSyncPanel.tsx`, `MacCalendarConnection.tsx`, `calendar-sync.ts`, `external-calendar-events.ts`.
**HeroUI:** Chip, Alert, Drawer, CheckboxGroup, Button, AlertDialog.

- [ ] Mostrar origem, calendário e estados de sincronização usando dados reais.
- [ ] Manter fontes selecionadas e modo bidirecional como requisitos de publicação.
- [ ] Apresentar conflitos de edição e apagado com contexto e ações existentes; manter decisão pendente até confirmação do serviço.
- [ ] Reutilizar correções de evento movido, idempotência/409 e renovação de autorização.
- [ ] Colocar configuração de conexão em Ajustes; manter resolução operacional acessível na Agenda.
- [ ] Exercitar importação ICS com UTC/TZID e dia inteiro preservando domínio atual.

**Aceite:** publicar, ler, editar, mover, apagar/recriar e repetir publicação mantêm semântica atual. Testes reais só em calendário dedicado, com eventos de teste; falha de núcleo vai para Claude.

### U11 — Foco e Pausa

**Fontes:** `FocusView.tsx`, `FocusBackgroundNotice.tsx`, `focus-lifecycle.ts`, `focus-settings.ts`, `FocusAtelierSummary.tsx`.
**HeroUI:** Button, ToggleButtonGroup, ProgressCircle, Tooltip.

- [ ] Tela com timer dominante, tarefa/contexto e poucas ações: iniciar, pausar, retomar, encerrar conforme estado.
- [ ] Pausa tem identidade coerente, sem virar nova área de configuração.
- [ ] Indicador persistente permite voltar à sessão de qualquer destino.
- [ ] Reutilizar proprietário da sessão atual; desmontar a tela não cancela foco.
- [ ] Preservar ausência, sleep/wake e eventos enviados ao mascote.
- [ ] Não usar número de frames como relógio; a UI acompanha o estado temporal existente.

**Aceite:** navegar, mudar tema/menu, esconder janela e voltar não reinicia duração; encerramento produz um único registro.

### U12 — Notas

**Fontes:** `NotesView.tsx`, `NotesAtelierSummary.tsx`, `note-rhythm.ts`.
**Destino:** `NotesScreen.tsx`.
**HeroUI:** SearchField, ListBox, Card, TextArea, Dropdown, Drawer.

- [ ] Lista/prévias e editor com hierarquia legível; adaptar para uma coluna em janela estreita.
- [ ] Manter criar, selecionar, editar, excluir e pesquisar conforme contrato atual.
- [ ] Mostrar estado de edição/gravação quando disponível; não anunciar salvo antes de confirmação quando houver gravação assíncrona.
- [ ] Cobrir nota vazia, texto longo, mudança de seleção durante edição e pesquisa sem resultados.
- [ ] Não converter conteúdo textual em rich text; preservar exatamente o formato existente.

**Aceite:** criar e editar persistem após reinício; navegação não perde conteúdo inadvertidamente; galeria não exibe thumbnails fictícias.

### U13 — Taby e voz na janela principal

**Fontes:** `TabyView.tsx`, `ConversationList.tsx`, `useAssistantTurn.ts`, `useConversations.ts`, `useVoiceTurn.ts`, `voice-notice.ts`, `assistant-presentation.ts`.
**Destino:** `TabyScreen.tsx` e composições de conversa.
**HeroUI:** TextArea, Button, ScrollShadow, Dropdown, Disclosure, Alert, Chip.

- [ ] Histórico recolhível, conversa legível e compositor fixo sem cobrir a última mensagem.
- [ ] Nova conversa, selecionar, excluir uma e excluir todas com confirmações apropriadas.
- [ ] Preservar streaming, cancelamento, tentativa novamente e propostas/confirmar/cancelar com ids reais.
- [ ] Rolagem acompanha novas mensagens quando usuário está no fim; leitura de histórico não deve ser puxada para baixo.
- [ ] Voz distingue pedindo permissão, ouvindo, parando, texto reconhecido, erro e indisponível.
- [ ] Parar ditado não se torna erro; usar normalização e hooks da principal.
- [ ] Motor/modelo e fallback aparecem com linguagem clara; configuração detalhada fica em Ajustes.
- [ ] Tratar mudança de conversa durante geração sem inserir resposta na conversa errada.

**Aceite:** texto/voz funcionam com serviço real disponível; cancelamento realmente interrompe conforme contrato; conversas continuam fora do backup do workspace.

### U14 — Barra rápida e mascote

**Fontes:** `TabyBar.tsx`, `taby-bar-content.ts`, `taby-bar.css`, `NotchOverlay.tsx`, `notch-overlay.css`, `CompanionAnimation.tsx`.

- [ ] Aplicar tokens e acabamento coerentes à barra rápida mantendo o formato da superfície auxiliar.
- [ ] Cobrir entrada, escuta, pensando, resposta, aviso e confirmação.
- [ ] Preservar último pedido enquanto processa, Escape como cancelamento quando há confirmação e dispatch para o request correto.
- [ ] Verificar que estilos/portais não tornam fundo da janela transparente em um retângulo opaco.
- [ ] Manter o gatinho e comportamento oficial do host atual; não trocar pelo rostinho genérico como efeito colateral.
- [ ] Exercitar abrir app, digitar, enviar, falar, cancelar, confirmar, trocar telas, sleep/wake e monitor externo.
- [ ] Reações adicionais de vídeo só são conectadas quando assets e mapa de estados existirem; ausência de asset deve preservar fallback válido.

**Aceite:** navbar da janela e notch nativo coexistem; nenhuma confirmação some por mudança visual; alterações de host seguem PR do Claude.

## 10. Caderno de execução — áreas secundárias

### U15 — Rotina/Hábitos

**Fontes:** `HabitsView.tsx`, `HabitsAtelierSummary.tsx`, `useCalendarDay.ts`.
**HeroUI:** Checkbox, Card, Popover, ProgressBar.

- [ ] Acesso em Hoje → Rotina; faixa semanal e agrupamento legível.
- [ ] Preservar criar/editar/marcar/desmarcar e histórico disponível.
- [ ] Dia atual muda após meia-noite e retomada; marcar não grava em UTC de outro dia.
- [ ] Distinguir dia sem registro de hábito não realizado conforme modelo existente.

**Aceite:** histórico e marcações permanecem iguais após migração; fuso extremo não desloca datas.

### U16 — Metas/Progresso

**Fontes:** `GoalsView.tsx`, `GoalsAtelierSummary.tsx`, `progress-rhythm.ts`.
**HeroUI:** Card, Meter, NumberField, Drawer, Chip.

- [ ] Acesso por Hoje → Progresso; metas com unidade, valor atual e alvo.
- [ ] Preservar criar, editar, incrementar e remover conforme ações existentes.
- [ ] Alterar alvo recalcula estado visual; meta volta de concluída quando a nova meta exige progresso adicional.
- [ ] Cobrir zero, alvo inválido, unidade longa e limites do domínio.

**Aceite:** não persistir um status de conclusão contraditório com a regra atual; métricas do resumo usam os mesmos dados.

### U17 — Revisão

**Fontes:** `ReviewView.tsx`, `review-dismissals.ts`, `src/domain/review*`.
**HeroUI:** Card, Accordion, Chip, Button, Popover.

- [ ] Organizar sugestões por prioridade e explicar motivo/efeito da ação.
- [ ] Manter agendamento real da tarefa sem agenda e abertura do lembrete correto.
- [ ] Dispensar salva o estado; recarregar não faz reaparecer a mesma sugestão dispensada contra a política atual.
- [ ] Não aplicar sugestões automaticamente por montar a tela ou expandir um cartão.
- [ ] Cobrir revisão sem pendências, ação indisponível e sugestão que perdeu validade após outro evento.

**Aceite:** sugestão resolvida altera o dado certo; dispensas persistem; ações não se duplicam por clique repetido.

### U18 — Tendências/Estatísticas

**Fontes:** `StatsView.tsx`, `stats-format.ts`, `stats.css`.
**HeroUI:** Tabs, DateRangePicker, Tooltip, Card, Meter.

- [ ] Aplicar composição e hierarquia inspiradas na referência 15 aos cálculos já existentes.
- [ ] Preservar seleção de período e exportação quando disponível.
- [ ] Distinguir zero, falta de dados e carregamento; não inventar variação percentual sem base comparável.
- [ ] Gráficos com legenda, nomes e resumo textual acessível; tooltip não é única fonte da informação.
- [ ] Manter datas locais e escala consistente entre períodos comparados.

**Aceite:** números coincidem com a implementação anterior para a mesma fixture; versão estreita continua legível.

### U19 — Busca de comandos e conclusão da navegação

**Fontes:** `palette/CommandPalette.tsx`, `PaletteFolders.tsx`, `PaletteTurn.tsx`, `commands.ts`, `mode.ts`, `folder-view.ts`.
**HeroUI:** Modal, SearchField, ListBox, Kbd, ScrollShadow.

- [ ] Preservar comandos, busca e fluxos assistidos existentes.
- [ ] Indexar todos os destinos secundários, ações e grupos de Ajustes sem duplicar nomenclaturas.
- [ ] Teclado: abrir, pesquisar, setas, executar, Escape e retorno de foco.
- [ ] Garantir que editar texto não dispara atalho de navegação acidental.
- [ ] Remover menu Mais somente após verificar todos os destinos pela matriz de rotas.

**Aceite:** todas as rotas antigas têm resolução e alternativa visível/contextual; a UI final tem cinco destinos principais e Ajustes.

## 11. Caderno de execução — Ajustes completos

### U20 — Estrutura e busca

**Criar:** `src/ui/redesign/settings/SettingsScreen.tsx`, `SettingsNavigation.tsx`, `settings-sections.ts`.
**Modificar:** apenas montagem coordenada em `SettingsView.tsx`/App.

- [ ] Criar grupos da seção 3 com navegação interna, busca, títulos e descrições consistentes.
- [ ] Registrar entradas de busca por chave de tradução e destino; selecionar resultado abre e foca o controle.
- [ ] Definir salvamento imediato para toggles existentes e explícito para formulários com vários campos/segredos.
- [ ] Manter destino estável ao sair/voltar; esconder opções apenas quando recurso não existe e oferecer explicação quando indisponível.
- [ ] Extrair seção por vez em arquivos próprios preservando callbacks; não reformatar `SettingsView` inteiro.

**Aceite:** encontrar preferência por seu nome e sinônimos comuns; nenhuma seção contém botões demonstrativos.

### U21 — Geral, aparência, foco e notificações

**Reutilizar:** `AppearanceSettings`, `ShortcutSettings`, `TintSettings`, `FocusSettingsPanel` e funções de preferências existentes.
**HeroUI:** Select, RadioGroup, Switch, NumberField, Button, Alert.

- [ ] Integrar preferências de U04 sem duplicar storage.
- [ ] Preservar idioma, 12h/24h, iniciar ao entrar e atalho global com leitura de retorno do sistema.
- [ ] Distinguir atalho recusado/conflitante de sucesso; manter valor real aplicado.
- [ ] Agrupar duração/ausência/pausa/notificações de foco com descrições práticas.
- [ ] Estado de notificação vem da capacidade real; teste negado não aparece como entregue.
- [ ] Todas as preferências persistentes são verificadas após reabrir o app.

**Aceite:** controles refletem valor aplicado, não apenas intenção de clique; textos e unidades consistentes.

### U22 — Taby, voz, modelo local e notch

**Fontes:** `AiSettings` em SettingsView, `LocalModelSettings.tsx`, `NotchDisplaySettings.tsx`, `local-model-format.ts`, `notch-display.ts`.
**HeroUI:** Card, Select, Input, ProgressBar, Disclosure, AlertDialog.

- [ ] Provedor, endpoint e credencial com estado salvo/ausente; segredo guardado nunca volta ao input.
- [ ] Modelo local: ausente, baixando, verificando, pronto, carregando, falha, cancelamento e remoção segundo serviço real.
- [ ] Política de fallback e informações de uso preservadas; diagnóstico detalhado recolhido.
- [ ] Permissões de voz solicitadas em contexto e negadas com instrução acionável.
- [ ] Monitor/tamanho/teste do notch reutilizam APIs atuais. Posição Superior/Inferior do menu permanece em Aparência.
- [ ] Não adicionar escolha de posição livre do mascote: documento de status registra decisão de não fazer esse recurso.

**Aceite:** download/cancelamento/remoção e estados do motor correspondem ao núcleo; UI não expõe credenciais nem confunde duas configurações de notch.

### U23 — Integrações

**Fontes:** `IntegrationsView.tsx`, `MacCalendarConnection.tsx`, `NotionSyncPanel.tsx`, `CalendarSyncPanel.tsx`.
**HeroUI:** Card, Drawer, Input, CheckboxGroup, Select, Alert, Disclosure.

- [ ] Lista com conectado, desconectado, expirado, processando e indisponível baseados em respostas reais.
- [ ] Google: client ID, credencial oculta, salvar/apagar, conectar/reconectar, carregar fontes e modo de sincronização.
- [ ] Calendários do Mac: permissão EventKit, contas/fontes incluindo iCloud configurado no Mac; não apresentar CalDAV próprio inexistente.
- [ ] Notion: prévia, seleção e aplicação com recusa de prévia obsoleta e recuperação orientada.
- [ ] Demais conectores: mostrar capacidade real e configuração existente; não transformar teste de sandbox em alegação de compatibilidade com serviço comercial.
- [ ] Revogar/desconectar requer intenção explícita do usuário e feedback do serviço.
- [ ] Inputs de segredo começam vazios e nunca mostram valor persistido, inclusive em erro e reabertura.

**Aceite:** fontes/configurações persistem; reconexão limpa estado expirado apenas após sucesso; nenhum segredo em logs, snapshots ou evidências.

### U24 — Dados e recuperação

**Fontes:** seção Data de `SettingsView.tsx`, `restore-point-format.ts`; consumir `src/data/workspace-store.ts` sem editar o adaptador.
**Destino:** `DataSettings.tsx`, `RestorePointsPanel.tsx`.
**HeroUI:** Table ou ListBox, Button, AlertDialog, Spinner, Alert, EmptyState.

- [ ] Migrar exportar/importar backup, pontos de restauração e reset mantendo política atual.
- [ ] Mostrar rótulo traduzido conhecido e texto original para rótulo desconhecido; data e tamanho formatados.
- [ ] Estados: carregando, vazio real, desktop necessário, falha de leitura e restaurando.
- [ ] Confirmação explica substituição do workspace e identifica o ponto selecionado.
- [ ] Aguardar `store.restore(id)` antes de recarregar; bloquear novas edições durante operação. Se houver intervalo de gravação automática concorrente, solicitar ao Claude solução de contrato antes de declarar fluxo seguro.
- [ ] Recarregar após sucesso para impedir que estado antigo em memória sobrescreva o restaurado.
- [ ] Importação inválida mantém workspace atual; exportações respeitam ausência de conversas/credenciais conforme contrato.

**Aceite:** restaurar fixture recupera dados após reload e nova edição; falha não provoca reload nem sucesso falso. Este item redesenha funcionalidade já existente.

### U25 — Suporte, atualizações, dispositivos e avançado

**Fontes:** `HelpView.tsx`, `FeedbackView.tsx`, `InstrumentationView.tsx`, `AvailabilityView.tsx`, `UpdatePanel.tsx`, `CompanionAssetGallery.tsx`.
**HeroUI:** Accordion, TextArea, Table, Chip, ProgressBar, Disclosure, Alert.

- [ ] Ajuda com atalhos e orientações coerentes com a nova navegação; feedback com destino e efeito reais.
- [ ] Atualizações: usar serviço atual para verificar, baixar, progresso, pronto para reiniciar, erro e indisponível.
- [ ] Remover cartões estáticos que afirmam ausência de feed/versão atual quando contradizem `UpdatePanel`.
- [ ] Dispositivos apresentam conectado/indisponível/capacidades sem simular pareamento.
- [ ] Diagnósticos e exportação de suporte agrupados em Avançado; não expor identificadores sensíveis por padrão.
- [ ] Galeria técnica de assets fica em área de desenvolvimento/diagnóstico apropriada, não no uso diário.

**Aceite:** estados coerentes com serviço, atalhos atualizados e nenhuma tela antiga órfã fora de Ajustes.

## 12. Qualidade transversal e entrega

### U26 — Auditoria de todas as superfícies

**Entrega:** `docs/redesign/visual-audit.md` e correções pequenas por área.

- [ ] Cruzar rotas, diálogos, menus, notificações, entradas de renderer e grupos de Ajustes com a matriz de paridade.
- [ ] Capturar claro/escuro e menu superior/inferior em dados comparáveis.
- [ ] Testar pt/en, texto longo, zoom 200%, foco visível, teclado, leitor de tela no Mac e redução de movimento.
- [ ] Revisar estados vazio, carregando, erro, indisponível, sem permissão, em andamento e sucesso em cada fluxo assíncrono.
- [ ] Verificar campos e diálogos além da primeira dobra; popovers perto das bordas não podem ser cortados.
- [ ] Remover textos fixos contraditórios, porcentagens fictícias, imagens quebradas e ações sem callback.
- [ ] Confirmar que não existem prompts de navegador `alert/confirm` remanescentes nos fluxos migrados, salvo limitação documentada que bloqueia aceite visual da respectiva área.

**Aceite:** zero superfície esquecida na matriz; falhas com proprietário e unidade de correção. Um checklist preenchido sem evidência não encerra a migração.

### U27 — App real, integração e desempenho

**Entrega:** `docs/redesign/validation.md`, com commit, ambiente, caso, resultado e evidência.

- [ ] Executar bateria do repositório no commit candidato e registrar códigos de saída reais.
- [ ] Abrir desenvolvimento com `npm run desktop` e produção com build prévio; não concluir a partir de janela vazia de pacote desatualizado.
- [ ] Verificar persistência após reinício de tarefas, notas, lembretes, preferências e conversas segundo seus contratos.
- [ ] Exercitar Google em agenda de teste: conexão, publicação/leitura, outra semana, edição externa, mover, apagar/recriar, repetição idempotente e id inexistente.
- [ ] Exercitar EventKit e Notion apenas em fontes de teste autorizadas; separar indisponibilidade externa de defeito de UI.
- [ ] Validar voz, cancelamento, modelo local, foco e gatinho nas superfícies principal e rápida.
- [ ] Conferir monitores, Spaces, tela cheia, sleep/wake e inicialização; testes nativos ficam registrados separadamente dos e2e web.
- [ ] Comparar medidas com U00: abertura, troca de tela, ociosidade e CPU/memória com vídeo. Investigar regressão repetível maior que 20% nas mesmas condições antes de aprovar; esse percentual é critério de investigação, não promessa de medição exata.
- [ ] Verificar ausência de loops de renderização, listeners duplicados e animação pesada contínua em tela oculta.

**Aceite:** fluxos reais passam; falha externa não é reportada como sucesso. Capturas e relatórios não incluem tokens, credenciais, conteúdo pessoal ou descrições de erro sensíveis.

### U28 — Remoção do legado e oficialização

**Modificar:** somente componentes/CSS/imports comprovadamente sem consumidores; documentação de migração.

- [ ] Buscar referências antes de remover cada componente antigo; verificar também rotas secundárias e renderers auxiliares.
- [ ] Retirar gradualmente o isolamento `legacy-surface` apenas quando a área estiver migrada e testada em escuro.
- [ ] Eliminar estilos duplicados e alternativas de navegação de produção; preview e ZIP continuam referência externa.
- [ ] Retirar fixtures demonstrativas da compilação de produção e garantir galeria inacessível no menu final.
- [ ] Reexecutar verificações afetadas pela limpeza e bateria exigida antes do PR.
- [ ] Rebasear na principal, aguardar CI verde/mergeabilidade limpa e integrar um PR por vez conforme protocolo.
- [ ] Registrar última versão funcional e procedimento de reversão por PR, sem restaurar banco antigo sobre dados recentes.
- [ ] Claude atualiza `docs/IMPLEMENTATION_STATUS_AND_PLAN.md` com resultados e limites reais.

**Aceite final:** a nova UI é o caminho normal de uso; todas as funções atuais possuem apresentação migrada e evidência; nenhuma falha crítica/alta de navegação, perda de dados, calendário, foco ou Taby permanece aberta.

## 13. Matriz de verificação obrigatória

| Área | Cenário mínimo | Resultado exigido |
| --- | --- | --- |
| Inicialização | Desenvolvimento e produção | Janela, assets e gatinho visíveis; sem canvas vazio |
| Navegação | Cinco destinos + secundários + Ajustes | Nenhuma rota órfã e foco correto |
| Preferências | Claro/escuro/sistema × topo/base | Persiste e não reinicia sessão/rascunho |
| Tarefas | Criar em pasta filtrada, editar, concluir e reabrir | Dados e pasta preservados |
| Lembretes | Único futuro/passado, recorrente, pausar | Validação local correta e estado real |
| Agenda | Dia/semana, horários extremos e fusos | Nenhum deslocamento ou evento oculto |
| Calendário externo | Publicar, editar, mover, apagar/recriar | Vínculo preservado e sem duplicação |
| Notas | Editar texto longo e reiniciar | Conteúdo idêntico ao salvo |
| Foco | Navegar, esconder, retomar, encerrar | Sessão contínua e registro único |
| Taby | Streaming, cancelar, trocar conversa | Resposta e ação associadas ao pedido certo |
| Voz | Permissão aceita/negada, parar, erro | Sem falso sucesso nem erro ao parar normalmente |
| Modelo | Ausente, download, cancelar, pronto, falha | UI acompanha serviço real |
| Barra rápida | Entrada, voz, resposta e confirmação | Não perde contexto nem confirmação |
| Hábitos/metas | Virar dia e aumentar alvo | Data/status recalculados corretamente |
| Revisão | Agendar e dispensar | Efeito real e persistência |
| Estatísticas | Sem dados, zero, período | Cálculos preservados e legenda acessível |
| Recuperação | Importar inválido, restaurar ponto | Sem perda por falha; reload após sucesso |
| Atualizador | Sem feed, disponível, download, instalar | Estado real, sem texto contraditório |
| Layout | 960×620 a 1440×900, web estreita | Sem conteúdo coberto ou formulário inacessível |
| Acessibilidade | Teclado, VoiceOver, zoom, contraste | Fluxos completos sem depender de mouse/cor |

Fixtures mínimas: workspace vazio; workspace cotidiano; grande volume; títulos e textos longos; calendário com sobreposições/dia inteiro/horários extremos; integrações desconectadas/expiradas; sessão ativa; geração ativa; backup inválido e pontos de restauração antigos. Definir volume do cenário grande a partir dos limites reais da aplicação, sem criar limites arbitrários no domínio.

Testes unitários do repositório rodam sem DOM: helpers puros e `renderToStaticMarkup`. Interações HeroUI vão para Playwright com bridge simulada e múltiplos listeners por evento. Não adicionar jsdom apenas para esta migração. Testes novos devem detectar um defeito comportamental real e demonstrar que falham quando essa condição é quebrada, conforme contrato do repositório; não testar conteúdo literal do código ou getters de CSS.

Bateria exigida antes de PR de implementação, verificando o código de saída de cada comando:

```sh
npm test
TZ=Pacific/Kiritimati npm test
npm run parity:check
npm run safety:renderer
npx tsc --noEmit
npm run build
HIBI_E2E_PORT=4380 npx playwright test
```

Executar também a suíte relevante em `America/Sao_Paulo` quando o ambiente local não estiver nesse fuso. Em checkout novo preparar dependências nativas conforme `AGENTS.md`. Não instalar/iniciar processos sobre a árvore de trabalho do Claude. Antes de cada unidade, verificar se scripts e protocolo mudaram na principal.

## 14. Protocolo de execução, revisão e riscos

### 14.1 Ciclo de cada unidade

1. Atualizar leitura de `origin/main`, conferir diff local e reserva da issue #48.
2. Resolver divergência do checkout preservando referências e trabalho existente; nunca forçar reset/pull para fazer o plano caber.
3. Reservar a unidade; criar branch `codex/<unidade>` a partir da principal atual conforme contrato.
4. Registrar arquivos permitidos, callbacks preservados e critérios de aceite daquela unidade.
5. Implementar em alterações pequenas, com testes relevantes e comparação visual.
6. Validar dependências e arquivos compartilhados, rebasear e abrir PR coeso com números reais de testes.
7. Revisar funcionalidade, aparência e integração; corrigir antes de seguir para remoção do legado.
8. Integrar com CI verde e atualizar a matriz de paridade. Falhas de núcleo ficam com Claude e bloqueiam somente o fluxo que dependem delas.

Este plano não publica reservas, não envia mensagens e não abre PRs. Essas ações fazem parte da execução posterior autorizada, respeitando a coordenação vigente.

### 14.2 Riscos concretos e mitigação

| Risco | Prevenção | Prova |
| --- | --- | --- |
| Importar branch histórica remove correções | Partir da principal atual; portar somente apresentação necessária | Diff e regressões #138–#144 |
| Reset CSS afeta overlay | Isolar estilos, considerar três entradas de renderer | Transparência e gatinho no app real |
| Tema escuro só muda moldura | Migrar cada view e remover `legacy-surface` ao aceitar | Capturas por rota em ambos os temas |
| Menu inferior cobre conteúdo | Insets e container de rolagem explícitos | Último item/compositor acessível |
| Nova tela reinicia foco/geração | Estado no proprietário existente; evitar remontagem por aparência | Troca de rota/tema durante operação |
| Datas HeroUI convertem fuso | Adaptar ao modelo local e usar helpers atuais | São Paulo/Kiritimati + ICS |
| Restauração é sobrescrita | Bloquear edição e recarregar após sucesso; coordenar gravação automática | Restaurar, reiniciar e editar fixture |
| Estado de integração é decorativo | Renderizar resposta do serviço, não label fixo | Expiração e reconexão reais |
| Dois agentes editam mesmo arquivo | Reservas por unidade e montagem serializada | PR pequeno sem formatação incidental |
| Licença do componente não identificada | Conferir origem/licença antes de redistribuir | Registro em reference-manifest |
| Preview vira produto sem funcionalidades | Matriz de callbacks e cenários completos | Cada botão tem efeito verificado |

### 14.3 Registro por unidade

Cada unidade registra: commit base e final, arquivos alterados, recursos preservados, cenários exercitados, ambiente/viewport/tema/posição, resultados reais, limitações, dependências e PR. Evidências usam dados de teste. Não guardar o workspace pessoal como fixture nem empacotar logs de autenticação.

## 15. Evoluções futuras previstas no desenho

Estas áreas recebem espaço coerente na arquitetura, mas não precisam existir para declarar a migração visual concluída:

| Evolução | Local previsto | Condição de entrada |
| --- | --- | --- |
| Primeiro uso guiado | Fluxo inicial reabrível em Ajuda | Definir passos e permissões solicitadas no momento de uso |
| Projetos/subtarefas | Tarefas | Contrato de dados, migração e regras aprovados |
| Recorrência de tarefas | Detalhes de tarefa | Modelo distinto de lembretes recorrentes |
| Editor rico/anexos | Notas | Formato, busca, backup e armazenamento definidos |
| Widgets reordenáveis | Hoje | Persistência de layout e alternativa acessível ao arraste |
| Arrastar/redimensionar eventos | Agenda | Regras locais/remotas, colisão e recuperação |
| Novas reações do gatinho | Mascote + Ajustes | Assets, estados e desempenho validados |
| Conta e nuvem | Ajustes → Conta | Decisão e backend próprios; nenhuma tela de login fictícia |
| Automações propositivas | Ajustes + revisão no Taby | Contrato de autorização e confirmação por ação |
| Pareamento físico | Ajustes → Dispositivos | Hardware e protocolo disponíveis |

Não incluir conector CalDAV próprio ou posição livre do mascote como pendências esquecidas: o status atual registra decisões de não implementá-los. Reabrir apenas quando houver nova necessidade explícita.

## 16. Critério de conclusão completa

- [ ] As 29 unidades têm resultado registrado ou desmembramento rastreável, sem item silenciosamente abandonado.
- [ ] Todos os destinos, diálogos, formulários e renderers da matriz usam a nova linguagem visual.
- [ ] Adaptive Notch oficial apresenta moldura e quinas corretas nas quatro combinações e no modo compacto.
- [ ] Tema e posição são configuráveis em Ajustes e sobrevivem ao reinício.
- [ ] Menu diário contém apenas Hoje, Agenda, Tarefas, Notas e Taby, com Ajustes separado.
- [ ] Ferramentas secundárias continuam encontráveis por contexto e comandos.
- [ ] Dados, foco, calendário, voz, modelo e conversas mantêm comportamento atual.
- [ ] Mascote inicia e permanece funcional durante digitação/envio; barra rápida mantém pedidos e confirmações.
- [ ] Não há texto demonstrativo, métrica inventada, controle sem função ou sucesso sem confirmação do serviço.
- [ ] Claro/escuro, pt/en, teclado, leitor de tela, redução de movimento e layouts definidos foram verificados.
- [ ] Desenvolvimento e pacote de produção abrem corretamente; recursos locais e assets estão presentes.
- [ ] Legado sem consumidores removido; fonte visual e referência arquivada permanecem disponíveis para comparação.
- [ ] PRs integrados conforme contrato, CI verde e documentação de validação ligada ao commit entregue.

**Primeira execução concreta:** U00 para congelar evidência e mapear a principal; U01/U02 para preparar a fundação; U03 para colocar a navegação aprovada no app real. U04 disponibiliza as preferências antes da migração das telas. A reconstrução completa de Ajustes permanece no fim, conforme o protocolo dos arquivos compartilhados.
