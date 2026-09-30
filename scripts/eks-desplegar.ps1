param([string]$Cluster = "lomax-eks")
. "$PSScriptRoot\env.ps1"
$raiz = (Resolve-Path "$PSScriptRoot\..").Path
$ev = Join-Path $raiz "evidencias\E7"
New-Item -ItemType Directory -Force -Path $ev | Out-Null
$nodo = "floci-eks-lomax-eks"
$version = "1.0.0-39befa1"
$ipReg = IpDe "floci-ecr-registry"
Write-Host "Registro ECR (IP en lomax-net): $ipReg"
foreach ($n in @("lomax-backend", "lomax-frontend")) {
    $ref = "${ipReg}:5000/${n}:$version"
    docker exec $nodo ctr --address /run/k3s/containerd/containerd.sock -n k8s.io images pull --plain-http $ref | Tee-Object "$ev\pull-en-nodo-$n.txt"
}

function IpDe($contenedor) {
    $redes = (docker inspect $contenedor | Out-String | ConvertFrom-Json)[0].NetworkSettings.Networks
    if ($redes.'lomax-net') { return $redes.'lomax-net'.IPAddress }
    return ($redes.PSObject.Properties | Select-Object -First 1).Value.IPAddress
}

# Version de las imagenes publicadas en ECR
$version = $env:IMAGE_VERSION
if (-not $version) {
    $version = ((Get-Content "$raiz\evidencias\E6\version.txt" | Where-Object { $_ -like "version=*" }) -split "=")[1]
}
Write-Host "Version de imagenes: $version"

# 1. Rol y cluster EKS
aws iam get-role --role-name eks-role 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    $trust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"eks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    $f = Join-Path $env:TEMP "trust-eks.json"
    Set-Content -Path $f -Value $trust -Encoding ascii
    aws iam create-role --role-name eks-role --assume-role-policy-document "file://$f" | Out-Null
}
aws eks describe-cluster --name $Cluster 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    $subnet = aws ec2 describe-subnets --query "Subnets[0].SubnetId" --output text
    if (-not $subnet -or $subnet -eq "None") {
        $vpc = aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query "Vpc.VpcId" --output text
        $subnet = aws ec2 create-subnet --vpc-id $vpc --cidr-block 10.0.1.0/24 --query "Subnet.SubnetId" --output text
    }
    Write-Host "Subred: $subnet"
    aws eks create-cluster --name $Cluster --role-arn arn:aws:iam::000000000000:role/eks-role --resources-vpc-config "subnetIds=$subnet" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "No se pudo crear el cluster." -ForegroundColor Red; return }
}
for ($i = 0; $i -lt 40; $i++) {
    $estado = aws eks describe-cluster --name $Cluster --query "cluster.status" --output text 2>$null
    Write-Host "  estado del cluster: $estado"
    if ($estado -eq "ACTIVE") { break }
    if ([string]::IsNullOrWhiteSpace($estado)) { Write-Host "El cluster no existe." -ForegroundColor Red; return }
    Start-Sleep -Seconds 5
}
aws eks describe-cluster --name $Cluster --query "cluster.{Nombre:name,Estado:status,Version:version}" --output table | Tee-Object "$ev\cluster.txt"

# 2. kubeconfig desde el nodo k3s
for ($i = 0; $i -lt 60; $i++) {
    docker exec $nodo test -f /etc/rancher/k3s/k3s.yaml 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
}
$puerto = ((docker port $nodo 6443 | Select-Object -First 1) -split ":")[-1].Trim()
$yaml = docker exec $nodo cat /etc/rancher/k3s/k3s.yaml
$yaml = $yaml -replace "https://127.0.0.1:6443", "https://127.0.0.1:$puerto"
$kc = Join-Path $raiz "k8s\kubeconfig"
$yaml | Set-Content $kc -Encoding ascii
$env:KUBECONFIG = $kc
for ($i = 0; $i -lt 40; $i++) {
    kubectl get nodes 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
}
kubectl get nodes -o wide | Tee-Object "$ev\nodos.txt"

# 3. Red compartida y descarga de imagenes desde ECR dentro del nodo
docker network connect lomax-net $nodo 2>$null
docker network connect lomax-net floci-ecr-registry 2>$null
$ipFloci = IpDe "floci"
Write-Host "IP de Floci en lomax-net: $ipFloci"
foreach ($n in @("lomax-backend", "lomax-frontend")) {
    $ref = "floci-ecr-registry:5000/${n}:$version"
    Write-Host "El nodo EKS descarga desde ECR: $ref"
    docker exec $nodo k3s ctr -n k8s.io images pull --plain-http $ref | Tee-Object "$ev\pull-en-nodo-$n.txt"
}

# 4. Manifiesto con las referencias reales
$m = Get-Content "$raiz\k8s\lomax.yaml" -Raw
$m = $m.Replace("__FLOCI_IP__", $ipFloci)
$m = $m.Replace("__BACKEND_IMAGE__", "floci-ecr-registry:5000/lomax-backend:$version")
$m = $m.Replace("__FRONTEND_IMAGE__", "floci-ecr-registry:5000/lomax-frontend:$version")
$gen = Join-Path $raiz "k8s\lomax.generado.yaml"
Set-Content -Path $gen -Value $m -Encoding ascii
kubectl apply -f $gen | Tee-Object "$ev\apply.txt"
kubectl -n lomax rollout status deployment/backend --timeout=240s
kubectl -n lomax rollout status deployment/frontend --timeout=240s
kubectl -n lomax rollout status deployment/proxy --timeout=240s
kubectl -n lomax get pods -o wide | Tee-Object "$ev\pods.txt"