param(
    [Parameter(Mandatory = $true)]
    [string]$NomeCompleto,

    [string]$EmailPessoal,

    [string]$Cargo,

    [string]$Departamento,

    [string]$Gestor,

    [string]$DataAdmissao,

    [string]$TipoColaborador,

    [string]$ServiceNowRequestId,

    [switch]$SkipMailboxCheck,

    [string]$ConfigPath
)

$scriptDirectory = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $PSScriptRoot
}
elseif ($MyInvocation.MyCommand.Path) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
}
else {
    Get-Location
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $scriptDirectory "config.local.ps1"
}

$upn = $null
$senhaPadrao = $null

try {
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

    Import-Module Microsoft.Graph.Users -ErrorAction Stop
    Import-Module Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop
    if (-not $SkipMailboxCheck) {
        Import-Module ExchangeOnlineManagement -ErrorAction Stop
    }

    Connect-MgGraph -Scopes "User.ReadWrite.All", "Directory.ReadWrite.All", "Organization.Read.All" -NoWelcome -ErrorAction Stop | Out-Null

    if (-not $SkipMailboxCheck) {
        Connect-ExchangeOnline -UserPrincipalName $AdminUpn -ShowBanner:$false -ErrorAction Stop | Out-Null
    }

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

    $newUserParams = @{
        DisplayName = $NomeCompleto
        GivenName = $primeiroNome
        Surname = $sobrenome
        UserPrincipalName = $upn
        MailNickname = $alias
        UsageLocation = $UsageLocation
        PasswordProfile = $passwordProfile
        AccountEnabled = $true
        ErrorAction = "Stop"
    }

    if (-not [string]::IsNullOrWhiteSpace($EmailPessoal)) {
        $newUserParams.OtherMails = @($EmailPessoal)
    }

    if (-not [string]::IsNullOrWhiteSpace($Cargo)) {
        $newUserParams.JobTitle = $Cargo
    }

    if (-not [string]::IsNullOrWhiteSpace($Departamento)) {
        $newUserParams.Department = $Departamento
    }

    if (-not [string]::IsNullOrWhiteSpace($DataAdmissao)) {
        $newUserParams.EmployeeHireDate = [datetime]$DataAdmissao
    }

    if (-not [string]::IsNullOrWhiteSpace($TipoColaborador)) {
        $newUserParams.EmployeeType = $TipoColaborador
    }

    $user = New-MgUser @newUserParams

    if (-not [string]::IsNullOrWhiteSpace($Gestor)) {
        $manager = Get-MgUser -UserId $Gestor -ErrorAction Stop

        $managerRef = @{
            "@odata.id" = "https://graph.microsoft.com/v1.0/users/$($manager.Id)"
        }

        Set-MgUserManagerByRef `
            -UserId $user.Id `
            -BodyParameter $managerRef `
            -ErrorAction Stop | Out-Null
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
        -ErrorAction Stop | Out-Null

    $mailboxProvisionada = $false
    $primarySmtpAddress = $null

    if (-not $SkipMailboxCheck) {
        Start-Sleep -Seconds 30

        try {
            $mailbox = Get-EXOMailbox -Identity $upn -ErrorAction Stop
            $mailboxProvisionada = $true
            $primarySmtpAddress = $mailbox.PrimarySmtpAddress.ToString()
        }
        catch {
            $mailboxProvisionada = $false
        }
    }

    [PSCustomObject]@{
        status = "Criado"
        serviceNowRequestId = $ServiceNowRequestId
        nomeCompleto = $NomeCompleto
        emailPessoal = $EmailPessoal
        cargo = $Cargo
        departamento = $Departamento
        gestor = $Gestor
        dataAdmissao = $DataAdmissao
        tipoColaborador = $TipoColaborador
        upnCriado = $upn
        senhaInicial = $senhaPadrao
        licencaAtribuida = $licenseSku.SkuPartNumber
        mailboxProvisionada = $mailboxProvisionada
        primarySmtpAddress = $primarySmtpAddress
        mensagemErro = $null
    } | ConvertTo-Json -Depth 5

    exit 0
}
catch {
    [PSCustomObject]@{
        status = "Falha"
        serviceNowRequestId = $ServiceNowRequestId
        nomeCompleto = $NomeCompleto
        upnCriado = $upn
        senhaInicial = $null
        mensagemErro = $_.Exception.Message
    } | ConvertTo-Json -Depth 5

    exit 1
}
