# Exchange Online User Lab

Script PowerShell para criar usuarios de laboratorio no Microsoft 365, atribuir uma licenca e validar o provisionamento da caixa de correio no Exchange Online.

## O que o script faz

- Conecta ao Microsoft Graph PowerShell.
- Conecta ao Exchange Online PowerShell.
- Recebe `NomeCompleto` como parametro.
- Gera o UPN automaticamente no dominio configurado.
- Tenta primeiro `primeironome@dominio`.
- Se ja existir, tenta `inicialsobrenome@dominio`.
- Se ainda existir, usa sufixo numerico, como `holiveira2@dominio`.
- Gera uma senha inicial no padrao `PrimeiroNome@123`.
- Se a senha conflitar com o username, gera uma senha neutra no formato `Lab@1234`.
- Atribui a licenca configurada em `PreferredSkuPartNumber`.
- Consulta a mailbox com `Get-EXOMailbox`.

## Estrutura

```text
exchange-user-lab/
  Create-LabMailboxUser.ps1
  config.example.ps1
  .gitignore
  README.md
```

## Pre-requisitos

- Windows PowerShell 5.1 ou PowerShell 7.
- Conta administradora do Microsoft 365.
- Permissao para criar usuarios e atribuir licencas no tenant.
- Uma licenca disponivel que inclua Exchange Online.
- Modulos PowerShell:
  - `Microsoft.Graph`
  - `ExchangeOnlineManagement`

## Instalacao dos modulos

Execute uma vez:

```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
Install-Module ExchangeOnlineManagement -Scope CurrentUser
```

Se o PowerShell pedir confirmacao para instalar de um repositorio nao confiavel, aceite com `S`.

## Configuracao segura

Copie o arquivo de exemplo:

```powershell
Copy-Item .\config.example.ps1 .\config.local.ps1
```

Edite `config.local.ps1`:

```powershell
$AdminUpn = "hyago@iahgodev.onmicrosoft.com"
$TenantDomain = "iahgodev.onmicrosoft.com"
$PreferredSkuPartNumber = "ENTERPRISEPREMIUM"
$UsageLocation = "BR"
```

O arquivo `config.local.ps1` esta no `.gitignore`, entao ele nao deve ser publicado no GitHub. Para portfolio, publique apenas o `config.example.ps1`.

## Como descobrir a SKU da licenca

Depois de conectar ao Graph, rode:

```powershell
Connect-MgGraph -Scopes "Organization.Read.All" -NoWelcome

Get-MgSubscribedSku -All |
  Select-Object SkuPartNumber, ConsumedUnits,
    @{Name="Total";Expression={$_.PrepaidUnits.Enabled}} |
  Format-Table
```

No laboratorio usado como referencia, a SKU encontrada foi:

```text
ENTERPRISEPREMIUM
```

## Como executar

Entre na pasta do projeto:

```powershell
cd .\exchange-user-lab
```

Execute:

```powershell
.\Create-LabMailboxUser.ps1 -NomeCompleto "Maria da Silva Costa"
```

Exemplos de UPN gerados:

```text
Maria da Silva Costa -> maria@seudominio.onmicrosoft.com
Hyago Lucas de Souza Oliveira -> hyago@seudominio.onmicrosoft.com
```

Se `hyago@seudominio.onmicrosoft.com` ja existir:

```text
Hyago Lucas de Souza Oliveira -> holiveira@seudominio.onmicrosoft.com
```

## Politica de senha

O script tenta gerar a senha inicial assim:

```text
PrimeiroNome@123
```

Exemplo:

```text
Maria da Silva Costa -> Maria@123
```

Porem, o Microsoft 365 bloqueia senhas que contenham o username. Se o usuario criado for `maria@...`, a senha `Maria@123` pode ser recusada. Nesse caso o script gera automaticamente uma senha neutra:

```text
Lab@4837
```

## Erro de politica de execucao

Se o PowerShell bloquear scripts locais, execute:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Depois rode o script novamente.

## Observacoes para portfolio

Este projeto demonstra:

- Automacao administrativa com PowerShell.
- Criacao de usuarios no Microsoft 365 via Microsoft Graph.
- Atribuicao de licencas por SKU.
- Integracao com Exchange Online.
- Separacao de configuracao sensivel usando arquivo local ignorado pelo Git.

Nao publique valores reais de admin, tenant privado ou logs contendo dados de usuarios reais.
