param([switch]$PermitirCambios)
. "$PSScriptRoot\env.ps1"
$raiz = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $raiz
$ev = Join-Path $raiz "evidencias\E6"
New-Item -ItemType Directory -Force -Path $ev | Out-Null

# 1. Version = commit de entrega
$sucio = git status --porcelain -- backend frontend proxy lambda db compose.yaml
if ($sucio -and -not $PermitirCambios) {
    Write-Host "Hay cambios de codigo sin commit. Haga commit primero (la version es el hash del commit)." -ForegroundColor Yellow
    git status --short -- backend frontend proxy lambda db compose.yaml
    return
}
$sha = (git rev-parse --short HEAD).Trim()
$version = "1.0.0-$sha"
Write-Host "Version de las imagenes: $version (commit $sha)"

# 2. Repositorios ECR
$repos = @{}
foreach ($nombre in @("lomax-backend", "lomax-frontend")) {
    aws ecr describe-repositories --repository-names $nombre 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        aws ecr create-repository --repository-name $nombre | Out-Null
        Write-Host "Repositorio $nombre creado."
    } else {
        Write-Host "Repositorio $nombre ya existe."
    }
    $repos[$nombre] = (aws ecr describe-repositories --repository-names $nombre --query "repositories[0].repositoryUri" --output text).Trim()
}
$repos | ConvertTo-Json | Set-Content "$ev\repositorios.json" -Encoding ascii
Write-Host "repositoryUri backend : $($repos['lomax-backend'])"
Write-Host "repositoryUri frontend: $($repos['lomax-frontend'])"

# 3. Registro respaldo publicado en el host (Docker Desktop no resuelve *.localhost)
$mapeo = docker port floci-ecr-registry 5000/tcp | Select-Object -First 1
if (-not $mapeo) { Write-Host "No existe el contenedor floci-ecr-registry." -ForegroundColor Red; return }
$puerto = ($mapeo -split ":")[-1].Trim()
$directo = "localhost:$puerto"
Write-Host "Registro publicado en el host: $directo"

# 4. Autenticacion (token ECR; el registro emulado no exige credenciales)
$token = aws ecr get-login-password
$token | docker login --username AWS --password-stdin $directo

# 5. Build, tag y push
$refB = "$($repos['lomax-backend']):$version"
$refF = "$($repos['lomax-frontend']):$version"
docker build --provenance=false -t $refB backend
docker build --provenance=false -t $refF frontend
$dirB = "$directo/lomax-backend:$version"
$dirF = "$directo/lomax-frontend:$version"
docker tag $refB $dirB
docker tag $refF $dirF
docker push $dirB | Tee-Object "$ev\push-backend.txt"
if ($LASTEXITCODE -ne 0) { Write-Host "Fallo el push del backend." -ForegroundColor Red; return }
docker push $dirF | Tee-Object "$ev\push-frontend.txt"
if ($LASTEXITCODE -ne 0) { Write-Host "Fallo el push del frontend." -ForegroundColor Red; return }

# 6. Consulta: API de ECR y contenido del registro
foreach ($n in @("lomax-backend", "lomax-frontend")) {
    aws ecr list-images --repository-name $n | Tee-Object "$ev\list-images-$n.json"
    aws ecr describe-images --repository-name $n | Tee-Object "$ev\describe-images-$n.json"
    curl.exe -s "http://$directo/v2/$n/tags/list" | Tee-Object "$ev\registro-tags-$n.json"
    Write-Host ""
}
curl.exe -s "http://$directo/v2/_catalog" | Tee-Object "$ev\registro-catalogo.json"
Write-Host ""

# 7. Referencias para los siguientes pasos
$env:BACKEND_IMAGE = $dirB
$env:FRONTEND_IMAGE = $dirF
$env:BACKEND_ECR_URI = $refB
$env:FRONTEND_ECR_URI = $refF
$env:IMAGE_VERSION = $version
@("version=$version", "commit=$sha", "backend=$dirB", "frontend=$dirF", "backend_ecr_uri=$refB", "frontend_ecr_uri=$refF") |
    Set-Content "$ev\version.txt" -Encoding ascii
Write-Host "Backend : $dirB"
Write-Host "Frontend: $dirF"