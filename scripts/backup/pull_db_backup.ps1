# Copia o dump diário do banco da VPS para ESTE computador (cópia fora do servidor).
# Só traz o banco (~8 MB por dia); as fotos (9 GB) ficam de fora de propósito.
#
# Uso manual:    powershell -File pull_db_backup.ps1
# Agendar (1x):  schtasks /Create /SC DAILY /ST 09:00 /TN "SmartOS backup banco" /TR "powershell -NoProfile -File `"D:\Projetos - DEV\smartos\scripts\backup\pull_db_backup.ps1`""
param(
    [string]$Dest = "D:\Backups\smartos",
    [string]$Server = "root@31.97.86.62",
    [string]$Key = "$env:USERPROFILE\.ssh\smartos_vps_ed25519",
    [int]$KeepDays = 60
)

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$latest = (& ssh -i $Key $Server "ls -1t /opt/backups/postgres/postgres_*.dump | head -n1").Trim()
if (-not $latest) { Write-Error "Nenhum dump encontrado na VPS."; exit 1 }

$name = Split-Path $latest -Leaf
$target = Join-Path $Dest $name
if (Test-Path $target) { Write-Output "Já copiado: $name"; exit 0 }

& scp -i $Key "${Server}:$latest" $target
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao copiar $name"; exit 1 }
Write-Output "Copiado: $name ($([math]::Round((Get-Item $target).Length / 1MB, 1)) MB)"

Get-ChildItem $Dest -Filter "postgres_*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
    Remove-Item -Force
