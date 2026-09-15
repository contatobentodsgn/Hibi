# Adaptador de dispositivo físico — Design

## Objetivo

Preparar a integração do Hibi com um dispositivo físico Taby sem fingir suporte antes de existir protocolo, hardware e firmware autorizados.

## Decisões

- O adaptador será uma interface local versionada, com capacidades declaradas e estado `unavailable` até o protocolo ser validado.
- Configurações destinadas ao dispositivo continuam no pacote `hibi.device-settings`, dentro do workspace; não haverá acesso direto a USB/Bluetooth sem protocolo documentado.
- O transporte será substituível (USB, Bluetooth ou mock de laboratório), com timeouts, cancelamento e validação de mensagens.
- O app continua funcional sem o dispositivo e informa claramente o motivo da indisponibilidade.

## Contrato inicial

O adaptador recebe `schema`, `version`, `screenTimeout`, `loopAnimation` e uma lista limitada de capacidades. Responde com `available`, `firmwareVersion`, `capabilities` e erros saneados. Nenhum comando destrutivo ou atualização de firmware entra no primeiro ciclo.

## Validação

Testes usam um transporte mock para provar handshake, incompatibilidade de versão, timeout, desconexão, reconexão e persistência. Teste físico só será marcado como aprovado com hardware e protocolo fornecidos, usando o roteiro em `docs/notch-manual-test-plan.md`.
