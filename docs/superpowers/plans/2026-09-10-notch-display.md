# Monitor do notch e "Testar notch" — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a pessoa escolher em que monitor o notch aparece e testar o notch pelas Configurações, corrigindo a escolha automática congelada ao iniciar.

**Architecture:** A resolução do monitor vira uma função pura chamada a cada posicionamento. A preferência fica num arquivo do processo principal. Um executor de teste no processo principal mostra um cartão passivo e uma confirmação e devolve o resultado por IPC. Um componente nas Configurações › Geral lista os monitores, troca a preferência e roda o teste.

**Tech Stack:** Electron 44 (CommonJS em `electron/`), React 19 + TypeScript, `node --test`, Vitest 5 (sem DOM), Playwright 1.63.

Spec: `docs/superpowers/specs/2026-09-10-notch-display-design.md`.

**Regras deste repositório**

- Rode tudo a partir de `/Volumes/Games/Projetos/Hibi/Hibi/.worktrees/notch-display`.
- Um hook de shell cacheia a saída de testes: use sempre `rtk proxy` na frente de `npx vitest`,
  `npx playwright` e `npm test`. `node --test` roda sem o proxy.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Nunca use `git stash` sem argumentos.
- Comentários no código em português, curtos, só quando explicam um porquê.

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `electron/notch-geometry.cjs` | `resolveNotchDisplay` substitui `selectDisplay` |
| `electron/notch-window.cjs` | Resolução a cada posicionamento, preferência inicial, `describeDisplays`, `activeInteractive` |
| `electron/notch-settings.cjs` (novo) | Preferência salva e as funções `notchDisplayState`/`applyNotchDisplay` usadas pelo IPC |
| `electron/notch-test.cjs` (novo) | Executor do teste do notch |
| `electron/main.cjs` | IPC novo, `onDisplaysChanged`, roteamento das ações do teste |
| `electron/preload.cjs`, `src/global.d.ts` | Ponte e tipos |
| `src/ui/notch-display.ts` (novo) | Tipos e funções puras da tela |
| `src/i18n/dictionary.ts` | Textos `pt`/`en` |
| `src/ui/NotchDisplaySettings.tsx` (novo) | Linhas "Monitor do notch" e "Teste do notch" |
| `src/ui/SettingsView.tsx` | Monta o componente na aba Geral |
| `tests/e2e/notch-display.spec.ts` (novo) | Fluxo com ponte simulada |

---

### Task 1: `resolveNotchDisplay`

**Files:**
- Modify: `electron/notch-geometry.cjs:32-37`
- Test: `electron/notch-geometry.test.cjs`

- [ ] **Step 1: Escrever os testes que falham**

Em `electron/notch-geometry.test.cjs`, troque a linha 2 por:

```js
const { BASE_WIDTH, BASE_HEIGHT, activationBounds, notchBounds, scaleForDisplay, resolveNotchDisplay } = require('./notch-geometry.cjs');
```

Troque o último teste (`clamps dormant activation zone and falls back to primary display`) por:

```js
test('clamps dormant activation zone', () => { assert.deepEqual(activationBounds({ bounds: { x: 0, y: 0, width: 5000, height: 5000 } }).width, 320); assert.deepEqual(activationBounds({ bounds: { x: 0, y: 0, width: 500, height: 500 } }).height, 38); });

const internal = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };

test('usa o monitor preferido quando ele está conectado', () => {
  assert.deepEqual(resolveNotchDisplay([external, internal], external, { preferredDisplayId: 2, cameraHousingIds: [1] }), { display: external, reason: 'preferred' });
});

test('sem preferência, escolhe a tela com câmera mesmo quando outra é a principal', () => {
  assert.deepEqual(resolveNotchDisplay([external, internal], external, { preferredDisplayId: null, cameraHousingIds: [1] }), { display: internal, reason: 'camera-housing' });
});

test('preferido desconectado cai para a tela com câmera e, sem ela, para a principal', () => {
  assert.deepEqual(resolveNotchDisplay([external, internal], external, { preferredDisplayId: 9, cameraHousingIds: [1] }), { display: internal, reason: 'camera-housing' });
  assert.deepEqual(resolveNotchDisplay([external], external, { preferredDisplayId: 9, cameraHousingIds: [] }), { display: external, reason: 'primary' });
  assert.deepEqual(resolveNotchDisplay([external], external), { display: external, reason: 'primary' });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test electron/notch-geometry.test.cjs`
Expected: FAIL — `resolveNotchDisplay is not a function`.

- [ ] **Step 3: Implementar**

Em `electron/notch-geometry.cjs`, troque `selectDisplay` e o `module.exports` por:

```js
// Ordem: o monitor escolhido, se conectado; senão a tela com câmera; senão a principal.
function resolveNotchDisplay(displays, primary, { preferredDisplayId = null, cameraHousingIds = [] } = {}) {
  const preferred = displays.find((display) => display.id === preferredDisplayId);
  if (preferred) return { display: preferred, reason: 'preferred' };
  const housing = displays.find((display) => cameraHousingIds.includes(display.id));
  if (housing) return { display: housing, reason: 'camera-housing' };
  return { display: primary, reason: 'primary' };
}

module.exports = { BASE_WIDTH, BASE_HEIGHT, scaleForDisplay, notchBounds, actionBounds, activationBounds, resolveNotchDisplay };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test electron/notch-geometry.test.cjs`
Expected: PASS. `electron/notch-window.test.cjs` quebra até a Task 2 (ainda importa `selectDisplay`); é esperado.

- [ ] **Step 5: Commit**

```bash
git add electron/notch-geometry.cjs electron/notch-geometry.test.cjs
git commit -m "feat(notch): resolve the notch display from preference, camera housing and primary

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Gerenciador resolve a cada posicionamento

**Files:**
- Modify: `electron/notch-window.cjs`
- Test: `electron/notch-window.test.cjs`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `electron/notch-window.test.cjs`:

```js
test('o automático é reavaliado a cada apresentação: a tampa aberta depois de iniciar passa a valer', () => {
  const calls = [];
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  let lidOpen = false;
  const multiScreen = { getAllDisplays: () => lidOpen ? [external, macbook] : [external], getPrimaryDisplay: () => external };
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => lidOpen ? [{ displayId: 2, hasCameraHousing: false }, { displayId: 1, hasCameraHousing: true }] : [{ displayId: 2, hasCameraHousing: false }],
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show({ requestId: 'lid-closed', kind: 'result', text: 'a', actions: [], interaction: 'passthrough' });
  lidOpen = true;
  manager.show({ requestId: 'lid-open', kind: 'result', text: 'b', actions: [], interaction: 'passthrough' });

  assert.deepEqual(calls, [2, 1]);
});

test('usa a preferência inicial e volta ao automático com setPreferredDisplay(null)', () => {
  const calls = [];
  const external = { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => [{ displayId: 2, hasCameraHousing: false }, { displayId: 1, hasCameraHousing: true }],
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
    repositionHost: () => true,
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin', preferredDisplayId: 2 });

  manager.show({ requestId: 'preferred', kind: 'result', text: 'a', actions: [], interaction: 'passthrough' });
  manager.setPreferredDisplay(null);
  manager.show({ requestId: 'automatic', kind: 'result', text: 'b', actions: [], interaction: 'passthrough' });

  assert.deepEqual(calls, [2, 1]);
});

test('uma falha ao ler as telas do addon cai para a tela principal', () => {
  const calls = [];
  const nativeBridge = {
    nativeHostAvailable: () => true,
    createHost: () => true,
    screenGeometry: () => { throw new Error('addon indisponível'); },
    showHost: (_presentation, displayId) => { calls.push(displayId); return true; },
  };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  manager.show(presentation);

  assert.deepEqual(calls, [1]);
});

test('describeDisplays informa rótulo, principal, câmera e o monitor resolvido', () => {
  const external = { id: 2, label: 'LG ULTRAWIDE', internal: false, bounds: { x: 0, y: 0, width: 2560, height: 1080 } };
  const macbook = { id: 1, label: '', internal: true, bounds: { x: 570, y: -956, width: 1470, height: 956 } };
  const multiScreen = { getAllDisplays: () => [external, macbook], getPrimaryDisplay: () => external };
  const nativeBridge = { screenGeometry: () => [{ displayId: 1, hasCameraHousing: true }] };
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen: multiScreen, preloadPath: 'preload', load: () => {}, nativeBridge, platform: 'darwin' });

  assert.deepEqual(manager.describeDisplays(), {
    resolvedDisplayId: 1,
    reason: 'camera-housing',
    displays: [
      { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 },
      { id: 1, label: 'Monitor 2', primary: false, internal: true, hasCameraHousing: true, width: 1470, height: 956 },
    ],
  });
  manager.setPreferredDisplay(2);
  assert.deepEqual({ ...manager.describeDisplays(), displays: undefined }, { resolvedDisplayId: 2, reason: 'preferred', displays: undefined });
});

test('activeInteractive só é verdadeiro enquanto há uma confirmação ativa', () => {
  const manager = createNotchWindowManager({ BrowserWindowClass: FakeWindow, screen, preloadPath: 'preload', load: () => {}, platform: 'darwin' });

  assert.equal(manager.activeInteractive, false);
  manager.show(presentation);
  assert.equal(manager.activeInteractive, false);
  manager.show({ requestId: 'confirm-me', kind: 'confirmation', text: 'Ok?', actions: [{ id: 'confirm', label: 'Confirmar' }], interaction: 'capture' });
  assert.equal(manager.activeInteractive, true);
  manager.resolveAction('confirm-me', 'confirm');
  assert.equal(manager.activeInteractive, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test electron/notch-window.test.cjs`
Expected: FAIL — a importação de `selectDisplay` quebrou e os testes novos falham (`describeDisplays is not a function`, chamadas `[2, 2]`, exceção do addon).

- [ ] **Step 3: Implementar**

Em `electron/notch-window.cjs`:

1. Linha 1:

```js
const { notchBounds, actionBounds, resolveNotchDisplay } = require('./notch-geometry.cjs');
```

2. Assinatura (linha 9):

```js
function createNotchWindowManager({ BrowserWindowClass, screen, preloadPath, load, nativeBridge, onAction, platform = process.platform, preferredDisplayId: initialPreferredDisplayId = null }) {
```

3. Troque as linhas 15-21 (o comentário, `nativeNotchDisplay`, `preferredDisplayId`, `getWindow`, `makePassive`, `selectedDisplay`) por:

```js
  let preferredDisplayId = Number.isInteger(initialPreferredDisplayId) ? initialPreferredDisplayId : null;
  const getWindow = () => window && !window.isDestroyed() ? window : null;
  const makePassive = (target) => { target.setIgnoreMouseEvents?.(true, { forward: true }); target.setFocusable?.(false); };
  // Lido a cada posicionamento, e não só ao iniciar: um app aberto com a tampa fechada precisa
  // passar para a tela com câmera quando ela aparece.
  const cameraHousingIds = () => {
    try {
      const screens = nativeBridge?.screenGeometry?.();
      return Array.isArray(screens) ? screens.filter((entry) => entry?.hasCameraHousing && Number.isInteger(entry.displayId)).map((entry) => entry.displayId) : [];
    } catch { return []; }
  };
  const resolution = () => resolveNotchDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay(), { preferredDisplayId, cameraHousingIds: cameraHousingIds() });
  const selectedDisplay = () => resolution().display;
```

4. No objeto devolvido, logo depois de `reposition() { ... },`, acrescente:

```js
    describeDisplays() {
      const displays = screen.getAllDisplays();
      const primaryId = screen.getPrimaryDisplay().id;
      const housing = cameraHousingIds();
      const { display, reason } = resolveNotchDisplay(displays, screen.getPrimaryDisplay(), { preferredDisplayId, cameraHousingIds: housing });
      return {
        resolvedDisplayId: display.id,
        reason,
        displays: displays.map((entry, index) => ({
          id: entry.id,
          label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : `Monitor ${index + 1}`,
          primary: entry.id === primaryId,
          internal: entry.internal === true,
          hasCameraHousing: housing.includes(entry.id),
          width: entry.bounds.width,
          height: entry.bounds.height,
        })),
      };
    },
```

5. Junto dos outros getters, acrescente:

```js
    get activeInteractive() { return activeRequestId !== null && activeActions.size > 0; },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test electron/notch-window.test.cjs electron/notch-geometry.test.cjs`
Expected: PASS, incluindo o teste antigo `prefers the physical Mac notch display when an external display is primary`.

- [ ] **Step 5: Commit**

```bash
git add electron/notch-window.cjs electron/notch-window.test.cjs
git commit -m "fix(notch): re-resolve the notch display on every placement

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Preferência salva

**Files:**
- Create: `electron/notch-settings.cjs`
- Test: `electron/notch-settings.test.cjs`

- [ ] **Step 1: Escrever os testes que falham**

Crie `electron/notch-settings.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNotchSettings, applyNotchDisplay, notchDisplayState } = require('./notch-settings.cjs');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hibi-notch-settings-')), 'notch-settings.json');
const lg = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };
const internal = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1470, height: 956 };
const fakeManager = () => {
  const calls = [];
  let preferred = null;
  return {
    calls,
    setPreferredDisplay: (displayId) => { calls.push(displayId); preferred = displayId; },
    describeDisplays: () => ({ resolvedDisplayId: preferred ?? 1, reason: preferred ? 'preferred' : 'camera-housing', displays: [lg, internal] }),
  };
};

test('começa no automático e guarda a escolha entre instâncias', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  assert.deepEqual(settings.get(), { displayId: null, displayLabel: '' });

  assert.deepEqual(settings.save({ displayId: 2, displayLabel: '  LG ULTRAWIDE  ' }), { displayId: 2, displayLabel: 'LG ULTRAWIDE' });
  assert.deepEqual(createNotchSettings({ filePath: settings.filePath }).get(), { displayId: 2, displayLabel: 'LG ULTRAWIDE' });
  assert.equal(fs.statSync(settings.filePath).mode & 0o777, 0o600);

  assert.deepEqual(settings.save({ displayId: null, displayLabel: 'ignorado' }), { displayId: null, displayLabel: '' });
});

test('limita o rótulo a 120 caracteres', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  assert.equal(settings.save({ displayId: 3, displayLabel: 'x'.repeat(200) }).displayLabel.length, 120);
});

test('recusa valores inválidos sem gravar', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  for (const value of [null, {}, { displayId: 0 }, { displayId: -1 }, { displayId: 1.5 }, { displayId: '2' }, { displayId: 4_294_967_296 }, { displayId: 2, displayLabel: 5 }]) {
    assert.throws(() => settings.save(value), /Invalid notch settings/);
  }
  assert.equal(fs.existsSync(settings.filePath), false);
});

test('arquivo corrompido ou com conteúdo inválido volta ao automático', () => {
  const filePath = tempFile();
  fs.writeFileSync(filePath, '{ nope');
  assert.deepEqual(createNotchSettings({ filePath }).get(), { displayId: null, displayLabel: '' });
  fs.writeFileSync(filePath, JSON.stringify({ displayId: 'x' }));
  assert.deepEqual(createNotchSettings({ filePath }).get(), { displayId: null, displayLabel: '' });
});

test('applyNotchDisplay salva o monitor conectado com o rótulo atual e aplica no gerenciador', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  const manager = fakeManager();

  const chosen = applyNotchDisplay(settings, manager, 2);
  assert.deepEqual(chosen, { preference: { displayId: 2, displayLabel: 'LG ULTRAWIDE' }, resolvedDisplayId: 2, reason: 'preferred', displays: [lg, internal] });

  const automatic = applyNotchDisplay(settings, manager, null);
  assert.deepEqual(automatic.preference, { displayId: null, displayLabel: '' });
  assert.deepEqual(manager.calls, [2, null]);
  assert.deepEqual(notchDisplayState(settings, manager), automatic);
});

test('applyNotchDisplay recusa monitor desconectado ou id inválido sem salvar nem aplicar', () => {
  const settings = createNotchSettings({ filePath: tempFile() });
  const manager = fakeManager();
  for (const value of [9, '2', 2.5, undefined]) assert.throws(() => applyNotchDisplay(settings, manager, value), /Invalid notch display/);
  assert.deepEqual(settings.get(), { displayId: null, displayLabel: '' });
  assert.deepEqual(manager.calls, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test electron/notch-settings.test.cjs`
Expected: FAIL — `Cannot find module './notch-settings.cjs'`.

- [ ] **Step 3: Implementar**

Crie `electron/notch-settings.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');

const MAX_DISPLAY_ID = 4_294_967_295;
const MAX_LABEL = 120;
const defaults = () => ({ displayId: null, displayLabel: '' });

function normalizeNotchSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid notch settings.');
  if (value.displayId === null) return defaults();
  if (!Number.isInteger(value.displayId) || value.displayId < 1 || value.displayId > MAX_DISPLAY_ID) throw new Error('Invalid notch settings.');
  if (value.displayLabel !== undefined && typeof value.displayLabel !== 'string') throw new Error('Invalid notch settings.');
  return { displayId: value.displayId, displayLabel: (value.displayLabel ?? '').trim().slice(0, MAX_LABEL) };
}

function createNotchSettings({ filePath } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A notch settings file path is required.');
  return {
    filePath,
    get() {
      try { return normalizeNotchSettings(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { return defaults(); }
    },
    save(value) {
      const next = normalizeNotchSettings(value);
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(filePath, 0o600);
      return next;
    },
  };
}

function notchDisplayState(settings, manager) {
  return { preference: settings.get(), ...manager.describeDisplays() };
}

// Só aceita um monitor conectado agora: o rótulo salvo é o que a tela mostra quando ele sai.
function applyNotchDisplay(settings, manager, displayId) {
  if (displayId === null) {
    settings.save({ displayId: null });
    manager.setPreferredDisplay(null);
    return notchDisplayState(settings, manager);
  }
  const target = Number.isInteger(displayId) ? manager.describeDisplays().displays.find((display) => display.id === displayId) : undefined;
  if (!target) throw new Error('Invalid notch display.');
  settings.save({ displayId: target.id, displayLabel: target.label });
  manager.setPreferredDisplay(target.id);
  return notchDisplayState(settings, manager);
}

module.exports = { createNotchSettings, normalizeNotchSettings, notchDisplayState, applyNotchDisplay };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test electron/notch-settings.test.cjs`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/notch-settings.cjs electron/notch-settings.test.cjs
git commit -m "feat(notch): persist the chosen notch display

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Executor do teste do notch

**Files:**
- Create: `electron/notch-test.cjs`
- Test: `electron/notch-test.test.cjs`

- [ ] **Step 1: Escrever os testes que falham**

Crie `electron/notch-test.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { createNotchTest } = require('./notch-test.cjs');

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fakeTimers() {
  const list = [];
  return {
    list,
    setTimer: (fn, ms) => { list.push({ fn, ms, cleared: false }); return list.length - 1; },
    clearTimer: (id) => { if (list[id]) list[id].cleared = true; },
    fire: (index) => { if (!list[index].cleared) list[index].fn(); },
  };
}
function fakeManager() {
  const shown = [];
  const hidden = [];
  let active = null;
  return {
    shown,
    hidden,
    get activeInteractive() { return Boolean(active && active.actions.length > 0); },
    describeDisplays: () => ({ resolvedDisplayId: 2, reason: 'preferred', displays: [{ id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 }] }),
    show(presentation) { shown.push(presentation); active = presentation; return { degraded: false, requestId: presentation.requestId }; },
    hide(requestId) { hidden.push(requestId); if (active?.requestId !== requestId) return false; active = null; return true; },
    // Outra apresentação do app ocupa o notch no meio do teste.
    replace(presentation) { active = presentation; },
  };
}
const setup = () => {
  const timers = fakeTimers();
  const manager = fakeManager();
  const notchTest = createNotchTest({ manager, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { timers, manager, notchTest };
};

test('mostra o cartão passivo, depois a confirmação, e devolve confirmed', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();

  assert.deepEqual(manager.shown[0], { requestId: 'notch-test-passive-1', kind: 'result', text: 'Teste do notch', actions: [], interaction: 'passthrough' });
  assert.equal(timers.list[0].ms, 2_500);
  timers.fire(0);
  await flush();

  assert.deepEqual(manager.hidden, ['notch-test-passive-1']);
  assert.deepEqual(manager.shown[1], { requestId: 'notch-test-confirm-1', kind: 'confirmation', text: 'Este cartão apareceu no monitor escolhido?', actions: [{ id: 'confirm', label: 'Apareceu' }, { id: 'cancel', label: 'Não apareceu' }], interaction: 'capture' });
  assert.equal(timers.list[1].ms, 20_000);

  assert.equal(notchTest.handleAction({ requestId: 'notch-test-confirm-1', actionId: 'confirm' }), true);
  assert.deepEqual(await running, { outcome: 'confirmed', displayId: 2, displayLabel: 'LG ULTRAWIDE' });
  assert.equal(timers.list[1].cleared, true);
});

test('cancelar devolve declined, com os textos em inglês', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('en');
  await flush();
  assert.equal(manager.shown[0].text, 'Notch test');
  timers.fire(0);
  await flush();
  assert.deepEqual(manager.shown[1].actions, [{ id: 'confirm', label: 'It appeared' }, { id: 'cancel', label: 'It did not appear' }]);

  notchTest.handleAction({ requestId: 'notch-test-confirm-1', actionId: 'cancel' });
  assert.equal((await running).outcome, 'declined');
});

test('idioma desconhecido usa português', async () => {
  const { manager, notchTest } = setup();
  void notchTest.run('xx');
  await flush();
  assert.equal(manager.shown[0].text, 'Teste do notch');
});

test('sem resposta, esconde a confirmação e devolve timeout', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();
  timers.fire(0);
  await flush();
  timers.fire(1);

  assert.equal((await running).outcome, 'timeout');
  assert.deepEqual(manager.hidden, ['notch-test-passive-1', 'notch-test-confirm-1']);
});

test('outra apresentação durante o cartão passivo interrompe o teste sem mostrar a confirmação', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();
  manager.replace({ requestId: 'reminder-1', kind: 'result', text: 'Lembrete', actions: [] });
  timers.fire(0);

  assert.equal((await running).outcome, 'interrupted');
  assert.equal(manager.shown.length, 1);
});

test('outra apresentação durante a confirmação interrompe o teste', async () => {
  const { timers, manager, notchTest } = setup();
  const running = notchTest.run('pt');
  await flush();
  timers.fire(0);
  await flush();
  manager.replace({ requestId: 'reminder-2', kind: 'result', text: 'Lembrete', actions: [] });
  timers.fire(1);

  assert.equal((await running).outcome, 'interrupted');
});

test('não tampa uma confirmação real pendente nem roda dois testes ao mesmo tempo', async () => {
  const { manager, notchTest } = setup();
  manager.replace({ requestId: 'notion-sync', kind: 'confirmation', text: 'Aplicar?', actions: [{ id: 'confirm', label: 'Confirmar' }] });
  assert.deepEqual(await notchTest.run('pt'), { outcome: 'busy', displayId: null, displayLabel: '' });
  assert.equal(manager.shown.length, 0);

  const other = setup();
  void other.notchTest.run('pt');
  await flush();
  assert.equal((await other.notchTest.run('pt')).outcome, 'busy');
  assert.equal(other.manager.shown.length, 1);
});

test('uma falha do gerenciador devolve failed e libera um novo teste', async () => {
  const timers = fakeTimers();
  const manager = { ...fakeManager(), activeInteractive: false, describeDisplays: () => { throw new Error('sem telas'); } };
  const notchTest = createNotchTest({ manager, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  assert.deepEqual(await notchTest.run('pt'), { outcome: 'failed', displayId: null, displayLabel: '' });
  assert.deepEqual(await notchTest.run('pt'), { outcome: 'failed', displayId: null, displayLabel: '' });
});

test('handleAction só assume as ações do teste', async () => {
  const { notchTest } = setup();
  assert.equal(notchTest.handleAction({ requestId: 'notion-sync', actionId: 'confirm' }), false);
  assert.equal(notchTest.handleAction({ requestId: 'notch-test-confirm-7', actionId: 'confirm' }), true);
  assert.equal(notchTest.handleAction(null), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test electron/notch-test.test.cjs`
Expected: FAIL — `Cannot find module './notch-test.cjs'`.

- [ ] **Step 3: Implementar**

Crie `electron/notch-test.cjs`:

```js
// O processo principal não conhece o idioma da interface; o renderer informa `pt` ou `en`.
const TEXTS = {
  pt: { passive: 'Teste do notch', question: 'Este cartão apareceu no monitor escolhido?', confirm: 'Apareceu', cancel: 'Não apareceu' },
  en: { passive: 'Notch test', question: 'Did this card appear on the chosen display?', confirm: 'It appeared', cancel: 'It did not appear' },
};
const PREFIX = 'notch-test-';
const empty = (outcome) => ({ outcome, displayId: null, displayLabel: '' });

function createNotchTest({ manager, setTimer = setTimeout, clearTimer = clearTimeout, passiveMs = 2_500, answerMs = 20_000 }) {
  let running = false;
  let sequence = 0;
  let pending = null;
  const wait = (ms) => new Promise((resolve) => { setTimer(resolve, ms); });
  const awaitAnswer = (requestId) => new Promise((resolve) => {
    const timer = setTimer(() => {
      if (pending?.requestId !== requestId) return;
      pending = null;
      // `hide` recusa um id que já não é o ativo: outra apresentação tomou o lugar.
      resolve(manager.hide(requestId) ? 'timeout' : 'interrupted');
    }, answerMs);
    pending = { requestId, resolve, timer };
  });

  function handleAction(action) {
    if (typeof action?.requestId !== 'string' || !action.requestId.startsWith(PREFIX)) return false;
    if (pending?.requestId === action.requestId) {
      const current = pending;
      pending = null;
      clearTimer(current.timer);
      current.resolve(action.actionId === 'confirm' ? 'confirmed' : 'declined');
    }
    return true;
  }

  async function run(locale) {
    // Nunca tampa uma confirmação real que ainda espera resposta.
    if (running || manager.activeInteractive) return empty('busy');
    running = true;
    try {
      const texts = TEXTS[locale] ?? TEXTS.pt;
      const described = manager.describeDisplays();
      const target = described.displays.find((display) => display.id === described.resolvedDisplayId);
      const result = (outcome) => ({ outcome, displayId: target?.id ?? null, displayLabel: target?.label ?? '' });
      sequence += 1;
      const passiveId = `${PREFIX}passive-${sequence}`;
      manager.show({ requestId: passiveId, kind: 'result', text: texts.passive, actions: [], interaction: 'passthrough' });
      await wait(passiveMs);
      if (!manager.hide(passiveId)) return result('interrupted');
      const confirmId = `${PREFIX}confirm-${sequence}`;
      const answer = awaitAnswer(confirmId);
      manager.show({ requestId: confirmId, kind: 'confirmation', text: texts.question, actions: [{ id: 'confirm', label: texts.confirm }, { id: 'cancel', label: texts.cancel }], interaction: 'capture' });
      return result(await answer);
    } catch {
      pending = null;
      return empty('failed');
    } finally {
      running = false;
    }
  }

  return { run, handleAction };
}

module.exports = { createNotchTest };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test electron/notch-test.test.cjs`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/notch-test.cjs electron/notch-test.test.cjs
git commit -m "feat(notch): run a passive card and a confirmation as a notch test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Tipos, textos e funções puras da tela

**Files:**
- Create: `src/ui/notch-display.ts`
- Modify: `src/i18n/dictionary.ts`
- Test: `src/ui/__tests__/notch-display.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/ui/__tests__/notch-display.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { translate, type DictionaryKey } from '../../i18n/dictionary';
import { disconnectedPreference, notchDisplayOptions, notchTestMessage, selectedNotchValue, type NotchDisplay, type NotchDisplayState } from '../notch-display';

const pt = (key: DictionaryKey) => translate('pt', key);
const en = (key: DictionaryKey) => translate('en', key);
const internal: NotchDisplay = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1512, height: 982 };
const lg: NotchDisplay = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };

describe('opções do monitor do notch', () => {
  it('automático mostra o monitor resolvido e cada monitor ganha seus sufixos', () => {
    const state: NotchDisplayState = { preference: { displayId: null, displayLabel: '' }, resolvedDisplayId: 1, reason: 'camera-housing', displays: [lg, internal] };
    expect(selectedNotchValue(state)).toBe('auto');
    expect(disconnectedPreference(state)).toBe(false);
    expect(notchDisplayOptions(state, pt)).toEqual([
      { value: 'auto', label: 'Automático · Color LCD', disabled: false },
      { value: '2', label: 'LG ULTRAWIDE · principal', disabled: false },
      { value: '1', label: 'Color LCD · com notch', disabled: false },
    ]);
    expect(notchDisplayOptions(state, en)[1]).toEqual({ value: '2', label: 'LG ULTRAWIDE · primary', disabled: false });
  });

  it('preferência desconectada vira opção desabilitada e selecionada', () => {
    const state: NotchDisplayState = { preference: { displayId: 9, displayLabel: 'Studio Display' }, resolvedDisplayId: 1, reason: 'camera-housing', displays: [internal] };
    expect(disconnectedPreference(state)).toBe(true);
    expect(selectedNotchValue(state)).toBe('9');
    expect(notchDisplayOptions(state, pt).at(-1)).toEqual({ value: '9', label: 'Studio Display · desconectado', disabled: true });
  });

  it('preferência desconectada sem rótulo usa "monitor desconhecido"', () => {
    const state: NotchDisplayState = { preference: { displayId: 9, displayLabel: '' }, resolvedDisplayId: 1, reason: 'camera-housing', displays: [internal] };
    expect(notchDisplayOptions(state, pt).at(-1)?.label).toBe('monitor desconhecido · desconectado');
  });
});

describe('mensagem do teste do notch', () => {
  it('traz o monitor nas mensagens que dependem dele, em pt e en', () => {
    expect(notchTestMessage({ outcome: 'confirmed', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, pt)).toBe('Confirmado pelo notch em LG ULTRAWIDE.');
    expect(notchTestMessage({ outcome: 'declined', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, pt)).toBe('Você indicou que o cartão não apareceu em LG ULTRAWIDE.');
    expect(notchTestMessage({ outcome: 'timeout', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, en)).toBe('No answer in 20 s. The card may not have appeared on LG ULTRAWIDE.');
    expect(notchTestMessage({ outcome: 'declined', displayId: 1, displayLabel: '' }, pt)).toBe('Você indicou que o cartão não apareceu em monitor desconhecido.');
  });

  it('usa as mensagens fixas de ocupado, interrompido e falha', () => {
    expect(notchTestMessage({ outcome: 'busy', displayId: null, displayLabel: '' }, pt)).toBe('Há uma confirmação pendente no notch. Responda a ela e teste de novo.');
    expect(notchTestMessage({ outcome: 'interrupted', displayId: 2, displayLabel: 'LG ULTRAWIDE' }, pt)).toBe('O teste foi interrompido por outro aviso do Taby.');
    expect(notchTestMessage({ outcome: 'failed', displayId: null, displayLabel: '' }, en)).toBe('Could not show the test in the notch.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk proxy npx vitest run src/ui/__tests__/notch-display.test.ts`
Expected: FAIL — `Failed to resolve import "../notch-display"`.

- [ ] **Step 3: Implementar os textos**

Em `src/i18n/dictionary.ts`, logo depois de `'settings.theme.dark': 'Escuro',` (dentro de `pt`):

```ts
  'settings.notch.title': 'Monitor do notch',
  'settings.notch.detail': 'Onde o Taby aparece',
  'settings.notch.auto': 'Automático',
  'settings.notch.withNotch': 'com notch',
  'settings.notch.primary': 'principal',
  'settings.notch.disconnected': 'desconectado',
  'settings.notch.unknownDisplay': 'monitor desconhecido',
  'settings.notch.fallback': 'O notch usa {display} até ele voltar.',
  'settings.notch.saveFailed': 'Não foi possível trocar o monitor do notch.',
  'settings.notch.desktopOnly': 'Disponível no app desktop.',
  'settings.notch.test.title': 'Teste do notch',
  'settings.notch.test.detail': 'Mostra um cartão e uma confirmação no monitor escolhido',
  'settings.notch.test.button': 'Testar notch',
  'settings.notch.test.running': 'Testando…',
  'settings.notch.result.confirmed': 'Confirmado pelo notch em {display}.',
  'settings.notch.result.declined': 'Você indicou que o cartão não apareceu em {display}.',
  'settings.notch.result.timeout': 'Sem resposta em 20 s. O cartão pode não ter aparecido em {display}.',
  'settings.notch.result.busy': 'Há uma confirmação pendente no notch. Responda a ela e teste de novo.',
  'settings.notch.result.interrupted': 'O teste foi interrompido por outro aviso do Taby.',
  'settings.notch.result.failed': 'Não foi possível mostrar o teste no notch.',
```

E logo depois de `'settings.theme.dark': 'Dark',` (dentro de `en`):

```ts
  'settings.notch.title': 'Notch display',
  'settings.notch.detail': 'Where Taby appears',
  'settings.notch.auto': 'Automatic',
  'settings.notch.withNotch': 'with notch',
  'settings.notch.primary': 'primary',
  'settings.notch.disconnected': 'disconnected',
  'settings.notch.unknownDisplay': 'unknown display',
  'settings.notch.fallback': 'The notch uses {display} until it comes back.',
  'settings.notch.saveFailed': 'Could not change the notch display.',
  'settings.notch.desktopOnly': 'Available in the desktop app.',
  'settings.notch.test.title': 'Notch test',
  'settings.notch.test.detail': 'Shows a card and a confirmation on the chosen display',
  'settings.notch.test.button': 'Test notch',
  'settings.notch.test.running': 'Testing…',
  'settings.notch.result.confirmed': 'Confirmed through the notch on {display}.',
  'settings.notch.result.declined': 'You said the card did not appear on {display}.',
  'settings.notch.result.timeout': 'No answer in 20 s. The card may not have appeared on {display}.',
  'settings.notch.result.busy': 'A confirmation is waiting in the notch. Answer it and test again.',
  'settings.notch.result.interrupted': 'Another Taby notice interrupted the test.',
  'settings.notch.result.failed': 'Could not show the test in the notch.',
```

- [ ] **Step 4: Implementar as funções puras**

Crie `src/ui/notch-display.ts`:

```ts
import type { DictionaryKey } from '../i18n/dictionary';

export type NotchDisplay = Readonly<{ id: number; label: string; primary: boolean; internal: boolean; hasCameraHousing: boolean; width: number; height: number }>;
export type NotchDisplayState = Readonly<{
  preference: Readonly<{ displayId: number | null; displayLabel: string }>;
  resolvedDisplayId: number;
  reason: 'preferred' | 'camera-housing' | 'primary';
  displays: readonly NotchDisplay[];
}>;
export type NotchTestOutcome = 'confirmed' | 'declined' | 'timeout' | 'busy' | 'interrupted' | 'failed';
export type NotchTestResult = Readonly<{ outcome: NotchTestOutcome; displayId: number | null; displayLabel: string }>;
export type NotchDisplayOption = Readonly<{ value: string; label: string; disabled: boolean }>;
type Translate = (key: DictionaryKey) => string;

export const AUTO_NOTCH_VALUE = 'auto';

const RESULT_KEYS: Record<NotchTestOutcome, DictionaryKey> = {
  confirmed: 'settings.notch.result.confirmed',
  declined: 'settings.notch.result.declined',
  timeout: 'settings.notch.result.timeout',
  busy: 'settings.notch.result.busy',
  interrupted: 'settings.notch.result.interrupted',
  failed: 'settings.notch.result.failed',
};

export const disconnectedPreference = (state: NotchDisplayState): boolean =>
  state.preference.displayId !== null && !state.displays.some((display) => display.id === state.preference.displayId);

export const selectedNotchValue = (state: NotchDisplayState): string =>
  state.preference.displayId === null ? AUTO_NOTCH_VALUE : String(state.preference.displayId);

export const resolvedNotchDisplay = (state: NotchDisplayState): NotchDisplay | undefined =>
  state.displays.find((display) => display.id === state.resolvedDisplayId);

export function notchDisplayOptions(state: NotchDisplayState, t: Translate): NotchDisplayOption[] {
  const resolved = resolvedNotchDisplay(state);
  const options: NotchDisplayOption[] = [
    { value: AUTO_NOTCH_VALUE, label: resolved ? `${t('settings.notch.auto')} · ${resolved.label}` : t('settings.notch.auto'), disabled: false },
    ...state.displays.map((display) => ({
      value: String(display.id),
      label: [display.label, display.hasCameraHousing ? t('settings.notch.withNotch') : null, display.primary ? t('settings.notch.primary') : null].filter(Boolean).join(' · '),
      disabled: false,
    })),
  ];
  if (disconnectedPreference(state)) {
    options.push({ value: String(state.preference.displayId), label: `${state.preference.displayLabel || t('settings.notch.unknownDisplay')} · ${t('settings.notch.disconnected')}`, disabled: true });
  }
  return options;
}

export const notchTestMessage = (result: NotchTestResult, t: Translate): string =>
  t(RESULT_KEYS[result.outcome]).replace('{display}', result.displayLabel || t('settings.notch.unknownDisplay'));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `rtk proxy npx vitest run src/ui/__tests__/notch-display.test.ts`
Expected: PASS (5 testes). Depois `npx tsc --noEmit` sem erros (a tipagem de `en` exige todas as chaves).

- [ ] **Step 6: Commit**

```bash
git add src/ui/notch-display.ts src/ui/__tests__/notch-display.test.ts src/i18n/dictionary.ts
git commit -m "feat(settings): add notch display options and test messages

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Processo principal, ponte e tipos

**Files:**
- Modify: `electron/main.cjs`, `electron/preload.cjs`, `src/global.d.ts`
- Test: `electron/navigation-policy.test.cjs`

- [ ] **Step 1: Escrever o teste que falha**

Em `electron/navigation-policy.test.cjs`, logo depois do teste que termina com
`assert.deepEqual(removed.map(([event]) => event), ['display-added', 'display-removed', 'display-metrics-changed', 'resume']);` e `});`, acrescente:

```js
test('avisa a janela principal quando um monitor entra, sai ou muda, depois de reposicionar, e não ao acordar', () => {
  const registered = [];
  const eventSource = { on: (event, listener) => registered.push([event, listener]), removeListener: () => {} };
  const order = [];
  attachNotchLifecycle({ displayService: eventSource, powerService: eventSource, manager: { reposition: () => order.push('reposition') }, onDisplaysChanged: () => order.push('changed') });

  for (const [event, listener] of registered) { order.push(event); listener(); }

  assert.deepEqual(order, ['display-added', 'reposition', 'changed', 'display-removed', 'reposition', 'changed', 'display-metrics-changed', 'reposition', 'changed', 'resume', 'reposition']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test electron/navigation-policy.test.cjs`
Expected: FAIL — a ordem não tem `'changed'`.

- [ ] **Step 3: Implementar o ciclo de vida**

Em `electron/main.cjs`, troque `attachNotchLifecycle` por:

```js
function attachNotchLifecycle({ displayService, powerService, manager, onDisplaysChanged }) {
  const reposition = () => manager?.reposition();
  const displaysChanged = () => { reposition(); onDisplaysChanged?.(); };
  const displayEvents = ['display-added', 'display-removed', 'display-metrics-changed'];
  for (const event of displayEvents) displayService?.on?.(event, displaysChanged);
  powerService?.on?.('resume', reposition);
  return () => {
    for (const event of displayEvents) displayService?.removeListener?.(event, displaysChanged);
    powerService?.removeListener?.('resume', reposition);
  };
}
```

Run: `node --test electron/navigation-policy.test.cjs`
Expected: PASS.

- [ ] **Step 4: Ligar preferência, teste e IPC no `main.cjs`**

1. Depois de `const { createNotchWindowManager } = require("./notch-window.cjs");`:

```js
const { createNotchSettings, notchDisplayState, applyNotchDisplay } = require('./notch-settings.cjs');
const { createNotchTest } = require('./notch-test.cjs');
```

2. Depois de `let notchWindow;`:

```js
let notchSettings;
let notchTest;
```

3. Troque a linha que cria `notchWindow` e a linha seguinte (`detachNotchLifecycle = ...`) por:

```js
  notchSettings = createNotchSettings({ filePath: path.join(app.getPath('userData'), 'notch-settings.json') });
  // As respostas do teste do notch ficam no processo principal e nunca chegam ao renderer.
  notchWindow = createNotchWindowManager({ BrowserWindowClass: BrowserWindow, screen, preloadPath: path.join(__dirname, 'preload.cjs'), nativeBridge: notchAdapter, preferredDisplayId: notchSettings.get().displayId, load: (window) => isDev ? window.loadURL(`${new URL(process.env.HIBI_DEV_SERVER || 'http://127.0.0.1:5173')}?overlay=notch`) : window.loadFile(path.join(__dirname, '../dist/index.html'), { query: { overlay: 'notch' } }), onAction: (action) => { if (notchTest?.handleAction(action)) return; mainWindow?.webContents.send('hibi:companion:action', action); } });
  notchTest = createNotchTest({ manager: notchWindow });
  detachNotchLifecycle = attachNotchLifecycle({ displayService: screen, powerService: powerMonitor, manager: notchWindow, onDisplaysChanged: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hibi:notch:displays-changed'); } });
```

4. Depois de `ipcMain.handle('hibi:notch:capabilities', ...);`:

```js
  ipcMain.handle('hibi:notch:displays', () => notchDisplayState(notchSettings, notchWindow));
  ipcMain.handle('hibi:notch:set-display', (_event, displayId) => applyNotchDisplay(notchSettings, notchWindow, displayId));
  ipcMain.handle('hibi:notch:test', (_event, locale) => notchTest.run(locale === 'en' ? 'en' : 'pt'));
```

- [ ] **Step 5: Ponte e tipos**

Em `electron/preload.cjs`, depois de `,getNotchCapabilities: () => ipcRenderer.invoke('hibi:notch:capabilities')`:

```js
  ,listNotchDisplays: () => ipcRenderer.invoke('hibi:notch:displays')
  ,setNotchDisplay: (displayId) => ipcRenderer.invoke('hibi:notch:set-display', displayId)
  ,testNotch: (locale) => ipcRenderer.invoke('hibi:notch:test', locale)
  ,onNotchDisplaysChanged: (callback) => { const listener = () => callback(); ipcRenderer.on('hibi:notch:displays-changed', listener); return () => ipcRenderer.removeListener('hibi:notch:displays-changed', listener); }
```

Em `src/global.d.ts`, junto dos outros `import type` do topo:

```ts
import type { NotchDisplayState, NotchTestResult } from './ui/notch-display';
```

E depois da linha `getNotchCapabilities?: ...;`:

```ts
      listNotchDisplays?: () => Promise<NotchDisplayState>;
      setNotchDisplay?: (displayId: number | null) => Promise<NotchDisplayState>;
      testNotch?: (locale: 'pt' | 'en') => Promise<NotchTestResult>;
      onNotchDisplaysChanged?: (callback: () => void) => () => void;
```

- [ ] **Step 6: Verificar**

Run: `node --test electron/*.test.cjs && npx tsc --noEmit && node --check electron/preload.cjs && node --check electron/main.cjs`
Expected: testes PASS, `tsc` sem erros e as duas checagens de sintaxe sem saída.

Run: `node scripts/renderer-safety-check.mjs`
Expected: o mesmo resultado de antes desta branch — 2 ocorrências em `src/global.d.ts`. Se o número subir, ajuste as linhas novas até voltar a 2.

- [ ] **Step 7: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/global.d.ts electron/navigation-policy.test.cjs
git commit -m "feat(notch): expose display selection and the notch test over IPC

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Tela nas Configurações e e2e

**Files:**
- Create: `src/ui/NotchDisplaySettings.tsx`, `tests/e2e/notch-display.spec.ts`
- Modify: `src/ui/SettingsView.tsx`

- [ ] **Step 1: Escrever o e2e que falha**

Crie `tests/e2e/notch-display.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const dock = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
const openSettings = async (page: Page) => {
  await dock(page).getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
};
type Recorded = { setDisplay: (number | null)[]; tests: string[] };
const readRecorded = (page: Page) => page.evaluate(() => (window as unknown as { hibiE2E: { recorded: Recorded } }).hibiE2E.recorded);

async function installBridge(page: Page) {
  await page.addInitScript(() => {
    const internal = { id: 1, label: 'Color LCD', primary: false, internal: true, hasCameraHousing: true, width: 1512, height: 982 };
    const lg = { id: 2, label: 'LG ULTRAWIDE', primary: true, internal: false, hasCameraHousing: false, width: 2560, height: 1080 };
    let displays = [lg, internal];
    let preference: { displayId: number | null; displayLabel: string } = { displayId: null, displayLabel: '' };
    let changed: (() => void) | null = null;
    const recorded = { setDisplay: [] as (number | null)[], tests: [] as string[] };
    // Mesmas regras do processo principal: preferido conectado, tela com câmera, principal.
    const state = () => {
      const preferred = displays.find((display) => display.id === preference.displayId);
      const resolved = preferred ?? displays.find((display) => display.hasCameraHousing) ?? displays.find((display) => display.primary)!;
      return { preference, resolvedDisplayId: resolved.id, reason: preferred ? 'preferred' : resolved.hasCameraHousing ? 'camera-housing' : 'primary', displays };
    };
    (window as unknown as { hibiE2E: unknown }).hibiE2E = {
      recorded,
      disconnectInternal() { displays = [lg]; changed?.(); },
    };
    (window as unknown as { hibiDesktop: Record<string, unknown> }).hibiDesktop = {
      info: async () => ({ name: 'Hibi', version: '0.1.0', localOnly: true }),
      listNotchDisplays: async () => state(),
      setNotchDisplay: async (displayId: number | null) => {
        recorded.setDisplay.push(displayId);
        const target = displays.find((display) => display.id === displayId);
        preference = target ? { displayId: target.id, displayLabel: target.label } : { displayId: null, displayLabel: '' };
        return state();
      },
      testNotch: async (locale: string) => {
        recorded.tests.push(locale);
        const current = state();
        const target = current.displays.find((display) => display.id === current.resolvedDisplayId)!;
        return { outcome: 'confirmed', displayId: target.id, displayLabel: target.label };
      },
      onNotchDisplaysChanged: (callback: () => void) => { changed = callback; return () => { changed = null; }; },
    };
  });
}

test.beforeEach(async ({ page }) => {
  await installBridge(page);
  await page.goto('/');
  await expect(dock(page)).toBeVisible();
  await openSettings(page);
});

test('Ajustes › Geral lista os monitores e troca o monitor do notch', async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Monitor do notch' });
  await expect(select.locator('option')).toHaveText(['Automático · Color LCD', 'LG ULTRAWIDE · principal', 'Color LCD · com notch']);
  await expect(select).toHaveValue('auto');

  await select.selectOption('2');

  await expect(select).toHaveValue('2');
  await expect(select.locator('option').first()).toHaveText('Automático · LG ULTRAWIDE');
  expect((await readRecorded(page)).setDisplay).toEqual([2]);
});

test('"Testar notch" mostra o resultado com o monitor usado', async ({ page }) => {
  await page.getByRole('button', { name: 'Testar notch' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Confirmado pelo notch em Color LCD.' })).toBeVisible();
  expect((await readRecorded(page)).tests).toEqual(['pt']);
});

test('um monitor escolhido que sai aparece como desconectado, com o monitor em uso', async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Monitor do notch' });
  await select.selectOption('1');
  await expect(select).toHaveValue('1');

  await page.evaluate(() => (window as unknown as { hibiE2E: { disconnectInternal: () => void } }).hibiE2E.disconnectInternal());

  await expect(select.locator('option')).toHaveText(['Automático · LG ULTRAWIDE', 'LG ULTRAWIDE · principal', 'Color LCD · desconectado']);
  await expect(select).toHaveValue('1');
  await expect(page.getByText('O notch usa LG ULTRAWIDE até ele voltar.')).toBeVisible();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk proxy npx playwright test tests/e2e/notch-display.spec.ts`
Expected: FAIL — o combobox "Monitor do notch" não existe.

- [ ] **Step 3: Implementar o componente**

Crie `src/ui/NotchDisplaySettings.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { AUTO_NOTCH_VALUE, disconnectedPreference, notchDisplayOptions, notchTestMessage, resolvedNotchDisplay, selectedNotchValue, type NotchDisplayState } from './notch-display';

type Props = { onEvent: (action: string, detail: string, result?: string) => void };

// Mesma marcação de `Setting` em SettingsView, sem importar de lá para não criar ciclo.
function Row({ title, detail, note, children }: { title: string; detail: string; note?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{detail}</span>{note && <span>{note}</span>}</div>{children}</div>;
}

export function NotchDisplaySettings({ onEvent }: Props) {
  const t = useT();
  const { language } = useLocale();
  const [state, setState] = useState<NotchDisplayState | null>(null);
  const [available, setAvailable] = useState(true);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const bridge = window.hibiDesktop;
    const list = bridge?.listNotchDisplays;
    if (!list) { setAvailable(false); return undefined; }
    let active = true;
    const refresh = () => { void list().then((next) => { if (active) setState(next); }).catch(() => { if (active) setAvailable(false); }); };
    refresh();
    const unsubscribe = bridge.onNotchDisplaysChanged?.(refresh) ?? (() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);

  if (!available) return <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')}><span className="setting-value">{t('settings.notch.desktopOnly')}</span></Row>;

  const choose = async (value: string) => {
    const setDisplay = window.hibiDesktop?.setNotchDisplay;
    if (!setDisplay) return;
    try {
      setState(await setDisplay(value === AUTO_NOTCH_VALUE ? null : Number(value)));
      setNotice('');
      onEvent('edit', 'Notch display', value);
    } catch { setNotice(t('settings.notch.saveFailed')); }
  };
  const runTest = async () => {
    const testNotch = window.hibiDesktop?.testNotch;
    if (!testNotch) return;
    setTesting(true);
    setNotice('');
    try {
      const result = await testNotch(language);
      setNotice(notchTestMessage(result, t));
      onEvent('test', 'Notch', result.outcome);
    } catch {
      setNotice(t('settings.notch.result.failed'));
      onEvent('test', 'Notch', 'failed');
    } finally { setTesting(false); }
  };

  const options = state ? notchDisplayOptions(state, t) : [{ value: AUTO_NOTCH_VALUE, label: t('settings.notch.auto'), disabled: false }];
  const fallback = state && disconnectedPreference(state) ? t('settings.notch.fallback').replace('{display}', resolvedNotchDisplay(state)?.label ?? t('settings.notch.unknownDisplay')) : undefined;
  return <>
    <Row title={t('settings.notch.title')} detail={t('settings.notch.detail')} note={fallback}>
      <select aria-label={t('settings.notch.title')} disabled={!state} value={state ? selectedNotchValue(state) : AUTO_NOTCH_VALUE} onChange={(event) => void choose(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    </Row>
    <Row title={t('settings.notch.test.title')} detail={t('settings.notch.test.detail')}>
      <div>
        <button className="outline" disabled={testing || !state} onClick={() => void runTest()}>{testing ? t('settings.notch.test.running') : t('settings.notch.test.button')}</button>
        <p className="muted" role="status" aria-live="polite" style={{ margin: '8px 0 0' }}>{notice}</p>
      </div>
    </Row>
  </>;
}
```

- [ ] **Step 4: Montar na aba Geral**

Em `src/ui/SettingsView.tsx`:

1. Depois de `import { IntegrationsView } from './IntegrationsView';`:

```tsx
import { NotchDisplaySettings } from './NotchDisplaySettings';
```

2. Troque o trecho exato

```tsx
{launchNotice && <p className="muted" aria-live="polite" style={{ margin: '8px 0 0' }}>{launchNotice}</p>}</Setting></>}
```

por

```tsx
{launchNotice && <p className="muted" aria-live="polite" style={{ margin: '8px 0 0' }}>{launchNotice}</p>}</Setting><NotchDisplaySettings onEvent={onEvent} /></>}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `rtk proxy npx playwright test tests/e2e/notch-display.spec.ts`
Expected: PASS (3 testes).

Run: `rtk proxy npx vitest run src/ui/__tests__` e `npx tsc --noEmit`
Expected: PASS e sem erros. O teste `Settings notifications action` renderiza a aba Geral sem ponte: continua passando porque efeitos não rodam no `renderToStaticMarkup`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/NotchDisplaySettings.tsx src/ui/SettingsView.tsx tests/e2e/notch-display.spec.ts
git commit -m "feat(settings): choose the notch display and test the notch

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Gate completo e documentação

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`, `docs/notch-adapters.md`

- [ ] **Step 1: Gate**

Run, nesta ordem:

```bash
rtk proxy npm test
npx tsc --noEmit
npm run build
rtk proxy npx playwright test
```

Expected: tudo verde. Referência antes da branch: 312 Vitest, 135 `node --test`, 79 e2e. Esperado
agora: 317 Vitest (+5), 159 `node --test` (+3 geometria, +5 gerenciador, +6 preferência, +9 teste,
+1 ciclo de vida) e 82 e2e (+3). Registre os números reais no relatório da task.

- [ ] **Step 2: Documentação**

Em `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`, logo depois da linha da tabela que começa com `| **Notion Sync v1** |`, acrescente:

```markdown
| Monitor do notch e "Testar notch" | Implementado localmente | Configurações › Geral escolhe Automático ou um monitor; o automático é reavaliado a cada posicionamento. O teste mostra um cartão passivo e uma confirmação no monitor escolhido. Validação em `docs/notch-manual-results.md` |
```

Em `docs/notch-adapters.md`, antes de `## Manual release matrix`, acrescente:

```markdown
## Display selection

The notch display is resolved on every placement: the display chosen in Settings › General if it
is connected, otherwise the first display with a camera housing, otherwise the primary display.
The choice is stored by the main process in `notch-settings.json` under `userData`. A disconnected
choice stays saved and is used again when the same display id reconnects.

**Settings › General › Test notch** shows a passive card and then a confirmation on the resolved
display. It never replaces a pending interactive confirmation, and its answers stay in the main
process. Use it as the procedure for every row of the matrix below.
```

- [ ] **Step 3: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS_AND_PLAN.md docs/notch-adapters.md
git commit -m "docs: record notch display selection and the notch test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Validação no app real com o monitor externo (controlador)

Feita por quem coordena, não por subagente: usa o app Electron real, as telas físicas e os dados
do app nesta máquina.

**Files:**
- Create: `scripts/notch-display-live.mjs` — versão final do roteiro abaixo, versionada. Além do
  rascunho, move a janela principal do Hibi para cada tela antes de testar (a revisão da Task 2
  achou a conversão nativa de coordenadas presa à tela com foco, corrigida em `7e5e267`) e captura
  o cartão passivo e a confirmação.
- Modify: `docs/notch-manual-results.md`

- [ ] **Step 1: Conferir as telas**

Run: `system_profiler SPDisplaysDataType | grep -E "^\s{8}[A-Za-z].*:$|Main Display|Connection Type"`
Expected: `LG ULTRAWIDE` com `Main Display: Yes` e `Color LCD` interno.

- [ ] **Step 2: Build de produção**

Run: `npm run build`

- [ ] **Step 3: Escrever o roteiro**

`<scratchpad>/notch-display-live.mjs`:

```js
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const root = '/Volumes/Games/Projetos/Hibi/Hibi/.worktrees/notch-display';
const shots = process.argv[2];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const launch = () => electron.launch({ cwd: root, args: ['electron/main.cjs'], env: { ...process.env, HIBI_PRODUCTION: '1' } });
const snapshot = (app) => app.evaluate(({ BrowserWindow, screen }) => ({
  displays: screen.getAllDisplays().map((display) => ({ id: display.id, label: display.label, bounds: display.bounds })),
  windows: BrowserWindow.getAllWindows().map((window) => ({ url: window.webContents.getURL(), bounds: window.getBounds(), visible: window.isVisible() })),
}));
const inside = (bounds, area) => bounds.x >= area.x && bounds.x + bounds.width <= area.x + area.width && bounds.y >= area.y && bounds.y < area.y + area.height;

async function openGeneral(app) {
  const page = await app.firstWindow();
  const dock = page.getByRole('navigation', { name: 'Navegação principal' });
  await dock.waitFor();
  await dock.getByRole('button', { name: 'Mais seções' }).click();
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Monitor do notch' }).waitFor();
  return page;
}
async function overlay(app) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = app.windows().find((window) => window.url().includes('overlay=notch'));
    if (found) return found;
    await sleep(100);
  }
  throw new Error('overlay do notch não apareceu');
}
// A troca é assíncrona (IPC): espera o processo principal refletir a escolha antes de testar.
async function choose(page, value) {
  await page.getByRole('combobox', { name: 'Monitor do notch' }).selectOption(value);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await page.evaluate(() => window.hibiDesktop.listNotchDisplays());
    if ((state.preference.displayId === null ? 'auto' : String(state.preference.displayId)) === value) return state;
    await sleep(100);
  }
  throw new Error(`a escolha ${value} não foi aplicada`);
}
async function runTest(app, page, value, tag) {
  const state = await choose(page, value);
  const target = state.displays.find((display) => display.id === state.resolvedDisplayId);
  await page.getByRole('button', { name: 'Testar notch' }).click();
  await sleep(900);
  const passiveHost = (await page.evaluate(() => window.hibiDesktop.getNotchCapabilities())).host;
  const card = await overlay(app);
  const appeared = card.getByRole('button', { name: 'Apareceu' });
  await appeared.waitFor({ timeout: 10_000 });
  const confirmation = await snapshot(app);
  const confirmationWindow = confirmation.windows.find((window) => window.url.includes('overlay=notch') && window.visible);
  const display = confirmation.displays.find((entry) => entry.id === target.id);
  let screenshot = 'não capturada';
  try {
    const index = confirmation.displays.findIndex((entry) => entry.id === target.id) + 1;
    execFileSync('screencapture', ['-x', `-D${index}`, `${shots}/notch-${tag}.png`]);
    screenshot = `${shots}/notch-${tag}.png`;
  } catch (error) { screenshot = `falhou: ${String(error.message).slice(0, 80)}`; }
  await appeared.click();
  const status = page.getByRole('status').filter({ hasText: 'Confirmado pelo notch em' });
  await status.waitFor({ timeout: 10_000 });
  return {
    tag,
    resolved: { id: target.id, label: target.label, reason: state.reason },
    passiveHost,
    confirmationInside: Boolean(confirmationWindow && display && inside(confirmationWindow.bounds, display.bounds)),
    confirmationBounds: confirmationWindow?.bounds ?? null,
    displayBounds: display?.bounds ?? null,
    message: await status.textContent(),
    screenshot,
  };
}

const report = {};
let app = await launch();
let page = await openGeneral(app);
const initial = await page.evaluate(() => window.hibiDesktop.listNotchDisplays());
report.initial = initial;
const lg = initial.displays.find((display) => display.label.includes('LG'));
const builtIn = initial.displays.find((display) => display.hasCameraHousing);
report.runs = [];
report.runs.push(await runTest(app, page, 'auto', 'auto'));
report.runs.push(await runTest(app, page, String(lg.id), 'lg'));
report.runs.push(await runTest(app, page, String(builtIn.id), 'built-in'));
// Com o LG como principal, o automático precisa escolher a tela integrada pela câmera.
report.automaticPicksCameraHousing = report.runs[0].resolved.id === builtIn?.id && report.runs[0].resolved.reason === 'camera-housing';
await choose(page, String(lg.id));
await app.close();

app = await launch();
page = await openGeneral(app);
const afterRestart = await page.evaluate(() => window.hibiDesktop.listNotchDisplays());
report.persistsAcrossRestart = afterRestart.preference.displayId === lg.id && afterRestart.resolvedDisplayId === lg.id;
// Deixa o app como estava: automático.
report.restoredToAutomatic = (await choose(page, 'auto')).preference.displayId === null;
await app.close();
console.log(JSON.stringify(report, null, 2));
```

- [ ] **Step 4: Rodar**

Run: `node scripts/notch-display-live.mjs <scratchpad>` (a pasta das capturas fica fora do repositório)
Expected: `automaticPicksCameraHousing: true`; nos três testes `confirmationInside: true` e a mensagem
"Confirmado pelo notch em …" com o monitor certo; `passiveHost.displayId` igual ao monitor
resolvido quando o host nativo estiver ativo; `persistsAcrossRestart: true`;
`restoredToAutomatic: true`. Abra cada captura de tela e confira o cartão no topo do monitor certo.
Se a captura falhar por permissão, registre isso.

- [ ] **Step 5: Registrar**

Em `docs/notch-manual-results.md`, na tabela "Completed on this Mac", acrescente uma linha por
verificação observada (automático com o LG principal, LG escolhido, tela integrada escolhida,
persistência) com as evidências do relatório — limites da janela e do monitor, host passivo e
mensagem —, marcando `Pass (automated, real app)`. Na tabela "Still requires physical test hardware
or operator action", troque o motivo de "External monitor and reconnect" para dizer que a seleção e
o teste no LG passaram e que falta só desconectar e reconectar. Acrescente, depois das tabelas:

```markdown
## Operator procedure (Settings › General › Test notch)

1. **Reconnect:** choose the external display, run the test, unplug it — the notch must move to the
   built-in display and Settings must show the choice as disconnected — plug it back in, run the
   test again and answer **Apareceu** on the external display.
2. **Spaces:** run the test, switch Space with Control-→ while the confirmation is visible, and
   confirm the card follows.
3. **Full screen:** put any app in full screen on the chosen display and run the test.
4. **Sleep and wake:** sleep the Mac, wake it, and run the test without restarting Hibi.
5. **Human check:** for each run, confirm the card sits at the top centre of the chosen display and
   the text is readable.

Record each result in the tables above with the date and the display names.
```

- [ ] **Step 6: Commit**

```bash
git add docs/notch-manual-results.md scripts/notch-display-live.mjs
git commit -m "docs: record notch display validation on the external monitor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
