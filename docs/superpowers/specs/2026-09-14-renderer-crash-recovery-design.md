# Renderer crash recovery

## Objetivo

Recuperar automaticamente uma falha do renderer Electron uma única vez e informar
claramente a pessoa usuária quando uma nova falha ocorrer, sem criar um loop de
reload nem expor dados sensíveis.

## Comportamento

1. O processo principal observa o evento `render-process-gone` da janela principal.
2. Para uma falha elegível, registra um diagnóstico local sanitizado contendo
   somente motivo, timestamp e identificação estável da janela.
3. Se a janela ainda não tiver sido recuperada nesta sessão de carregamento, chama
   `webContents.reload()` uma única vez e marca a tentativa como usada.
4. O guard de recuperação é resetado somente depois de um carregamento concluído.
5. Se o renderer falhar novamente antes de um carregamento concluído, não há novo
   reload automático. O renderer recebe uma mensagem de estado recuperável quando
   possível; caso contrário, a janela de erro do processo principal oferece a
   opção de tentar manualmente ou encerrar.
6. Uma tentativa manual inicia um novo ciclo com o mesmo limite de uma recuperação
   automática; encerrar não altera dados do workspace.

## Segurança e privacidade

- O diagnóstico não inclui conteúdo de páginas, conversas, URLs, credenciais,
  argumentos de processo ou texto digitado.
- O guard é mantido em memória no processo principal e não é exportado no backup.
- Falhas do renderer não devem derrubar o processo principal nem executar ações,
  sincronizações ou mutações pendentes.
- O fluxo respeita a ponte existente e não adiciona permissões, canais ou acesso
  nativo ao renderer.

## Interfaces e fluxo de dados

O handler do processo principal transforma `render-process-gone` em um estado
sanitizado de recuperação. A interface existente exibe o aviso de recuperação
como uma superfície transitória, com ações acessíveis de tentar novamente e
encerrar. O workspace será restaurado pelo mecanismo atual; não haverá um segundo
formato de persistência.

## Testes

- Teste Node: a primeira falha chama `reload` uma vez.
- Teste Node: um reload concluído permite uma nova recuperação posterior.
- Teste Node: uma segunda falha antes da conclusão não chama `reload` novamente.
- Teste Node: o diagnóstico não contém conteúdo sensível nem argumentos livres.
- Teste E2E: o aviso é acessível e as ações de tentar novamente/encerrar são
  operáveis por teclado.
- Os testes de mutação devem falhar quando o guard for removido ou quando a
  segunda falha voltar a recarregar automaticamente.

## Fora do escopo

- Recuperação de crash do processo principal.
- Envio remoto de crash reports.
- Telemetria remota.
- Alteração do formato de backup ou do armazenamento do workspace.
- Recuperação física ou lógica do host nativo do notch.
