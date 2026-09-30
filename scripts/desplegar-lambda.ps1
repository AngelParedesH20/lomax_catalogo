. "$PSScriptRoot\env.ps1"

$nombre = "generar-miniatura"
$dirFn  = (Resolve-Path (Join-Path $PSScriptRoot "..\lambda\$nombre")).Path
$rolNombre = "lambda-lomax-role"
$rolArn = "arn:aws:iam::000000000000:role/$rolNombre"
$entorno = "Variables={TABLA_ATRIBUTOS=ProductosAtributos,BUCKET_MINIATURAS=lomax-miniaturas,FLOCI_ENDPOINT=http://floci:4566}"

# 1. Dependencias y empaquetado (tar genera un zip con rutas válidas para Linux)
Push-Location $dirFn
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install falló" }
if (Test-Path function.zip) { Remove-Item function.zip }
tar -a -c -f function.zip index.js package.json node_modules
Pop-Location
$zip = Join-Path $dirFn "function.zip"
Write-Host ("Paquete: {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))

# 2. Rol de ejecución
aws iam get-role --role-name $rolNombre 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    $trust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    $trustFile = Join-Path $env:TEMP "trust-lambda.json"
    Set-Content -Path $trustFile -Value $trust -Encoding ascii
    aws iam create-role --role-name $rolNombre --assume-role-policy-document "file://$trustFile" | Out-Null
}

# 3. Crear o actualizar la función
aws lambda get-function --function-name $nombre 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Actualizando función $nombre ..."
    aws lambda update-function-code --function-name $nombre --zip-file "fileb://$zip" | Out-Null
    Start-Sleep -Seconds 3
    aws lambda update-function-configuration --function-name $nombre --timeout 30 --memory-size 512 --environment $entorno | Out-Null
} else {
    Write-Host "Creando función $nombre ..."
    aws lambda create-function --function-name $nombre --runtime nodejs22.x --handler index.handler `
        --role $rolArn --zip-file "fileb://$zip" --timeout 30 --memory-size 512 --environment $entorno | Out-Null
}

for ($i = 0; $i -lt 20; $i++) {
    $estado = aws lambda get-function-configuration --function-name $nombre --query "State" --output text
    if ($estado -eq "Active" -or $estado -eq "None") { break }
    Start-Sleep -Seconds 2
}

aws lambda get-function-configuration --function-name $nombre `
    --query "{Funcion:FunctionName,Runtime:Runtime,Estado:State,Memoria:MemorySize,Timeout:Timeout}" --output table