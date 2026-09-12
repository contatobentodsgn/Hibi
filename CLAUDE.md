# CLAUDE.md

@AGENTS.md

## Específico desta sessão (Claude Code)

- Você é o **Claude** do `AGENTS.md`: seu território é `electron/`, `native/`, `src/data/` e `scripts/`, o contrato do IPC, `package.json`, `ci.yml` e o documento de status.
- **Nunca remova worktree nem apague branch com prefixo `codex/`.** O Codex trabalha em paralelo, num clone próprio.
- `rtk`:
  - use `rtk proxy git diff`, porque sem ele o hook reescreve a saída e o `grep` não acha nada;
  - **não** rode `npm run build` via `rtk proxy`, porque o wrapper manda SIGTERM ao npm depois do build nativo;
  - para números de teste reais, use `rtk proxy` ou rode direto, já que o `rtk` pode devolver saída cacheada.
- Scripts com heredoc dentro de `$(...)` quebram o parser do zsh: grave o corpo em arquivo e rode com `bash`.
- Ao revisar o PR do Codex, confira se ele respeitou os territórios e o protocolo dos arquivos compartilhados antes de mergear.
