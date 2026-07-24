param(
    [Parameter(Mandatory = $true)]
    [string]$NomeCompleto,

    [string]$ConfigPath = (Join-Path $PSScriptRoot "config.local.ps1")
)

if (-not (Test-Path $ConfigPath)) {
    throw "Arquivo de configuracao nao encontrado: $ConfigPath. Copie config.example.ps1 para config.local.ps1 e preencha os valores."
}

. $ConfigPath

$requiredConfig = @("AdminUpn", "TenantDomain", "PreferredSkuPartNumber", "UsageLocation")
foreach ($item in $requiredConfig) {
    if (-not (Get-Variable -Name $item -ErrorAction SilentlyContinue) -or [string]::IsNullOrWhiteSpace((Get-Variable -Name $item).Value)) {
        throw "Configuracao obrigatoria ausente: $item"
    }
}

Import-Module Microsoft.Graph.Users
Import-Module Microsoft.Graph.Identity.DirectoryManagement
Import-Module ExchangeOnlineManagement

Connect-MgGraph -Scopes "User.ReadWrite.All", "Directory.ReadWrite.All", "Organization.Read.All" -NoWelcome
Connect-ExchangeOnline -UserPrincipalName $AdminUpn -ShowBanner:$false

function Remove-Accents {
    param([string]$Text)

    $normalized = $Text.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder

    foreach ($char in $normalized.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }

    $builder.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Test-UpnExists {
    param([string]$Upn)

    try {
        $null = Get-MgUser -UserId $Upn -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function New-LabPassword {
    param(
        [string]$PrimeiroNome,
        [string]$Alias
    )

    $primeiroNomeSenha = (Get-Culture).TextInfo.ToTitleCase($PrimeiroNome.ToLower())
    $senhaSugerida = "$primeiroNomeSenha@123"

    if ($senhaSugerida.ToLower().Contains($Alias.ToLower())) {
        $numero = Get-Random -Minimum 1000 -Maximum 9999
        return "Lab@$numero"
    }

    return $senhaSugerida
}

$nomeLimpo = Remove-Accents $NomeCompleto.ToLower().Trim()
$partes = $nomeLimpo -split "\s+" | Where-Object { $_ -notin @("de", "da", "do", "das", "dos", "e") }

if ($partes.Count -lt 2) {
    throw "Informe nome e sobrenome. Exemplo: Hyago Lucas de Souza Oliveira"
}

$primeiroNome = $partes[0]
$sobrenome = $partes[-1]

$alias = $primeiroNome
$upn = "$alias@$TenantDomain"

if (Test-UpnExists $upn) {
    $alias = "$($primeiroNome.Substring(0, 1))$sobrenome"
    $upn = "$alias@$TenantDomain"
}

$contador = 2
$aliasBase = $alias

while (Test-UpnExists $upn) {
    $alias = "$aliasBase$contador"
    $upn = "$alias@$TenantDomain"
    $contador++
}

$senhaPadrao = New-LabPassword -PrimeiroNome $primeiroNome -Alias $alias

$passwordProfile = @{
    Password = $senhaPadrao
    ForceChangePasswordNextSignIn = $false
}

try {
    $user = New-MgUser `
        -DisplayName $NomeCompleto `
        -GivenName $primeiroNome `
        -Surname $sobrenome `
        -UserPrincipalName $upn `
        -MailNickname $alias `
        -UsageLocation $UsageLocation `
        -PasswordProfile $passwordProfile `
        -AccountEnabled:$true `
        -ErrorAction Stop
}
catch {
    throw "Falha ao criar usuario $upn. Detalhe: $($_.Exception.Message)"
}

$licenseSku = Get-MgSubscribedSku -All | Where-Object {
    $_.SkuPartNumber -eq $PreferredSkuPartNumber -and
    $_.ConsumedUnits -lt $_.PrepaidUnits.Enabled
} | Select-Object -First 1

if (-not $licenseSku) {
    throw "Nenhuma licenca disponivel encontrada para a SKU $PreferredSkuPartNumber."
}

Set-MgUserLicense `
    -UserId $user.Id `
    -AddLicenses @(@{ SkuId = $licenseSku.SkuId }) `
    -RemoveLicenses @() `
    -ErrorAction Stop

Write-Host "Usuario criado: $upn"
Write-Host "Senha inicial: $senhaPadrao"
Write-Host "Licenca atribuida: $($licenseSku.SkuPartNumber)"

Write-Host "Aguardando provisionamento da caixa de correio..."
Start-Sleep -Seconds 30

try {
    Get-EXOMailbox -Identity $upn -ErrorAction Stop |
        Select-Object DisplayName, UserPrincipalName, PrimarySmtpAddress
}
catch {
    Write-Warning "Usuario criado e licenciado, mas a mailbox ainda pode estar provisionando. Aguarde alguns minutos e teste: Get-EXOMailbox -Identity $upn"
}
