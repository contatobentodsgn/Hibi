# `/folder` e `/break` — desenho

Data: 2026-09-10. Branch: `feat/folders-break`, a partir de `feat/ui-foundation`.

## Contexto

O original tem 21 comandos; o Hibi tem 20 e não tem `/folder` nem `/break`. No original os dois
são atalhos de navegação. No Hibi, as duas ausências escondem defeitos maiores que o atalho:

- **Pastas** são um texto livre em `Task.folder` e `Note.folder`. Os filtros de Tarefas e de Notas
  são **fixos no código** — um único botão "Folder · Bento" —, então uma pasta com outro nome nunca
  pode ser filtrada. Não há lista, renomeação nem navegação. Uma tarefa sem pasta aparece como
  "Unfiled" e uma nota sem pasta aparece como "Bento", sem estar nela.
- **Pausa** é o mesmo cronômetro do Foco com outro rótulo. Terminar uma pausa dispara
  `onFocusCompleted` e o evento `focus-complete`: conta como sessão de foco. O plano de `/stats`
  (`dedicated-stats`) calcula sessões e minutos de foco a partir de `focus.*`, então a estatística
  nasceria errada.

## Decisões

| Pergunta | Escolha |
| --- | --- |
| Escopo do `/folder` | Pastas reais **derivadas** dos itens, sem entidade nova |
| Escopo do `/break` | Pausa de verdade dentro do Foco, com eventos próprios |
| Onde vive o `/folder` | Um modo de pastas **dentro da paleta `⌘K`**, que já é da nova UI |

A paleta foi escolhida porque é a única superfície já reconstruída: nada é feito no visual antigo
para ser refeito depois, e a ordem de reconstrução das telas pelo dock é preservada.

## 1. Regras das pastas

**Módulo puro `src/domain/folders.ts`:**

- `NO_FOLDER = ''` identifica o grupo "Sem pasta". Como todo nome real é não vazio depois de
  aparado, a chave vazia nunca colide com uma pasta.
- `folderOf(item)` devolve o nome aparado ou `NO_FOLDER`.
- `listFolders(data)` devolve `{ name, tasks, notes }[]`: nomes reais em ordem alfabética
  (`localeCompare` com `pt-BR`), e o grupo "Sem pasta" por último, só quando existir.
- Igualdade de pastas é exata depois de aparar espaços e normalizar para NFC: "bento" e "Bento" são
  pastas diferentes até uma ser renomeada para a outra. Nada se junta sem ação explícita.
- `planFolderRename(data, from, to)` devolve `{ ok: true, from, to, tasks, notes, merge }` ou
  `{ ok: false, reason }`, com `reason` em `empty | unchanged | too-long | no-folder | missing`.
  O limite é 120 caracteres. `merge` é verdadeiro quando `to` já existe.

**Repositório:** `renameFolder(from, to)` aplica em tarefas e notas usando `updateTask` e
`updateNote`, e devolve as contagens. Quem chama valida antes com `planFolderRename`; como guarda
extra, `renameFolder` também recusa "Sem pasta" e um nome que fica vazio depois de aparado.

**Consistência:** nota sem pasta passa a ser exibida como "Sem pasta", igual às tarefas. A criação
continua com "Bento" como padrão: nenhum dado existente muda.

**Não muda:** modelo de dados, formato do backup, mapeamento do Notion (pasta não é mapeada, logo
renomear não gera sincronização), API local e ferramentas do Taby.

## 2. Modo de pastas na paleta

- `/folder` entra na lista de comandos com uma **ação** em vez de rota. `PaletteCommand` passa a
  aceitar `{ route }` ou `{ action: 'folders' }`.
- Abrir `/folder` troca a paleta para a **vista de pastas** e limpa o campo. Ali o campo filtra
  pastas pelo nome e não é enviado ao Taby.
- Cada linha mostra o nome e as contagens ("3 tarefas · 1 nota"). `↑↓` seleciona.
  - `↵` abre Tarefas filtrada pela pasta; `⇧↵` abre Notas filtrada pela pasta.
  - `⌘↵` renomeia: a linha vira um campo preenchido com o nome atual.
  - `esc` na lista volta aos comandos; `esc` na renomeação volta à lista.
- Ao confirmar a renomeação, a paleta consulta `planFolderRename`:
  - **renomear sem juntar** aplica na hora — é reversível renomeando de volta;
  - **juntar** mostra antes "Juntar 'Bnto' em 'Bento': 3 tarefas e 1 nota" e só aplica com um
    segundo `↵`, porque juntar não se desfaz;
  - **recusa** mostra o motivo na própria linha.
- "Sem pasta" abre normalmente, mas não oferece renomeação.
- Rodapé e textos novos passam pelo dicionário `pt`/`en`.

**Navegação com filtro:** `navigate(key, { folder })`, em que `folder` é o nome da pasta ou
`NO_FOLDER` para "Sem pasta". O `App` guarda o filtro pedido e o passa como `initialFolder` para
`TasksView` e `NotesView`, com `key` que muda a cada pedido para que o filtro seja reaplicado mesmo
voltando à mesma tela. Navegar sem `folder` limpa o filtro (`null`, todas as pastas).

## 3. Telas de Tarefas e Notas

As duas telas continuam no visual antigo; muda só o necessário para as pastas funcionarem.

- **Filtros derivados:** "Todas" mais uma opção por pasta que tenha itens daquele tipo, com
  contagem, mais "Sem pasta" quando houver. Substitui o botão fixo "Folder · Bento".
- **`initialFolder`** define o filtro inicial; `null` significa todas.
- **Criação de tarefa:** o campo de pasta ganha sugestões das pastas existentes (`datalist`).
- **Notas:** o editor ganha um campo de pasta com as mesmas sugestões. O padrão é a pasta do filtro
  ativo quando for uma pasta real, senão "Bento". `onCreate` passa a receber a pasta, e editar uma
  nota permite mudar a pasta.

## 4. `/break`

- Nova rota `break`. `dockKeyFor('break')` devolve `focus`, como `day` e `week` devolvem `agenda`.
- `FocusView` recebe `mode: 'focus' | 'break'` e `onModeChange`, que troca a **rota** entre `focus`
  e `break` — o mesmo desenho de `AgendaView` com `day` e `week`.
  - **Foco:** 25 minutos e um botão "Fazer uma pausa". As opções 5/10/15 saem do modo foco — era
    justamente isso que misturava pausa com foco.
  - **Pausa:** 5, 10 ou 15 minutos, 5 por padrão; título "Pausa"; companion em repouso durante a
    contagem; botão "Voltar ao foco". Não começa sozinha, igual ao Foco.
- Eventos da pausa: `break-start`, `break-stop`, `break-complete`. A pausa **nunca** chama
  `onFocusStarted` nem `onFocusCompleted`.
- `/break` entra na paleta (grupo Trabalho) e na Ajuda.

**Coordenação com `/stats`:** o plano de estatísticas deve ignorar `break-*` ao contar foco.

## Fora do escopo

Pasta vazia, excluir pasta, lembrar a última pasta usada, pasta em lembretes, hábitos ou metas,
redesenho visual de Tarefas, Notas e Foco, e o título fixo "Post 1 — Kabrito digital" do modo foco.

## Testes

Gate: `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`.

**Vitest (sem DOM):**

- `folders.test.ts` — agrupamento, ordem, "Sem pasta" por último, igualdade exata, e todos os
  motivos de recusa e o caso de junção de `planFolderRename`.
- `local-repository.test.ts` — `renameFolder` atualiza só os itens da pasta e devolve as contagens.
- Comandos da paleta — `/folder` com ação, `/break` com rota; `dockKeyFor('break')`.
- `FocusView` — marcação dos dois modos.

O teste de smoke "Focus aplica a duração escolhida antes de iniciar" clica em "5m break" dentro do
modo foco; como essas opções saem do foco, ele é reescrito para escolher a duração no modo pausa.

**Playwright (pt, navegação pelo dock):**

- `/folder` lista pastas com contagens; `↵` abre Tarefas filtrada; `⇧↵` abre Notas filtrada.
- Renomear sem juntar aplica; juntar pede o segundo `↵` e mostra a contagem; `esc` volta.
- "Sem pasta" não oferece renomeação.
- Tarefas e Notas mostram filtros de todas as pastas reais.
- `/break` abre o Foco em pausa com 5 minutos e o dock marca Foco. Com relógio simulado, terminar a
  pausa registra `break-complete` e nenhum `focus-complete`.
