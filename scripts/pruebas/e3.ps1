. "$PSScriptRoot\..\env.ps1"
$raiz = (Resolve-Path "$PSScriptRoot\..\..").Path
$ev = Join-Path $raiz "evidencias\E3"
New-Item -ItemType Directory -Force -Path $ev | Out-Null
Start-Transcript -Path (Join-Path $ev "e3-transcripcion.txt") -Force | Out-Null
$invocar = Join-Path $PSScriptRoot "..\invocar-miniatura.ps1"

$idJpeg      = "a0000000-0000-4000-8000-000000000001"   # TEC-001
$idInvalido  = "a0000000-0000-4000-8000-000000000002"   # TEC-002
$idPng       = "a0000000-0000-4000-8000-000000000003"   # TEC-003
$idGrande    = "a0000000-0000-4000-8000-000000000004"   # TEC-004

Write-Host "`n===== 1. JPEG valido 1200x800 (TEC-001) ====="
aws s3 cp "$raiz\seed\pruebas\original-1200x800.jpg" "s3://lomax-originales/originales/$idJpeg.jpg"
& $invocar -ProductoId $idJpeg -Clave "originales/$idJpeg.jpg" -Salida "$ev\invoke-jpeg.json"

Write-Host "`n===== 2. Listado, get-object, dimensiones y referencia en DynamoDB ====="
aws s3 ls s3://lomax-originales/originales/
aws s3 ls s3://lomax-miniaturas/miniaturas/
aws s3api get-object --bucket lomax-originales --key "originales/$idJpeg.jpg" "$ev\original-descargado.jpg"
aws s3api get-object --bucket lomax-miniaturas --key "miniaturas/$idJpeg.jpg" "$ev\miniatura-descargada.jpg"
node "$PSScriptRoot\e3-verificar.js" $idJpeg "$ev\original-descargado.jpg" "$ev\miniatura-descargada.jpg"
aws dynamodb get-item --table-name ProductosAtributos --key "producto_id={S=$idJpeg}" --output json

Write-Host "`n===== 3. Repetir la invocacion (misma imagen): sin objetos extra ====="
$antes = aws s3api list-objects-v2 --bucket lomax-miniaturas --prefix miniaturas/ --query "length(Contents)"
& $invocar -ProductoId $idJpeg -Clave "originales/$idJpeg.jpg" -Salida "$ev\invoke-jpeg-repetido.json"
$despues = aws s3api list-objects-v2 --bucket lomax-miniaturas --prefix miniaturas/ --query "length(Contents)"
aws s3 ls s3://lomax-miniaturas/miniaturas/
Write-Host "Objetos en miniaturas/ -> antes: $antes | despues: $despues (deben ser iguales)"

Write-Host "`n===== 4. PNG valido (TEC-003) ====="
aws s3 cp "$raiz\seed\pruebas\png-valido.png" "s3://lomax-originales/originales/$idPng.png"
& $invocar -ProductoId $idPng -Clave "originales/$idPng.png" -Salida "$ev\invoke-png.json"
aws s3api get-object --bucket lomax-originales --key "originales/$idPng.png" "$ev\original-png-descargado.png" | Out-Null
aws s3api get-object --bucket lomax-miniaturas --key "miniaturas/$idPng.jpg" "$ev\miniatura-png-descargada.jpg" | Out-Null
node "$PSScriptRoot\e3-verificar.js" $idPng "$ev\original-png-descargado.png" "$ev\miniatura-png-descargada.jpg"

Write-Host "`n===== 5. Archivo invalido (TEC-002): estado ERROR y sin miniatura ====="
aws s3 cp "$raiz\seed\pruebas\invalido.jpg" "s3://lomax-originales/originales/$idInvalido.jpg"
& $invocar -ProductoId $idInvalido -Clave "originales/$idInvalido.jpg" -Salida "$ev\invoke-invalido.json"
aws dynamodb get-item --table-name ProductosAtributos --key "producto_id={S=$idInvalido}" `
    --query "Item.{estado:estado_procesamiento.S,motivo:error_procesamiento.S,miniatura_key:miniatura_key,original:imagen_original_key.S}" --output json
$r = aws s3api head-object --bucket lomax-miniaturas --key "miniaturas/$idInvalido.jpg" 2>&1 | Out-String
Write-Host $r
Write-Host "Codigo de salida de head-object: $LASTEXITCODE (distinto de 0 = la miniatura NO existe, como se espera)"

Write-Host "`n===== 6. Archivo de mas de 5 MB (TEC-004) ====="
aws s3 cp "$raiz\seed\pruebas\grande-6mb.jpg" "s3://lomax-originales/originales/$idGrande.jpg"
& $invocar -ProductoId $idGrande -Clave "originales/$idGrande.jpg" -Salida "$ev\invoke-grande.json"
aws dynamodb get-item --table-name ProductosAtributos --key "producto_id={S=$idGrande}" `
    --query "Item.{estado:estado_procesamiento.S,motivo:error_procesamiento.S,miniatura_key:miniatura_key}" --output json

Write-Host "`n===== 7. Reintento de TEC-002 con una imagen valida ====="
aws s3 cp "$raiz\seed\pruebas\original-1200x800.jpg" "s3://lomax-originales/originales/$idInvalido.jpg"
& $invocar -ProductoId $idInvalido -Clave "originales/$idInvalido.jpg" -Salida "$ev\invoke-reintento.json"
aws dynamodb get-item --table-name ProductosAtributos --key "producto_id={S=$idInvalido}" `
    --query "Item.{estado:estado_procesamiento.S,motivo:error_procesamiento,miniatura_key:miniatura_key.S}" --output json

Write-Host "`n===== 8. Estado final de los buckets ====="
aws s3 ls s3://lomax-originales/originales/
aws s3 ls s3://lomax-miniaturas/miniaturas/

Stop-Transcript | Out-Null