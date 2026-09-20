# Assinar, notarizar e publicar o Hibi

Sem isto, o app funciona neste Mac e mais nada: o macOS **só substitui um app por outro com a mesma assinatura**, então a atualização automática nunca se aplica, e quem baixar em outra máquina leva um aviso do Gatekeeper dizendo que o app não pôde ser verificado.

O que falta é de conta, não de código. As três primeiras etapas são do dono do projeto e envolvem pagamento, criação de conta e senhas — nenhuma IA faz, e nenhuma delas precisa ver as credenciais.

## 1. Entrar no Apple Developer Program

US$ 99 por ano, em [developer.apple.com/programs](https://developer.apple.com/programs/), com o Apple ID que já usa o Mac. A aprovação costuma levar de algumas horas a dois dias.

## 2. Criar o certificado **Developer ID Application**

No Xcode (Settings › Accounts › Manage Certificates › +) ou no portal da Apple. É este o tipo que assina app distribuído fora da App Store; `Apple Development` **não serve** — assina para depurar, e o Gatekeeper recusa na outra máquina.

Depois de instalado, confira no Terminal:

```bash
security find-identity -v -p codesigning
```

A linha precisa dizer `Developer ID Application: <seu nome> (TEAMID)`. O `TEAMID` entre parênteses é o `APPLE_TEAM_ID`.

## 3. Gerar uma senha específica de app

Em [appleid.apple.com](https://appleid.apple.com) › Sign-In and Security › App-Specific Passwords. É ela que a notarização usa, no lugar da senha real do Apple ID. Guarde no seu gerenciador; ela não entra em arquivo nenhum do projeto.

## 4. Publicar deste Mac

Com o certificado instalado, no Terminal:

```bash
APPLE_ID="seu@apple.id" APPLE_TEAM_ID="TEAMID" APPLE_APP_SPECIFIC_PASSWORD="senha-de-app" npm run release:mac
```

O `release:preflight` roda antes e recusa cedo o que faltar, em vez de descobrir no fim de dez minutos de build. As variáveis valem só para esse comando: não ficam salvas, não entram no git e não aparecem em log.

## 5. Publicar pelo GitHub (opcional, e o que liga a atualização automática)

O workflow `.github/workflows/release.yml` faz o mesmo num runner macOS e **anexa o resultado à release**, que é o feed que o app consulta. Ele só roda quando uma tag `v*` é empurrada, e precisa de cinco segredos em Settings › Secrets and variables › Actions:

| Segredo | O que é |
|---|---|
| `CSC_LINK` | o certificado exportado como `.p12`, em base64 (`base64 -i certificado.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | a senha que você deu ao exportar o `.p12` |
| `APPLE_ID` | o Apple ID da conta de desenvolvedor |
| `APPLE_APP_SPECIFIC_PASSWORD` | a senha específica de app da etapa 3 |
| `APPLE_TEAM_ID` | o identificador entre parênteses da etapa 2 |

Para publicar a versão:

```bash
npm version patch   # ou minor/major: escreve a versão no package.json e cria a tag
git push --follow-tags
```

Runner macOS é gratuito em repositório público, que é o caso deste.

## Enquanto isso não existe

`npm run app:install` constrói e instala a versão do repositório neste Mac com um comando. É a via de hoje, e continua valendo depois — é ela que se usa para testar antes de publicar.

## O que o app faz com isso

Com uma release publicada, a tela de Atualizações passa a encontrar versão nova, baixar **quando pedido** e instalar ao reiniciar. Sem assinatura, a instalação falha com `Could not get code signature for running application`, e a tela mostra esse motivo em vez de fingir que deu certo.
