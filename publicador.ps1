# =====================================================================
#  Publicador del portafolio (autonomo, sin gh CLI)
#  - Autentica directo con la credencial de Git (Windows Credential Manager)
#  - Sincroniza y publica la pagina en GitHub (con auto-rebase si hace falta)
#  - Optimiza videos (720p, faststart) con cache para no re-codificar jamas
#  - Sube videos directo a GitHub Releases via API REST + curl con progreso real
#  - Verifica cuando GitHub Pages ya refleja los cambios
#
#  Modos de uso:
#    .\publicador.ps1                     -> modo continuo (vigila cambios)
#    .\publicador.ps1 -UnaVez             -> ejecuta un ciclo y termina
#    .\publicador.ps1 -SubirArchivo ruta  -> optimiza y sube un archivo suelto
# =====================================================================
param(
    [switch]$UnaVez,
    [string]$SubirArchivo = ''
)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot

$TAG      = 'media'
$BANDEJA  = Join-Path $PSScriptRoot 'subir'
$OPT_DIR  = Join-Path $BANDEJA '_opt'
$ESTADO   = Join-Path $BANDEJA '_estado.txt'
$ONLINE   = Join-Path $BANDEJA '_online.txt'
$LOG_FILE = Join-Path $BANDEJA '_publicador.log'
$CERROJO  = Join-Path $PSScriptRoot '.publicador.lock'
$TOPE_MB  = 45

if (-not (Test-Path $BANDEJA)) { New-Item -ItemType Directory -Path $BANDEJA -Force | Out-Null }

# Detectar repositorio desde origin (fallback a Zyon64/Portfolio)
$REPO = 'Zyon64/Portfolio'
try {
    $remoteUrl = (& git remote get-url origin 2>$null)
    if ($remoteUrl -match 'github\.com[:/]([^/]+/[^/.]+?)(?:\.git)?$') {
        $REPO = $Matches[1]
    }
} catch {}

# Auto-detectar ffmpeg y ffprobe (sin rutas fijas de otras PCs)
$FFMPEG  = (Get-Command ffmpeg  -ErrorAction SilentlyContinue).Source
$FFPROBE = (Get-Command ffprobe -ErrorAction SilentlyContinue).Source
$CURL    = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source

function Log($msg, [string]$color = '') {
    $linea = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    if ($color) { Write-Host $linea -ForegroundColor $color } else { Write-Host $linea }
    try {
        if ((Test-Path $LOG_FILE) -and ((Get-Item $LOG_FILE).Length -gt 524288)) {
            $ultimas = Get-Content $LOG_FILE -Tail 200 -ErrorAction SilentlyContinue
            [IO.File]::WriteAllLines($LOG_FILE, $ultimas)
        }
        [IO.File]::AppendAllText($LOG_FILE, "$linea`r`n")
    } catch {}
}

function Estado($archivo, $fase, $pct, $i, $total, $detalle = '') {
    if (-not (Test-Path $BANDEJA)) { return }
    $txt = "archivo=$archivo`nfase=$fase`npct=$([math]::Round($pct))`nindice=$i`ntotal=$total`n"
    if ($detalle) { $txt += "detalle=$detalle`n" }
    try { [IO.File]::WriteAllText($ESTADO, $txt) } catch {}
}

function LimpiarEstado() {
    if (Test-Path $ESTADO) { Remove-Item $ESTADO -Force -ErrorAction SilentlyContinue }
}

function Online($estado) {
    if (-not (Test-Path $BANDEJA)) { return }
    try { [IO.File]::WriteAllText($ONLINE, "estado=$estado`nhora=$(Get-Date -Format 'HH:mm:ss')`n") } catch {}
}

# ---------------------------------------------------------------------
#  UN SOLO PUBLICADOR A LA VEZ (solo en modo continuo)
# ---------------------------------------------------------------------
if (-not $UnaVez -and -not $SubirArchivo) {
    if (Test-Path $CERROJO) {
        $otroPid = (Get-Content $CERROJO -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($otroPid -match '^\d+$') {
            $proc = Get-Process -Id ([int]$otroPid) -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -match 'powershell|pwsh') {
                Write-Host "Ya hay un publicador corriendo (PID $otroPid)." -ForegroundColor Yellow
                Write-Host "Cierro este para que no se pisen."
                Start-Sleep -Seconds 3
                exit 0
            }
        }
    }
    $PID | Set-Content $CERROJO
    Register-EngineEvent PowerShell.Exiting -Action {
        Remove-Item $CERROJO -Force -ErrorAction SilentlyContinue
    } | Out-Null
}

# ---------------------------------------------------------------------
#  AUTENTICACION SIN DEPENDENCIAS EXTERNAS
#  Usa la credencial que Git ya guarda en Windows Credential Manager.
# ---------------------------------------------------------------------
$script:TOKEN_CACHE = $null
function ObtenerToken([switch]$Forzar) {
    if ($script:TOKEN_CACHE -and -not $Forzar) { return $script:TOKEN_CACHE }

    # 1) Git Credential Manager (ya autenticado por git)
    try {
        $cred = "protocol=https`nhost=github.com`n" | & git credential fill 2>$null
        $pass = ($cred | Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=',''
        if ($pass) {
            $script:TOKEN_CACHE = $pass.Trim()
            return $script:TOKEN_CACHE
        }
    } catch {}

    # 2) Variables de entorno opcionales
    if ($env:GITHUB_TOKEN) { $script:TOKEN_CACHE = $env:GITHUB_TOKEN.Trim(); return $script:TOKEN_CACHE }
    if ($env:GH_TOKEN)     { $script:TOKEN_CACHE = $env:GH_TOKEN.Trim(); return $script:TOKEN_CACHE }

    return $null
}

function ApiHeaders($token) {
    return @{
        'Authorization'        = "Bearer $token"
        'Accept'               = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
        'User-Agent'           = 'PortfolioPublicador/2.0'
    }
}

function ValidarConexionYToken() {
    $token = ObtenerToken
    if (-not $token) {
        Log "ERROR: No se encontro credencial de GitHub en Git." 'Red'
        Log "Solucion: hace un 'git push' una sola vez o inicia sesion en Git para Windows." 'Yellow'
        return $null
    }
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO" -Headers (ApiHeaders $token) -TimeoutSec 15
        if (-not $r.permissions -or -not $r.permissions.push) {
            Log "ERROR: La credencial de Git no tiene permisos de escritura sobre $REPO." 'Red'
            return $null
        }
        return $token
    } catch {
        $code = 0
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        if ($code -eq 401 -or $code -eq 403) {
            $script:TOKEN_CACHE = $null
            Log "ERROR: Credencial de GitHub vencida o sin permisos (HTTP $code)." 'Red'
        } else {
            Log "Sin conexion con GitHub: $($_.Exception.Message)" 'Yellow'
        }
        return $null
    }
}

# ---------------------------------------------------------------------
#  GITHUB RELEASES (100% API REST, sin gh CLI)
# ---------------------------------------------------------------------
function ObtenerReleaseId($token) {
    $headers = ApiHeaders $token
    try {
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/tags/$TAG" -Headers $headers -TimeoutSec 20
        return $rel.id
    } catch {
        $code = 0
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        if ($code -ne 404) {
            Log "Error consultando release '$TAG': $($_.Exception.Message)" 'Red'
            return $null
        }
    }

    # Crear release si no existe
    Log "Creando release '$TAG' en $REPO..."
    try {
        $body = @{
            tag_name = $TAG
            name     = 'Media'
            body     = 'Videos e imagenes pesadas del portafolio.'
            draft    = $false
            prerelease = $false
        } | ConvertTo-Json
        $nuevo = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$REPO/releases" `
                 -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 20
        return $nuevo.id
    } catch {
        Log "No se pudo crear release '$TAG': $($_.Exception.Message)" 'Red'
        return $null
    }
}

function BorrarAssetSiExiste($token, $relId, $nombre) {
    $headers = ApiHeaders $token
    $page = 1
    while ($true) {
        try {
            $assets = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/$relId/assets?per_page=100&page=$page" `
                      -Headers $headers -TimeoutSec 20
        } catch { return }

        if (-not $assets -or $assets.Count -eq 0) { return }
        foreach ($a in $assets) {
            if ($a.name -eq $nombre) {
                try {
                    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$REPO/releases/assets/$($a.id)" `
                                      -Headers $headers -TimeoutSec 20 | Out-Null
                    Log "  Reemplazando version anterior de $nombre en Releases..."
                } catch {
                    Log "  Aviso: no se pudo borrar asset previo ($($_.Exception.Message))" 'Yellow'
                }
                return
            }
        }
        if ($assets.Count -lt 100) { return }
        $page++
    }
}

# ---------------------------------------------------------------------
#  OPTIMIZAR VIDEO CON CACHE (nunca re-codifica el mismo video dos veces)
# ---------------------------------------------------------------------
function Optimizar($ruta, $nombre, $i, $total) {
    if (-not $FFMPEG) {
        Log "  ffmpeg no encontrado, se sube $nombre sin recomprimir." 'Yellow'
        return $ruta
    }

    New-Item -ItemType Directory -Path $OPT_DIR -Force | Out-Null
    $salida   = Join-Path $OPT_DIR $nombre
    $parcial  = Join-Path $OPT_DIR ("$nombre.part.mp4")
    $metaFile = Join-Path $OPT_DIR ("$nombre.meta")
    $prog     = Join-Path $BANDEJA '_ff.txt'

    $origItem = Get-Item -LiteralPath $ruta
    $firma    = "$($origItem.Length)|$($origItem.LastWriteTimeUtc.Ticks)"

    # Si ya fue optimizado antes con la misma firma y es valido, reutilizarlo!
    if ((Test-Path -LiteralPath $salida) -and (Test-Path -LiteralPath $metaFile)) {
        $metaActual = (Get-Content -LiteralPath $metaFile -Raw -ErrorAction SilentlyContinue)
        if ($metaActual -and $metaActual.Trim() -eq $firma -and ((Get-Item -LiteralPath $salida).Length -gt 0)) {
            $mb = (Get-Item -LiteralPath $salida).Length / 1MB
            Log ("Usando version ya optimizada de $nombre ({0:N1} MB)." -f $mb) 'Cyan'
            return $salida
        }
    }

    Remove-Item -LiteralPath $parcial -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $prog    -Force -ErrorAction SilentlyContinue

    $dur = 0.0
    if ($FFPROBE) {
        try {
            $durStr = (& $FFPROBE -v error -show_entries format=duration -of csv=p=0 $ruta 2>$null)
            $dur = [double]::Parse($durStr.Trim(), [Globalization.CultureInfo]::InvariantCulture)
        } catch {}
    }
    if ($dur -le 0) { $dur = 1 }

    Log "Optimizando $nombre..."
    Estado $nombre 'optimizando' 0 $i $total

    $p = Start-Process -FilePath $FFMPEG -PassThru -NoNewWindow -ArgumentList @(
        '-y','-v','error','-nostats','-progress',"`"$prog`"",
        '-i',"`"$ruta`"",
        '-vf','"scale=-2:min(720\,ih)"',
        '-c:v','libx264','-preset','veryfast','-crf','28',
        '-maxrate','2000k','-bufsize','4000k','-movflags','+faststart',
        '-c:a','aac','-b:a','96k',
        "`"$parcial`""
    )
    $null = $p.Handle

    while (-not $p.HasExited) {
        Start-Sleep -Milliseconds 700
        if (Test-Path -LiteralPath $prog) {
            try {
                $ult = Select-String -Path $prog -Pattern 'out_time_ms=(\d+)' -AllMatches | Select-Object -Last 1
                if ($ult) {
                    $ms = [double]$ult.Matches[$ult.Matches.Count - 1].Groups[1].Value
                    Estado $nombre 'optimizando' ([math]::Min(99, ($ms / 1000000.0) / $dur * 100.0)) $i $total
                }
            } catch {}
        }
    }
    $p.WaitForExit()
    Remove-Item -LiteralPath $prog -Force -ErrorAction SilentlyContinue

    if ($p.ExitCode -eq 0 -and (Test-Path -LiteralPath $parcial) -and ((Get-Item -LiteralPath $parcial).Length -gt 0)) {
        Move-Item -LiteralPath $parcial -Destination $salida -Force
        [IO.File]::WriteAllText($metaFile, $firma)
        $a = $origItem.Length / 1MB
        $b = (Get-Item -LiteralPath $salida).Length / 1MB
        Log ("  {0:N1} MB -> {1:N1} MB" -f $a, $b) 'Green'
        return $salida
    }

    Remove-Item -LiteralPath $parcial -Force -ErrorAction SilentlyContinue
    Log "  No se pudo optimizar (ffmpeg codigo $($p.ExitCode)), se sube el original." 'Yellow'
    return $ruta
}

function LimpiarCacheVideo($nombre) {
    Remove-Item -LiteralPath (Join-Path $OPT_DIR $nombre)          -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $OPT_DIR "$nombre.meta")   -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $OPT_DIR "$nombre.part.mp4") -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------
#  SUBIR A RELEASES CON PROGRESO REAL (curl.exe + REST API, cero gh)
# ---------------------------------------------------------------------
function Subir($ruta, $nombre, $i, $total, $token, $relId) {
    if (-not (Test-Path -LiteralPath $ruta)) {
        Log "  Archivo no encontrado: $ruta" 'Red'
        return $false
    }

    # Borrar asset viejo si ya existe (evita HTTP 422 already_exists)
    BorrarAssetSiExiste $token $relId $nombre

    $nombreUrl = [Uri]::EscapeDataString($nombre)
    $url       = "https://uploads.github.com/repos/$REPO/releases/$relId/assets?name=$nombreUrl"
    $tamMB     = [math]::Round((Get-Item -LiteralPath $ruta).Length / 1MB, 1)

    Log "Subiendo $nombre ($tamMB MB)..."
    Estado $nombre 'subiendo' 0 $i $total

    if ($CURL) {
        $medidor    = Join-Path $BANDEJA '_curl.txt'
        $salidaCurl = Join-Path $BANDEJA '_curl_out.txt'
        $cfgCurl    = Join-Path $BANDEJA '_curl_cfg.txt'
        Remove-Item -LiteralPath $medidor, $salidaCurl, $cfgCurl -Force -ErrorAction SilentlyContinue

        $cfgContenido = @(
            "header = `"Authorization: Bearer $token`""
            "header = `"Accept: application/vnd.github+json`""
            "header = `"Content-Type: application/octet-stream`""
        ) -join "`n"
        [IO.File]::WriteAllText($cfgCurl, $cfgContenido)

        $c = Start-Process -FilePath $CURL -PassThru -NoNewWindow `
             -RedirectStandardError $medidor -RedirectStandardOutput $salidaCurl -ArgumentList @(
                '--progress-bar', '--fail', '-X', 'POST',
                '-K', "`"$cfgCurl`"",
                '--data-binary', "`"@$ruta`"",
                "`"$url`""
             )
        $null = $c.Handle

        while (-not $c.HasExited) {
            Start-Sleep -Milliseconds 600
            try {
                $t = Get-Content -LiteralPath $medidor -Raw -ErrorAction SilentlyContinue
                if ($t) {
                    $m = [regex]::Matches($t, '(\d+[\.,]\d)%')
                    if ($m.Count) {
                        $pct = [double](($m[$m.Count - 1].Groups[1].Value) -replace ',','.')
                        Estado $nombre 'subiendo' $pct $i $total
                    }
                }
            } catch {}
        }
        $c.WaitForExit()

        $detalle = ''
        try { $detalle = (Get-Content -LiteralPath $salidaCurl -Raw -ErrorAction SilentlyContinue) } catch {}
        Remove-Item -LiteralPath $medidor, $salidaCurl, $cfgCurl -Force -ErrorAction SilentlyContinue

        if ($c.ExitCode -eq 0) {
            Estado $nombre 'subiendo' 100 $i $total
            Log "  $nombre publicado en Releases." 'Green'
            return $true
        }

        Log "  Error subiendo $nombre (curl codigo $($c.ExitCode))." 'Red'
        if ($detalle) {
            $resumen = ($detalle.Trim() -replace '\s+', ' ')
            Log ("  Detalle: " + $resumen.Substring(0, [Math]::Min(180, $resumen.Length))) 'Yellow'
        }
        return $false
    }

    # Respaldo puro en PowerShell si no existiera curl.exe
    try {
        Estado $nombre 'subiendo' -1 $i $total
        $headers = ApiHeaders $token
        $headers['Content-Type'] = 'application/octet-stream'
        Invoke-RestMethod -Method Post -Uri $url -Headers $headers -InFile $ruta -TimeoutSec 600 | Out-Null
        Log "  $nombre publicado en Releases." 'Green'
        return $true
    } catch {
        Log "  Error subiendo ${nombre}: $($_.Exception.Message)" 'Red'
        return $false
    }
}

# ---------------------------------------------------------------------
#  VERIFICAR GITHUB PAGES (sin gh CLI)
# ---------------------------------------------------------------------
function BloqueProyectos($html) {
    $m = [regex]::Match($html, '<script type="text/plain" id="projects-data">([\s\S]*?)</script>')
    if ($m.Success) { return ($m.Groups[1].Value -replace '\s+', ' ').Trim() }
    return ''
}

$script:SITIO = $null
function EsperarWeb($token) {
    if (-not $script:SITIO) {
        try {
            $pages = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/pages" -Headers (ApiHeaders $token) -TimeoutSec 15
            if ($pages.html_url) { $script:SITIO = $pages.html_url }
        } catch {}
        if (-not $script:SITIO) {
            $partes = $REPO.Split('/')
            $script:SITIO = "https://$($partes[0].ToLower()).github.io/$($partes[1])/"
        }
    }

    $indexPath = Join-Path $PSScriptRoot 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath)) { Online 'online'; return }

    $local  = BloqueProyectos ([IO.File]::ReadAllText($indexPath))
    Log "Esperando a que GitHub Pages muestre los cambios ($($script:SITIO))..."
    $limite = (Get-Date).AddMinutes(12)
    while ((Get-Date) -lt $limite) {
        try {
            $uri = $script:SITIO.TrimEnd('/') + '/?nc=' + [guid]::NewGuid().ToString('N')
            $r = Invoke-WebRequest -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' } -Uri $uri -TimeoutSec 15
            if ((BloqueProyectos $r.Content) -eq $local) {
                Online 'online'
                Log 'YA ESTA EN LINEA.' 'Green'
                return
            }
        } catch {}
        Start-Sleep -Seconds 10
    }
    Online 'tarde'
    Log 'GitHub Pages sigue sin mostrar los cambios (12 min). Revisa la pestaña Actions del repo.' 'Yellow'
}

# ---------------------------------------------------------------------
#  PUBLICAR PAGINA VIA GIT (maneja commits pendientes y auto-rebase)
# ---------------------------------------------------------------------
function ContarCommitsSinSubir() {
    try {
        $n = (& git rev-list --count '@{u}..HEAD' 2>$null)
        if ($n -match '^\d+$') { return [int]$n }
    } catch {}
    return 0
}

function PublicarPagina() {
    # 1) Revisar cambios nuevos en disco
    & git add -A 2>$null | Out-Null
    $grandes = (& git diff --cached --name-only 2>$null) |
               Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
               Where-Object { (Get-Item -LiteralPath $_).Length -gt ($TOPE_MB * 1MB) }

    if ($grandes) {
        Log "FRENO: archivos de mas de $TOPE_MB MB en el repo (no se sube nada):" 'Red'
        $grandes | ForEach-Object { Log ("   $_ (" + [math]::Round((Get-Item -LiteralPath $_).Length / 1MB, 1) + " MB)") 'Yellow' }
        & git reset -q
        return @{ ok = $false; publico = $false }
    }

    & git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        Log 'Guardando cambios en Git...'
        $commitOut = (& git commit -m 'Actualizacion del portafolio' 2>&1)
        if ($LASTEXITCODE -ne 0) {
            Log "Error al hacer commit: $($commitOut -join ' ')" 'Red'
            return @{ ok = $false; publico = $false }
        }
    }

    # 2) Subir si hay commits locales sin pushear (incluye intentos anteriores fallidos)
    $pendientesPush = ContarCommitsSinSubir
    if ($pendientesPush -eq 0) {
        return @{ ok = $true; publico = $false }
    }

    Log "Publicando pagina ($pendientesPush commit(s) pendiente(s))..."
    $pushOut = (& git push 2>&1)
    if ($LASTEXITCODE -eq 0) {
        Log 'Pagina publicada en GitHub.' 'Green'
        Online 'esperando'
        return @{ ok = $true; publico = $true }
    }

    # Si fallo porque el remoto tenia cambios, sincronizar con pull --rebase y reintentar
    Log 'El remoto tiene cambios nuevos, sincronizando (git pull --rebase)...' 'Yellow'
    $pullOut = (& git pull --rebase --autostash 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Log "Error al sincronizar con GitHub: $($pullOut -join ' ')" 'Red'
        & git rebase --abort 2>$null | Out-Null
        return @{ ok = $false; publico = $false }
    }

    $pushOut2 = (& git push 2>&1)
    if ($LASTEXITCODE -eq 0) {
        Log 'Pagina sincronizada y publicada en GitHub.' 'Green'
        Online 'esperando'
        return @{ ok = $true; publico = $true }
    }

    Log "No se pudo hacer git push: $($pushOut2 -join ' ')" 'Red'
    return @{ ok = $false; publico = $false }
}

# ---------------------------------------------------------------------
#  MODO SUBIR ARCHIVO SUELTO (usado por SUBIR-VIDEO.bat)
# ---------------------------------------------------------------------
if ($SubirArchivo) {
    if (-not (Test-Path -LiteralPath $SubirArchivo)) {
        Log "No existe el archivo: $SubirArchivo" 'Red'
        exit 1
    }
    $token = ValidarConexionYToken
    if (-not $token) { exit 1 }

    $relId = ObtenerReleaseId $token
    if (-not $relId) { exit 1 }

    $item   = Get-Item -LiteralPath $SubirArchivo
    $nombre = ($item.Name -replace ' ', '-')
    $rutaSubir = $item.FullName
    if ($item.Extension -match '^\.(mp4|mov|mkv|avi)$') {
        $rutaSubir = Optimizar $item.FullName $nombre 1 1
    }
    $ok = Subir $rutaSubir $nombre 1 1 $token $relId
    LimpiarEstado
    if ($ok) {
        LimpiarCacheVideo $nombre
        $urlFinal = "https://github.com/$REPO/releases/download/$TAG/$nombre"
        try { Set-Clipboard -Value $urlFinal } catch {}
        Write-Host ""
        Write-Host "URL COPIADA AL PORTAPAPELES:" -ForegroundColor Green
        Write-Host "   $urlFinal" -ForegroundColor Cyan
        exit 0
    }
    exit 1
}

# ---------------------------------------------------------------------
#  CICLO PRINCIPAL
# ---------------------------------------------------------------------
function EjecutarCiclo() {
    $flag     = Join-Path $BANDEJA '_publicar.flag'
    $pedido   = Test-Path -LiteralPath $flag
    $archivos = @()
    if (Test-Path -LiteralPath $BANDEJA) {
        $archivos = @(Get-ChildItem -LiteralPath $BANDEJA -File | Where-Object { $_.Name -notlike '_*' })
    }
    $sueltos  = [bool](& git status --porcelain 2>$null)
    $sinSubir = (ContarCommitsSinSubir) -gt 0

    if (-not $pedido -and $archivos.Count -eq 0 -and -not $sueltos -and -not $sinSubir) {
        return 'nada'
    }
    if ($pedido) { Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue }

    $todoOk        = $true
    $publicoPagina = $false
    $token         = $null

    # --- 1) Pagina primero ---
    if ($sueltos -or $sinSubir) {
        $resGit = PublicarPagina
        if (-not $resGit.ok) { $todoOk = $false }
        if ($resGit.publico) { $publicoPagina = $true }
    }

    # --- 2) Videos / archivos pesados en subir/ ---
    if ($archivos.Count -gt 0) {
        # Validar token y release ANTES de optimizar nada!
        $token = ValidarConexionYToken
        if (-not $token) {
            Estado $archivos[0].Name 'error' -1 1 $archivos.Count 'Sin autenticacion o sin internet'
            $todoOk = $false
        } else {
            $relId = ObtenerReleaseId $token
            if (-not $relId) {
                Estado $archivos[0].Name 'error' -1 1 $archivos.Count 'No se pudo abrir Release media'
                $todoOk = $false
            } else {
                $total = $archivos.Count
                for ($i = 0; $i -lt $total; $i++) {
                    $f = $archivos[$i]
                    $subirEsto = $f.FullName
                    if ($f.Extension -match '^\.(mp4|mov|mkv|avi)$') {
                        $subirEsto = Optimizar $f.FullName $f.Name ($i + 1) $total
                    }
                    if (Subir $subirEsto $f.Name ($i + 1) $total $token $relId) {
                        Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
                        LimpiarCacheVideo $f.Name
                    } else {
                        $todoOk = $false
                    }
                }
            }
        }
    }

    if ($todoOk) {
        LimpiarEstado
        if ($publicoPagina) {
            if (-not $token) { $token = ObtenerToken }
            EsperarWeb $token
        } elseif ($pedido -and (Test-Path -LiteralPath $ONLINE) -and ((Get-Content -LiteralPath $ONLINE -Raw -ErrorAction SilentlyContinue) -match 'estado=esperando')) {
            Online 'online'
        }
        Log "Todo al dia." 'Green'
        return 'ok'
    }

    return 'error'
}

# ---------------------------------------------------------------------
#  ARRANQUE
# ---------------------------------------------------------------------
if ($UnaVez) {
    $r = EjecutarCiclo
    if ($r -eq 'error') { exit 1 }
    exit 0
}

Write-Host '===========================================' -ForegroundColor Cyan
Write-Host '   PUBLICADOR DEL PORTAFOLIO - ACTIVO'      -ForegroundColor Cyan
Write-Host '===========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "Repo:    $REPO"
Write-Host "FFmpeg:  $(if ($FFMPEG) { 'OK' } else { 'No instalado (subira sin comprimir)' })"
Write-Host "Auth:    $(if (ObtenerToken) { 'OK (Git Credential Manager)' } else { 'FALTA (inicia sesion en Git)' })"
Write-Host ''
Write-Host 'Guarda en el editor y esto hace el resto.'
Write-Host 'Podes minimizar esta ventana.'
Write-Host ''

$fallos = 0
while ($true) {
    $res = EjecutarCiclo
    if ($res -eq 'error') {
        $fallos++
        $espera = [math]::Min(60, 10 * [math]::Pow(2, [math]::Min($fallos - 1, 3)))
        Log "Hubo un error. Reintentando en $espera segundos (no se re-optimizan videos ya listos)..." 'Yellow'
        $flag = Join-Path $BANDEJA '_publicar.flag'
        for ($s = 0; $s -lt $espera; $s++) {
            Start-Sleep -Seconds 1
            if (Test-Path -LiteralPath $flag) { break }
        }
    } else {
        if ($res -eq 'ok') { $fallos = 0 }
        Start-Sleep -Seconds 3
    }
}
