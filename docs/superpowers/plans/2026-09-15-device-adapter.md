# Adaptador de dispositivo físico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um contrato de dispositivo seguro e testável, pronto para um protocolo físico futuro sem ativar hardware inexistente.

**Architecture:** Um adaptador de transporte mockável valida handshake e mensagens; o processo principal publica somente capacidades saneadas. O pacote de ajustes existente continua sendo a única entrada de configuração.

**Tech Stack:** Electron, TypeScript/ESM, Node tests, React settings UI.

---

### Task 1: Contrato do transporte

**Files:**
- Create: `electron/device-transport.mjs`
- Test: `electron/device-transport.test.mjs`

- [ ] Testar handshake, versão incompatível, timeout, desconexão e cancelamento com transporte mock.
- [ ] Implementar `createDeviceTransport` com mensagens JSON limitadas, timeout de 2 segundos e encerramento idempotente.
- [ ] Rodar `node --test electron/device-transport.test.mjs`.

### Task 2: Adaptador e capacidades

**Files:**
- Create: `electron/device-adapter.mjs`
- Test: `electron/device-adapter.test.mjs`
- Modify: `electron/device-settings.mjs`

- [ ] Testar que o adaptador permanece `unavailable` sem transporte autorizado e aceita somente o schema `hibi.device-settings`.
- [ ] Implementar handshake, leitura de capacidades, envio do pacote existente e reconexão sem duplicar comandos.
- [ ] Rodar `node --test electron/device-adapter.test.mjs`.

### Task 3: Integração na UI

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Modify: `src/ui/AvailabilityView.tsx`
- Test: `electron/main.test.cjs`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] Expor somente diagnóstico e capacidade, nunca transporte bruto ou caminho do dispositivo.
- [ ] Mostrar estado indisponível, firmware e capacidades quando houver mock autorizado.
- [ ] Testar paleta, tela Hardware, desconexão e que o app funciona sem hardware.
- [ ] Rodar `node --test electron/main.test.cjs`, `npx tsc --noEmit` e e2e direcionado.

### Task 4: Protocolo físico e aceite

**Files:**
- Modify: `docs/notch-manual-test-plan.md`
- Modify: `docs/release-readiness.md`
- Create: `docs/device-protocol-checklist.md`

- [ ] Registrar campos obrigatórios do protocolo, identificação do firmware, permissões e comportamento de falha.
- [ ] Adicionar roteiro de laboratório para conexão, reconexão, perda de energia e atualização de configuração.
- [ ] Marcar testes físicos como pendentes até hardware e protocolo reais serem fornecidos; não usar o mock como evidência física.
