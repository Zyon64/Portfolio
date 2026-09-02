# =====================================================================
#  Publicador del portafolio
#  - optimiza los videos (720p, faststart) informando el avance
#  - los sube a Releases midiendo los bytes enviados de verdad
#  - publica la pagina
#  El editor lee subir\_estado.txt para dibujar la barra.
# =====================================================================
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

# ---------------------------------------------------------------------
#  UN SOLO PUBLICADOR A LA VEZ.
#  Si corren dos, se pisan: uno sube un archivo mientras el otro lo
#  borra, y el video termina desapareciendo. Paso de verdad.
# ---------------------------------------------------------------------
$CERROJO = Join-Path $PSScriptRoot '.publicador.lock'
if (Test-Path $CERROJO){
    $otro = Get-Content $CERROJO -EA SilentlyContinue | Select-Object -First 1
    if ($otro -and (Get-Process -Id $otro -EA SilentlyContinue)){
        Write-Host "Ya hay un publicador corriendo (pid $otro)."
        Write-Host "Cierro este para que no se pisen."
        Start-Sleep -Seconds 4
        exit
    }
}
$PID | Set-Content $CERROJO
Register-EngineEvent PowerShell.Exiting -Action {
    Remove-Item $CERROJO -Force -EA SilentlyContinue
} | Out-Null

$REPO    = 'Zyon64/Portfolio'
$TAG     = 'media'
$BANDEJA = Join-Path $PSScriptRoot 'subir'
$ESTADO  = Join-Path $BANDEJA '_estado.txt'
$TOPE_MB = 45

$FFMPEG  = 'C:\Users\MXD\Documents\ffmpeg-20190701-e51cc7e-win64-static\bin\ffmpeg.exe'
$FFPROBE = 'C:\Users\MXD\Documents\ffmpeg-20190701-e51cc7e-win64-static\bin\ffprobe.exe'
if (-not (Test-Path $FFMPEG))  { $FFMPEG  = 'ffmpeg' }
if (-not (Test-Path $FFPROBE)) { $FFPROBE = 'ffprobe' }

function Log($t){ Write-Host ("[{0}] {1}" -f (Get-Date -Format HH:mm:ss), $t) }

function Estado($archivo, $fase, $pct, $i, $total){
    if (-not (Test-Path $BANDEJA)) { return }
    $txt = "archivo=$archivo`nfase=$fase`npct=$([math]::Round($pct))`nindice=$i`ntotal=$total`n"
    try { [IO.File]::WriteAllText($ESTADO, $txt) } catch {}
}
function LimpiarEstado(){ if (Test-Path $ESTADO) { Remove-Item $ESTADO -Force -EA SilentlyContinue } }

# ---------------------------------------------------------------------
#  Optimizar: 720p, tope de 2 Mbps y el indice al principio del archivo
# ---------------------------------------------------------------------
function Optimizar($ruta, $nombre, $i, $total){
    # OJO: el archivo optimizado tiene que llamarse IGUAL que el original,
    # porque `gh release upload` nombra el asset segun el archivo del disco.
    # Por eso va a una subcarpeta y no a "<nombre>.opt.mp4".
    $tmpDir = Join-Path $BANDEJA '_opt'
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    $salida = Join-Path $tmpDir $nombre
    $prog   = Join-Path $BANDEJA '_ff.txt'

    $dur = 0.0
    try { $dur = [double](& $FFPROBE -v error -show_entries format=duration -of csv=p=0 $ruta) } catch {}
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
        "`"$salida`""
    )

    while (-not $p.HasExited){
        Start-Sleep -Milliseconds 700
        if (Test-Path $prog){
            try{
                $ult = Select-String -Path $prog -Pattern 'out_time_ms=(\d+)' -AllMatches |
                       Select-Object -Last 1
                if ($ult){
                    $ms  = [double]$ult.Matches[$ult.Matches.Count-1].Groups[1].Value
                    Estado $nombre 'optimizando' ([math]::Min(100, ($ms/1000000)/$dur*100)) $i $total
                }
            } catch {}
        }
    }
    Remove-Item $prog -Force -EA SilentlyContinue

    if (Test-Path $salida){
        $a = (Get-Item $ruta).Length / 1MB
        $b = (Get-Item $salida).Length / 1MB
        Log ("  {0:N0} MB -> {1:N0} MB" -f $a, $b)
        return $salida
    }
    Log "  no se pudo optimizar, se sube tal cual"
    return $ruta
}

# ---------------------------------------------------------------------
#  Subir midiendo el avance real (curl informa los bytes enviados)
# ---------------------------------------------------------------------
function Subir($ruta, $nombre, $i, $total){
    $token = (& gh auth token) 2>$null
    if (-not $token){ Log "gh no esta autenticado: corre 'gh auth login'"; return $false }

    $rel = (& gh api "repos/$REPO/releases/tags/$TAG" --jq '.id') 2>$null
    if (-not $rel){
        & gh release create $TAG --title 'Media' --notes 'Videos del portafolio.' | Out-Null
        $rel = (& gh api "repos/$REPO/releases/tags/$TAG" --jq '.id') 2>$null
    }

    # No se borra el asset viejo por adelantado: eso deja la URL rota
    # mientras dura la subida. `gh ... --clobber` ya lo reemplaza.
    $medidor = Join-Path $BANDEJA '_curl.txt'
    $url = "https://uploads.github.com/repos/$REPO/releases/$rel/assets?name=$nombre"

    Log "Subiendo $nombre ($([math]::Round((Get-Item $ruta).Length/1MB)) MB)..."
    Estado $nombre 'subiendo' 0 $i $total

    $salidaCurl = Join-Path $BANDEJA '_curl_out.txt'
    # Sin comillas puestas a mano: PowerShell escapa cada argumento solo.
    $c = Start-Process -FilePath 'curl.exe' -PassThru -NoNewWindow `
         -RedirectStandardError $medidor -RedirectStandardOutput $salidaCurl -ArgumentList @(
            '--progress-bar', '--fail', '-X', 'POST',
            '-H', "Authorization: Bearer $token",
            '-H', 'Content-Type: application/octet-stream',
            '--data-binary', "@$ruta",
            $url
         )

    while (-not $c.HasExited){
        Start-Sleep -Milliseconds 600
        try{
            $t = Get-Content $medidor -Raw -EA SilentlyContinue
            if ($t){
                $m = [regex]::Matches($t, '(\d+[\.,]\d)%')
                if ($m.Count){
                    $pct = [double](($m[$m.Count-1].Groups[1].Value) -replace ',','.')
                    Estado $nombre 'subiendo' $pct $i $total
                }
            }
        } catch {}
    }
    $detalle = ''
    try { $detalle = (Get-Content $salidaCurl -Raw -EA SilentlyContinue) } catch {}
    Remove-Item $medidor, $salidaCurl -Force -EA SilentlyContinue

    if ($c.ExitCode -eq 0){ Log "  $nombre publicado."; return $true }

    # Respaldo: gh sabe subir aunque no informe el avance
    Log "  curl fallo (codigo $($c.ExitCode)), probando con gh..."
    if ($detalle){ Log ("  respuesta: " + $detalle.Trim().Substring(0, [Math]::Min(160, $detalle.Trim().Length))) }
    Estado $nombre 'subiendo' -1 $i $total   # -1 = sin medicion

    & gh release upload $TAG $ruta --clobber 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0){ Log "  $nombre publicado (via gh)."; return $true }

    Log "  fallo la subida de $nombre, se reintenta despues."
    return $false
}

# ---------------------------------------------------------------------
Write-Host '==========================================='
Write-Host '   PUBLICADOR - ACTIVO'
Write-Host '==========================================='
Write-Host ''
Write-Host 'Guarda en el editor y esto hace el resto.'
Write-Host 'Podes minimizar esta ventana.'
Write-Host ''

while ($true){
    Start-Sleep -Seconds 3

    $flag      = Join-Path $BANDEJA '_publicar.flag'
    $pedido    = Test-Path $flag
    $archivos  = @()
    if (Test-Path $BANDEJA){
        $archivos = Get-ChildItem $BANDEJA -File |
                    Where-Object { $_.Name -notlike '_*' }
    }
    $sueltos = (& git status --porcelain) -ne $null

    if (-not $pedido -and $archivos.Count -eq 0 -and -not $sueltos){ continue }
    if ($pedido){ Remove-Item $flag -Force -EA SilentlyContinue }

    # --- 1) LA PAGINA PRIMERO ---
    # Los textos y el orden se ven enseguida; los videos van llegando.
    & git add . | Out-Null
    $grandes0 = (& git diff --cached --name-only) |
                Where-Object { Test-Path -LiteralPath $_ } |
                Where-Object { (Get-Item -LiteralPath $_).Length -gt ($TOPE_MB * 1MB) }
    if ($grandes0){
        Log "Freno: archivos de mas de $TOPE_MB MB, no se sube nada."
        $grandes0 | ForEach-Object { Write-Host "   $_" }
        & git reset -q
    } else {
        & git diff --cached --quiet
        if ($LASTEXITCODE -ne 0){
            Log 'Publicando la pagina...'
            & git commit -q -m 'Actualizacion del portafolio'
            & git push -q
            if ($LASTEXITCODE -eq 0){ Log 'Pagina publicada. Ahora van los videos.' }
        }
    }

    # --- 2) medios ---
    $total = $archivos.Count
    for ($i = 0; $i -lt $total; $i++){
        $f = $archivos[$i]
        $subirEsto = $f.FullName
        if ($f.Extension -match '^\.(mp4|mov|mkv|avi)$'){
            $subirEsto = Optimizar $f.FullName $f.Name ($i+1) $total
        }
        if (Subir $subirEsto $f.Name ($i+1) $total){
            Remove-Item $f.FullName -Force -EA SilentlyContinue
            if ($subirEsto -ne $f.FullName){ Remove-Item $subirEsto -Force -EA SilentlyContinue }
        }
    }
    LimpiarEstado

    LimpiarEstado
    Log "Todo al dia."
}
