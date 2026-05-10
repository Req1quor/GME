# deploy-update.ps1
# Usage: .\scripts\deploy-update.ps1 -Host user@your-vps.com
# Déploie les artefacts de release vers le serveur de mise à jour VPS

param(
    [Parameter(Mandatory=$true)]
    [string]$SshHost,
    [string]$RemotePath = "/var/www/updates/gme"
)

$releaseDir = "$PSScriptRoot\..\release"

# Fichiers à envoyer : installeur, blockmap et latest.yml
$files = @(
    (Get-ChildItem "$releaseDir\*.exe" | Select-Object -First 1).FullName,
    (Get-ChildItem "$releaseDir\*.exe.blockmap" | Select-Object -First 1).FullName,
    "$releaseDir\latest.yml"
)

foreach ($file in $files) {
    if (-not $file -or -not (Test-Path $file)) {
        Write-Error "Fichier manquant : $file - lance d'abord 'npm run build:app'"
        exit 1
    }
}

Write-Host "Déploiement vers $SshHost`:$RemotePath ..."

# Créer le dossier distant si nécessaire
ssh $SshHost "mkdir -p $RemotePath"

# Copier les fichiers
foreach ($file in $files) {
    Write-Host "  -> $(Split-Path $file -Leaf)"
    scp $file "${SshHost}:${RemotePath}/"
}

Write-Host "Déploiement terminé."
