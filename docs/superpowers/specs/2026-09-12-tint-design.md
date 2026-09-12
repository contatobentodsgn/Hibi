# Tint visual do Hibi

## Objetivo

Permitir que a pessoa escolha uma cor de identidade para o Hibi sem alterar o significado das categorias nem reduzir o contraste dos temas claro e escuro.

## Escopo

- Cinco escolhas fixas: Aurora, Oceano, Musgo, Íris e Rosa.
- Aurora é o padrão e preserva o laranja atual.
- A escolha é aplicada imediatamente no documento, persiste somente neste Mac e funciona com tema claro, escuro ou sistema.
- A interface fica em Ajustes › Geral, junto de Tema, como um grupo de botões com amostra visual e estado selecionado acessível.

## Fora do escopo

- Não há entrada de cor livre, pois ela não permite garantir contraste.
- Não há mudança nas cores semânticas de categoria (trabalho, pausa, aprendizado, importante e bem-estar).
- Não há alteração de atalhos, tamanho, posição ou superfícies nativas do Taby; esses itens pertencem ao Claude.
- Não há mudança de IPC, Electron, banco de dados ou backup de workspace.

## Modelo

`TintPreference` é uma união fechada de cinco ids. A preferência usa a chave local separada `hibi-tint`. O `ThemeProvider` mantém tema e tint juntos, aplica `data-theme` e `data-tint` no elemento raiz e remove qualquer listener anterior de tema quando necessário.

CSS substitui somente `--accent`, `--accent-soft`, `--stroke-focus`, `--text-hero` e o alias legado `--orange`. Cada tint tem valores explícitos para claro e escuro. Os tokens de categoria não são sobrescritos.

## Comportamento

1. A abertura lê `hibi-tint`; valor ausente ou inválido vira Aurora.
2. Escolher uma amostra atualiza o atributo raiz e tenta persistir sem impedir a interface caso o storage falhe.
3. O controle usa `role="radiogroup"`; cada escolha é um `role="radio"` com `aria-checked` e nome localizado.
4. Trocar tema não troca tint; trocar tint não troca tema.

## Provas

- Domínio de aparência: validação, leitura segura, persistência e atributos de documento.
- Render estático: amostras, rótulos e seleção acessível.
- Playwright: troca o tint em Ajustes, confirma `data-tint` e preservação após recarregar.
- Prova de mutação: romper a aplicação de `data-tint` precisa derrubar o teste correspondente.
