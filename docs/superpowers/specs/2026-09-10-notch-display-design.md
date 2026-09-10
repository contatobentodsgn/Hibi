# Monitor do notch e "Testar notch" — desenho

Data: 2026-09-10. Branch: `feat/notch-display`, a partir de `main`.

## Contexto

O original tem "Monitor do notch" nas Configurações gerais, e a auditoria dele sugere um teste
visual do monitor. O Hibi não tem nenhum dos dois:

- `createNotchWindowManager` calcula o monitor **uma vez**, ao iniciar: a primeira tela que o addon
  informa com câmera, senão a principal. `setPreferredDisplay` existe, mas nada o chama.
- **Defeito:** como a escolha é congelada ao iniciar, um app aberto com a tampa fechada (só o
  monitor externo ligado) fica preso na tela principal mesmo depois de a tampa abrir.
- A matriz de validação do notch tem linhas abertas — monitor externo, reconexão, Spaces, tela
  cheia, sono — e não existe no app um jeito de mostrar um cartão sob demanda para conferir.

## Decisões

| Pergunta | Escolha |
| --- | --- |
| Onde fica | Configurações › Geral, como no original |
| Opções | "Automático" (padrão) ou um monitor específico |
| Onde a escolha é salva | Processo principal, `notch-settings.json` em `userData`: o notch é posicionado antes de o renderer carregar |
| O que o teste mostra | Um cartão passivo e, em seguida, uma confirmação "Apareceu?" — as duas superfícies do notch, com entrega da resposta |
| Desenhar sobre a câmera | Não. Mantém `docs/notch-reference-analysis.md` |

## 1. Resolução do monitor

Função pura `resolveNotchDisplay(displays, primary, { preferredDisplayId, cameraHousingIds })` em
`electron/notch-geometry.cjs`, que substitui `selectDisplay`. Devolve `{ display, reason }`:

1. o monitor preferido, se estiver conectado → `reason: 'preferred'`;
2. senão, o primeiro monitor (na ordem de `screen.getAllDisplays()`) cujo id está em
   `cameraHousingIds` → `'camera-housing'`;
3. senão, o principal → `'primary'`.

O gerenciador chama a função **a cada** posicionamento e apresentação, lendo
`nativeBridge.screenGeometry()` na hora (falha ou ausência do addon vira lista vazia). Isso corrige o
defeito da tampa fechada.

Uma preferência cujo monitor está desconectado **continua salva**: enquanto ele não volta, valem as
regras 2 e 3; quando ele reconecta com o mesmo id, volta a ser usado. No macOS o id é o
`CGDirectDisplayID`, estável para o mesmo monitor no uso normal; se mudar (outra porta ou
adaptador), a tela mostra a preferência como desconectada e a pessoa escolhe de novo.

## 2. Preferência salva

`electron/notch-settings.cjs` → `createNotchSettings({ filePath })` com `get()` e `save(value)`.

- Formato: `{ displayId: number | null, displayLabel: string }`. Padrão
  `{ displayId: null, displayLabel: '' }`.
- `displayId` é `null` ou inteiro entre 1 e 4294967295. `displayLabel` é aparado, até 120
  caracteres, e vazio quando `displayId` é `null`. Valor inválido em `save` lança
  `'Invalid notch settings.'`.
- Arquivo ausente, JSON corrompido ou conteúdo inválido em disco → padrão.
- Gravação com `mode: 0o600`, igual a `connector-settings.cjs`.

## 3. Gerenciador e processo principal

**`createNotchWindowManager`** recebe `preferredDisplayId` inicial e ganha:

- `describeDisplays()` → `{ resolvedDisplayId, reason, displays }`, com cada monitor como
  `{ id, label, primary, internal, hasCameraHousing, width, height }`. `label` vem de
  `display.label`; vazio vira `Monitor N` (posição na lista, a partir de 1).
- `get activeInteractive()` → verdadeiro quando a apresentação ativa tem ações.
- `setPreferredDisplay(id)` continua reposicionando o cartão visível.

**IPC novo** (`electron/main.cjs`, `preload.cjs`, `src/global.d.ts`):

| Canal | Ponte | Faz |
| --- | --- | --- |
| `hibi:notch:displays` | `listNotchDisplays()` | `{ preference, resolvedDisplayId, reason, displays }` |
| `hibi:notch:set-display` | `setNotchDisplay(id \| null)` | Aceita `null` ou o id de um monitor **conectado**; senão lança `'Invalid notch display.'`. Salva com o rótulo atual, aplica e devolve o mesmo formato de `displays` |
| `hibi:notch:test` | `testNotch(locale)` | Roda o teste da seção 4; `locale` fora de `pt`/`en` vira `pt` |
| `hibi:notch:displays-changed` | `onNotchDisplaysChanged(cb)` | Enviado à janela principal quando um monitor entra, sai ou muda de métrica, depois do reposicionamento |

`attachNotchLifecycle` ganha um callback `onDisplaysChanged`, chamado nos três eventos de monitor
(não no `resume` de energia).

## 4. Teste do notch

`electron/notch-test.cjs` → `createNotchTest({ manager, setTimer, clearTimer, passiveMs = 2500,
answerMs = 20000 })` com `run(locale)` e `handleAction(action)`.

1. Se um teste já está rodando → `busy`. Se há uma apresentação **interativa** ativa que não é do
   teste → `busy`: o teste nunca tampa uma confirmação real pendente. Um cartão passivo real pode
   ser substituído.
2. Mostra o cartão passivo `notch-test-passive-N` (`kind: 'result'`, sem ações) por `passiveMs` e
   o esconde. Se nesse intervalo outra apresentação o substituiu → `interrupted`, sem passo 3.
3. Mostra a confirmação `notch-test-confirm-N` (`kind: 'confirmation'`, `interaction: 'capture'`)
   com as ações `confirm` ("Apareceu") e `cancel` ("Não apareceu").
   - `confirm` → `confirmed`; `cancel` → `declined`;
   - sem resposta em `answerMs` → esconde e devolve `timeout`, ou `interrupted` se outra
     apresentação já a tinha substituído.

`run` devolve `{ outcome, displayId, displayLabel }` com o monitor em que o teste começou. Uma
exceção do gerenciador durante o teste devolve `failed` e libera um novo teste.
Textos dos cartões existem em `pt` e `en` dentro do módulo, porque o processo principal não
conhece o idioma da interface.

`handleAction` resolve o teste e devolve `true` só para ids do teste. Em `main.cjs`, o `onAction`
do gerenciador consulta `handleAction` antes de encaminhar a ação ao renderer: as respostas do
teste nunca chegam ao `CompanionController`.

## 5. Tela

Componente `src/ui/NotchDisplaySettings.tsx`, montado em Configurações › Geral depois de
"Launch at login". Os textos novos passam pelo dicionário `pt`/`en`.

- **Monitor do notch** — "Onde o Taby aparece":
  - `Automático · <monitor resolvido>` e uma opção por monitor conectado, com os sufixos
    "com notch" e "principal" quando couberem;
  - uma preferência desconectada aparece como opção desabilitada e selecionada,
    `<rótulo> · desconectado`, com a nota "O notch usa <monitor resolvido> até ele voltar.";
  - trocar chama `setNotchDisplay` e atualiza a lista com a resposta.
- **Testar notch** — "Mostra um cartão e uma confirmação no monitor escolhido": botão
  desabilitado durante o teste ("Testando…") e resultado numa região `aria-live`:

| Resultado | Mensagem |
| --- | --- |
| `confirmed` | Confirmado pelo notch em `<monitor>`. |
| `declined` | Você indicou que o cartão não apareceu em `<monitor>`. |
| `timeout` | Sem resposta em 20 s. O cartão pode não ter aparecido em `<monitor>`. |
| `busy` | Há uma confirmação pendente no notch. Responda a ela e teste de novo. |
| `interrupted` | O teste foi interrompido por outro aviso do Taby. |
| `failed` (exceção no processo principal ou na chamada) | Não foi possível mostrar o teste no notch. |
| ponte ausente | Disponível no app desktop. |

Uma falha ao trocar o monitor mostra "Não foi possível trocar o monitor do notch.".

- A lista é lida ao montar e relida a cada `onNotchDisplaysChanged`.
- Eventos de instrumentação: `edit · Notch display` e `test · Notch`.
- Funções puras exportadas para teste sem DOM: opções do seletor e mensagem do resultado.

## 6. Validação no monitor externo

Depois da implementação, no app Electron real em modo de produção, com o LG ULTRAWIDE como
principal e a tela integrada com notch:

**Executado por automação e registrado em `docs/notch-manual-results.md`:**

- "Automático" escolhe a tela integrada com notch mesmo com o LG como principal;
- com o LG escolhido, o cartão e a confirmação ficam dentro dos limites do LG e a confirmação
  clicada na overlay devolve `confirmed`; o mesmo com a tela integrada;
- a escolha sobrevive a reiniciar o app;
- captura de tela de cada monitor, se a permissão de gravação de tela permitir.

**Depende de alguém no Mac**, com o botão "Testar notch" como procedimento — o registro traz o
roteiro passo a passo:

- desconectar e reconectar o LG com ele escolhido;
- Spaces e tela cheia;
- suspender e acordar;
- olhar humano confirmando posição e legibilidade.

O LG não tem câmera: vale como "tela sem notch", não como "Mac sem notch".

## Fora do escopo

Tamanho do cartão, "local de exibição" do Taby, zona invisível no topo, desenhar sobre a câmera e
redesenho visual das Configurações.

## Testes

Gate: `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`.

**`node --test`:**

- `notch-geometry.test.cjs` — as três regras de `resolveNotchDisplay` e a preferida desconectada.
- `notch-settings.test.cjs` — padrão, ida e volta, recusa de valores inválidos, arquivo corrompido.
- `notch-window.test.cjs` — resolução a cada apresentação (tampa aberta depois de iniciar),
  `describeDisplays`, `activeInteractive`, preferência inicial.
- `notch-test.test.cjs` — `confirmed`, `declined`, `timeout`, `busy` (teste rodando e confirmação
  real), `interrupted` nos dois passos, `handleAction` ignorando ids alheios.
- `navigation-policy.test.cjs` — `attachNotchLifecycle` chama `onDisplaysChanged` nos eventos de
  monitor e não no `resume`.

**Vitest:** opções do seletor (automático, sufixos, desconectada) e mensagens de resultado.

**Playwright** (ponte simulada): Configurações › Geral lista os monitores; escolher um chama
`setNotchDisplay` com o id; "Testar notch" mostra a mensagem de confirmado; um evento
`displays-changed` atualiza a lista.
