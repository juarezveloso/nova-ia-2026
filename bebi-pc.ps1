# Assistente local da Bebi para Windows 10 e 11. Sem servidor nem administrador.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$chave = 'HKCU:\Software\Classes\bebi-pc'
$chaveComando = Join-Path $chave 'shell\open\command'
$pasta = Join-Path $env:LOCALAPPDATA 'BebiPC'
$instalado = Join-Path $pasta 'bebi-pc.ps1'
$windowsPowerShell = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
$registro = '"{0}" -NoProfile -ExecutionPolicy RemoteSigned -File "{1}" "%1"' -f $windowsPowerShell, $instalado

function Confirmar([string]$texto) {
    return [System.Windows.Forms.MessageBox]::Show(
        $texto, 'Bebi PC', 'YesNo', 'Question', 'Button2'
    ) -eq 'Yes'
}

function Informar([string]$texto, [string]$icone = 'Information') {
    [void][System.Windows.Forms.MessageBox]::Show($texto, 'Bebi PC', 'OK', $icone)
}

function AbrirInstalado([string]$relativo) {
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs'), $env:LOCALAPPDATA)) {
        if (!$base) { continue }
        $executavel = Join-Path $base $relativo
        if (Test-Path -LiteralPath $executavel -PathType Leaf) {
            Start-Process -FilePath $executavel
            return $true
        }
    }
    return $false
}

try {
    if ($args.Count -eq 0) {
        if ((Test-Path -LiteralPath $chave) -and
            (!(Test-Path -LiteralPath $chaveComando) -or (Get-Item -LiteralPath $chaveComando).GetValue('') -cne $registro)) {
            throw 'O protocolo bebi-pc pertence a outro aplicativo.'
        }
        if (!(Confirmar 'Instalar ou atualizar o assistente local da Bebi para sua conta?')) { return }
        New-Item -ItemType Directory -Path $pasta -Force | Out-Null
        if ($PSCommandPath -ne $instalado) { Copy-Item -LiteralPath $PSCommandPath -Destination $instalado -Force }
        New-Item -Path $chaveComando -Force | Out-Null
        Set-Item -LiteralPath $chave -Value 'URL:Bebi PC'
        New-ItemProperty -LiteralPath $chave -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
        Set-Item -LiteralPath $chaveComando -Value $registro
        Informar 'Assistente instalado. Volte ao chat e tente: abrir Outlook.'
        return
    }

    if ($args.Count -ne 1) { return }
    if ($args[0] -ceq '-Remover') {
        if ((Test-Path -LiteralPath $chaveComando) -and (Get-Item -LiteralPath $chaveComando).GetValue('') -ceq $registro -and
            (Confirmar 'Desativar o protocolo da Bebi para sua conta?')) {
            Remove-Item -LiteralPath $chave -Recurse
            if (Test-Path -LiteralPath $instalado) { Remove-Item -LiteralPath $instalado }
            Informar 'Assistente local removido.'
        }
        return
    }
    $pedido = [string]$args[0]
    if ($pedido.Length -gt 80 -or $pedido -cnotmatch '\Abebi-pc://executar/(outlook|navegador|chrome|edge|firefox|calculadora|bloco|downloads|desligar|reiniciar|bloquear)/?\z') { return }
    $acao = $Matches[1]
    $rotulos = @{
        outlook = 'Abrir o Outlook? Se o aplicativo nao estiver instalado, abrir o Outlook na web.'
        navegador = 'Abrir o navegador padrao?'
        chrome = 'Abrir o Google Chrome?'
        edge = 'Abrir o Microsoft Edge?'
        firefox = 'Abrir o Mozilla Firefox?'
        calculadora = 'Abrir a Calculadora?'
        bloco = 'Abrir o Bloco de Notas?'
        downloads = 'Abrir a pasta Downloads?'
        desligar = 'Desligar o computador agora? Salve seus arquivos antes de confirmar.'
        reiniciar = 'Reiniciar o computador agora? Salve seus arquivos antes de confirmar.'
        bloquear = 'Bloquear sua sessao do Windows agora?'
    }
    if (!(Confirmar $rotulos[$acao])) { return }

    $sistema = [Environment]::SystemDirectory
    switch ($acao) {
        'outlook' {
            if (!(AbrirInstalado 'Microsoft Office\root\Office16\OUTLOOK.EXE')) { Start-Process 'https://outlook.office.com/mail/' }
        }
        'navegador' { Start-Process 'https://www.microsoft.com/' }
        'chrome' {
            if (!(AbrirInstalado 'Google\Chrome\Application\chrome.exe')) { Informar 'Google Chrome nao encontrado.' 'Warning' }
        }
        'edge' {
            if (!(AbrirInstalado 'Microsoft\Edge\Application\msedge.exe')) { Informar 'Microsoft Edge nao encontrado.' 'Warning' }
        }
        'firefox' {
            if (!(AbrirInstalado 'Mozilla Firefox\firefox.exe')) { Informar 'Mozilla Firefox nao encontrado.' 'Warning' }
        }
        'calculadora' { Start-Process (Join-Path $sistema 'calc.exe') }
        'bloco' { Start-Process (Join-Path $sistema 'notepad.exe') }
        'downloads' { Start-Process (Join-Path $env:windir 'explorer.exe') -ArgumentList 'shell:Downloads' }
        'desligar' { Start-Process (Join-Path $sistema 'shutdown.exe') -ArgumentList '/s', '/t', '0' }
        'reiniciar' { Start-Process (Join-Path $sistema 'shutdown.exe') -ArgumentList '/r', '/t', '0' }
        'bloquear' { Start-Process (Join-Path $sistema 'rundll32.exe') -ArgumentList 'user32.dll,LockWorkStation' }
    }
} catch {
    Informar ('Nao foi possivel concluir: ' + $_.Exception.Message) 'Error'
}
