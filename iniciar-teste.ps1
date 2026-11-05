# Bolso Certo - inicia tudo para testar no computador e no celular.
#
# Uso (PowerShell, na pasta do projeto):
#   .\iniciar-teste.ps1                    # dados reais (Atacadao + Carrefour)
#   .\iniciar-teste.ps1 -Dados inventados  # os 4 mercados inventados
#   .\iniciar-teste.ps1 -Dados todos       # reais + inventados
#
# Abre 3 janelas: API, painel (site do mercado) e app (QR code para o Expo Go).
# Nada vai para a internet: tudo roda no seu computador, na sua rede Wi-Fi.

param(
  [ValidateSet('reais', 'inventados', 'todos')]
  [string]$Dados = 'reais'
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

# Senha fixa SO para teste local (a API do teste nunca fica na internet).
$adminEmail = 'admin@bolsocerto.local'
$adminSenha = 'BolsoCerto-Teste-2026'

if (-not (Test-Path (Join-Path $raiz 'node_modules'))) {
  Write-Host 'Instalando dependencias (so na primeira vez)...' -ForegroundColor Yellow
  Push-Location $raiz; npm install; Pop-Location
}

# Se sobraram servidores de uma rodada anterior (API 3000, painel 5173, app 8081), encerra so os DESTE projeto,
# para que a API antiga nao responda no lugar da nova. Processo de outro programa nunca e tocado.
foreach ($porta in 3000, 5173, 8081) {
  foreach ($c in @(Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -and $proc.CommandLine.Contains($raiz)) {
      Write-Host "Encerrando servidor antigo do Bolso Certo na porta $porta..." -ForegroundColor Yellow
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}
Start-Sleep -Seconds 2
foreach ($porta in 3000, 5173, 8081) {
  if (Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue) {
    throw "A porta $porta continua em uso por outro programa (nao e do Bolso Certo). Feche-o e rode de novo."
  }
}

# Pasta com as planilhas que a API vai carregar ao ligar.
$carga = Join-Path $raiz '.dados-carga'
if (Test-Path $carga) { Remove-Item $carga -Recurse -Force }
New-Item -ItemType Directory -Path $carga | Out-Null
if ($Dados -in 'reais', 'todos') {
  Copy-Item (Join-Path $raiz 'dados-reais\*.xlsx') $carga
}
if ($Dados -in 'inventados', 'todos') {
  Copy-Item (Join-Path $raiz 'dados-de-teste\*.xlsx') $carga
}
$qtd = (Get-ChildItem $carga -Filter *.xlsx).Count
if ($qtd -eq 0) { throw 'Nenhuma planilha encontrada para carregar.' }

# Endereco do computador na rede (para o celular achar a API).
$ip = $null
try {
  $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    Select-Object -First 1).IPv4Address.IPAddress
} catch { }
if (-not $ip) {
  $ip = Read-Host 'Nao consegui descobrir o IP do computador. Digite (ex.: 192.168.0.10)'
}
$urlApi = "http://${ip}:3000"

function Abrir($titulo, $comando) {
  $cmd = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$raiz'; $comando"
  Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $cmd | Out-Null
}

Abrir 'Bolso Certo - API' ("`$env:PASTA_DADOS_DE_TESTE='$carga'; `$env:ADMIN_EMAIL='$adminEmail'; `$env:ADMIN_SENHA='$adminSenha'; npm run dev -w @mercado/api")
Start-Sleep -Seconds 4
Abrir 'Bolso Certo - Painel' ("`$env:VITE_API_URL='http://localhost:3000'; npm run dev -w @mercado/painel")
Abrir 'Bolso Certo - App (QR code)' ("`$env:EXPO_PUBLIC_API_URL='$urlApi'; npm run start -w @mercado/mobile")

Start-Sleep -Seconds 6
Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host 'Bolso Certo iniciado.' -ForegroundColor Green
Write-Host "  Planilhas carregadas : $qtd ($Dados)"
Write-Host "  Painel (navegador)   : http://localhost:5173"
Write-Host "  Administrador        : $adminEmail  /  $adminSenha"
Write-Host "  App no navegador     : http://localhost:8081  (abra no computador; a 1a vez demora ~1 min)"
Write-Host "  API para o celular   : $urlApi"
Write-Host ''
Write-Host 'No celular: instale o Expo Go, conecte na MESMA rede Wi-Fi e leia o QR code da janela "App".'
Write-Host "Se o celular nao abrir o app: no Expo Go use 'Enter URL manually' e digite exp://${ip}:8081 (alguns Wi-Fi de empresa bloqueiam celular x computador; nesse caso use o roteador de casa ou o 4G do celular como ponto de acesso)."
Write-Host 'Se o Windows perguntar sobre o firewall, permita em "Redes privadas".'
Write-Host 'Os codigos de e-mail (confirmar conta) aparecem na janela "API", na linha [e-mail].'
Write-Host 'Para encerrar: feche as 3 janelas. Os dados somem (ainda nao ha banco de dados).'
