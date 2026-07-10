# Fusiona datos de "Achievement-Watcher" en "Achievement Watcher" y elimina la carpeta antigua.
# La app solo usa "Achievement Watcher". Ejecutar una sola vez desde PowerShell.

$appData = [Environment]::GetFolderPath('ApplicationData')
$newDir = Join-Path $appData "Achievement Watcher"
$oldDir = Join-Path $appData "Achievement-Watcher"

if (-not (Test-Path $oldDir)) {
    Write-Host "No existe la carpeta antigua 'Achievement-Watcher'. Nada que hacer."
    exit 0
}

Write-Host "Carpeta correcta (se mantiene): $newDir"
Write-Host "Carpeta antigua (se fusionara y eliminara): $oldDir"
Write-Host ""

# Crear estructura en la carpeta correcta
$folders = @("cfg", "logs", "steam_cache\schema", "steam_cache\user", "steam_cache\data", "steam_cache\icon", "translation_cache")
foreach ($f in $folders) {
    $target = Join-Path $newDir $f
    if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
}

# Copiar cfg (solo si el destino no existe o la antigua es mas reciente)
$cfgOld = Join-Path $oldDir "cfg"
$cfgNew = Join-Path $newDir "cfg"
if (Test-Path $cfgOld) {
    Get-ChildItem $cfgOld -File | ForEach-Object {
        $dest = Join-Path $cfgNew $_.Name
        if (-not (Test-Path $dest) -or $_.LastWriteTime -gt (Get-Item $dest).LastWriteTime) {
            Copy-Item $_.FullName $dest -Force
            Write-Host "  Copiado: cfg\$($_.Name)"
        }
    }
}

# Copiar steam_cache (solo carpetas/archivos que no existan en destino)
$cacheOld = Join-Path $oldDir "steam_cache"
$cacheNew = Join-Path $newDir "steam_cache"
if (Test-Path $cacheOld) {
    Get-ChildItem $cacheOld -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($cacheOld.Length + 1)
        $dest = Join-Path $cacheNew $rel
        if (-not (Test-Path $dest)) {
            $destDir = Split-Path $dest -Parent
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Copy-Item $_.FullName $dest -Force
            Write-Host "  Copiado: steam_cache\$rel"
        }
    }
}

# Eliminar carpeta antigua
Write-Host ""
Write-Host "Eliminando carpeta antigua 'Achievement-Watcher'..."
Remove-Item -Path $oldDir -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $oldDir) {
    Write-Host "AVISO: No se pudo eliminar por completo (algun archivo en uso?). Cierra la app y el Watchdog e intenta de nuevo."
} else {
    Write-Host "Listo. Solo queda 'Achievement Watcher'."
}
