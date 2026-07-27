# API ServiceNow para Onboarding Microsoft 365

Esta API recebe uma solicitacao de onboarding do ServiceNow, executa o script `Create-LabMailboxUser.ps1` e envia um e-mail ao gestor com o UPN/e-mail e a senha provisoria do colaborador.

## Arquitetura

```text
ServiceNow Catalog Item
        |
        | POST /api/onboarding/users
        v
API Node.js
        |
        | executa Create-LabMailboxUser.ps1
        v
Microsoft Graph PowerShell
        |
        v
Microsoft 365 / Exchange Online
        |
        v
E-mail para o gestor
```

## Instalar dependencias

```powershell
cd C:\Users\hyago\Documents\SCRIPTS\exchange-user-lab
npm install
```

## Configurar variaveis

Copie o exemplo:

```powershell
Copy-Item .\.env.example .\.env
```

Edite `.env`:

```env
PORT=3000
API_KEY=uma-chave-grande-para-o-servicenow
ONBOARDING_SCRIPT_PATH=C:\Users\hyago\Documents\SCRIPTS\exchange-user-lab\Create-LabMailboxUser.ps1
POWERSHELL_CONFIG_PATH=C:\Users\hyago\Documents\SCRIPTS\exchange-user-lab\config.local.ps1
SKIP_MAILBOX_CHECK=true
SQLITE_DB_PATH=C:\Users\hyago\Documents\SCRIPTS\exchange-user-lab\data\exchange-user-lab.sqlite

SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notificacoes@seudominio.onmicrosoft.com
SMTP_PASS=sua-senha-ou-app-password
MAIL_FROM_NAME=Onboarding Microsoft 365
MAIL_FROM_ADDRESS=notificacoes@seudominio.onmicrosoft.com
```

O `.env` nunca deve ser enviado para o GitHub.

## Rodar a API

```powershell
npm start
```

Teste de saude:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

## Testar criacao de usuario

```powershell
$body = @{
  nomeCompleto = "Maria da Silva Costa"
  emailPessoal = "maria.costa@gmail.com"
  cargo = "Analista de RH"
  departamento = "Recursos Humanos"
  gestor = "hyago@iahgodev.onmicrosoft.com"
  dataAdmissao = "2026-08-01"
  tipoColaborador = "CLT"
  serviceNowRequestId = "RITM0010001"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3000/api/onboarding/users" `
  -Method Post `
  -Headers @{ "x-api-key" = "uma-chave-grande-para-o-servicenow" } `
  -ContentType "application/json" `
  -Body $body
```

## Payload esperado pelo ServiceNow

```json
{
  "nomeCompleto": "Maria da Silva Costa",
  "emailPessoal": "maria.costa@gmail.com",
  "cargo": "Analista de RH",
  "departamento": "Recursos Humanos",
  "gestor": "hyago@iahgodev.onmicrosoft.com",
  "dataAdmissao": "2026-08-01",
  "tipoColaborador": "CLT",
  "serviceNowRequestId": "RITM0010001"
}
```

## Gestao de notificacoes por e-mail

A API grava as tentativas de e-mail em SQLite. O banco local fica em:

```text
data/exchange-user-lab.sqlite
```

Listar notificacoes:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/notifications" `
  -Headers @{ "x-api-key" = "uma-chave-grande-para-o-servicenow" }
```

Listar apenas falhas:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/notifications?status=failed" `
  -Headers @{ "x-api-key" = "uma-chave-grande-para-o-servicenow" }
```

Reenviar uma notificacao especifica:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/notifications/1/resend" `
  -Method Post `
  -Headers @{ "x-api-key" = "uma-chave-grande-para-o-servicenow" }
```

Reenviar todas as notificacoes com falha:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/notifications/resend-failed" `
  -Method Post `
  -Headers @{ "x-api-key" = "uma-chave-grande-para-o-servicenow" }
```

## Sobre o login interativo Microsoft

O script ainda usa `Connect-MgGraph` em modo delegado. Para automacao real, o ideal e trocar para App Registration no Microsoft Entra ID com autenticacao nao interativa.

Para uma primeira demonstracao local, rode o script manualmente uma vez e valide a criacao. Para producao ou demo sem janela de login, evolua para:

- Microsoft Graph com App Registration.
- Permissoes de aplicativo como `User.ReadWrite.All`, `Directory.ReadWrite.All` e `Organization.Read.All`, com consentimento admin.
- Certificado ou segredo armazenado fora do codigo.
- Opcionalmente remover a validacao `Get-EXOMailbox`, pois a mailbox e provisionada pela licenca.

## Configuracao no ServiceNow

No ServiceNow, crie uma chamada REST outbound ou uma acao no Flow Designer enviando:

- URL: `http://seu-servidor:3000/api/onboarding/users`
- Method: `POST`
- Header: `Content-Type: application/json`
- Header: `x-api-key: valor_do_API_KEY`
- Body: JSON com os campos do formulario RH.

Para teste externo, se a API estiver na sua maquina local, exponha temporariamente com uma ferramenta como ngrok ou publique em Azure App Service/Azure Function.
