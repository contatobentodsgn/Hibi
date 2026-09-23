# Pixano

Aplicativo desktop local para organizar tarefas, blocos de agenda e lembretes.

## Uso

```bash
npm install
npm run desktop
```

O modo de desenvolvimento abre o Electron e o renderer juntos. Para validar a base:

```bash
npm test
npm run build
```

Os dados são locais e persistem no armazenamento do aplicativo. A paleta `/` (ou `⌘K`) navega entre as seções; tarefas, lembretes e blocos podem ser criados, editados, pausados, concluídos e removidos.
