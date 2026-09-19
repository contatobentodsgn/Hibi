# Desempenho da UI atual: linha de base

Data: 19/09/2026. Responsável: Claude. Fecha a lacuna apontada na revisão do #165: a U00 deveria medir a UI atual, e a U27 compara com essa medida. Depois da U03, a UI atual deixa de existir para ser medida.

## Como foi medido

- **App:** o instalado (`npm run app:install`), com a UI do `main` até o #163, que é visualmente o mesmo do #165. MacBook Apple Silicon, macOS 26.6, workspace real do usuário, mascote visível no notch.
- **Abertura:** do `open -a Hibi.app` até o documento carregado com a navegação desenhada, 3 vezes, com o app encerrado e 4 s de espera entre as aberturas.
- **Troca de tela:** do clique no dock até dois quadros de animação depois (`requestAnimationFrame` duas vezes), 5 voltas por Tarefas, Agenda, Foco, Taby e Home.
- **Parado:** 20 s na Home sem mexer e depois `top` em 3 intervalos de 10 s, somando todos os processos do app (principal, GPU, utilitário e renderer). O vídeo do mascote roda no processo principal.

Os números servem para comparar no mesmo Mac e nas mesmas condições. Não são metas nem garantia de desempenho em outra máquina.

## Resultados

| Medida | UI atual | Com a U01 (HeroUI e Tailwind) |
| --- | --- | --- |
| Abertura | 1909 ms (a frio), 1139 ms, 1078 ms | 1131 ms, 1098 ms, 987 ms |
| Troca de tela | 10 a 29 ms | 10 a 33 ms |
| CPU parado, soma dos processos | 11,5% (logo após navegar), 3,0%, 3,6% | 2,9%, 3,4%, 3,5% |
| Memória, soma dos processos | 171, 161, 154 MB | 155, 155, 150 MB |
| Processos do app | 4 | 4 |

Troca de tela em ms, por destino, nas 5 voltas:

| Destino | UI atual | Com a U01 |
| --- | --- | --- |
| Tarefas | 23, 12, 26, 25, 11 | 22, 10, 10, 12, 13 |
| Agenda | 29, 26, 11, 11, 12 | 33, 10, 12, 25, 26 |
| Foco | 19, 10, 12, 11, 12 | 19, 21, 12, 24, 11 |
| Taby | 16, 13, 12, 13, 12 | 16, 12, 13, 13, 13 |
| Home | 20, 25, 12, 13, 25 | 10, 12, 22, 24, 12 |

## Critério para as próximas unidades

- A U27 repete o mesmo roteiro e investiga qualquer diferença repetível acima de 20%, como o plano pede.
- Em ms, as trocas de tela variam de 10 a 30 entre voltas da mesma rota. Uma diferença de 20% na troca de tela só conta se aparecer na mediana de várias voltas.
