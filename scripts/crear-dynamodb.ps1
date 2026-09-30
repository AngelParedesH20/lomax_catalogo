. "$PSScriptRoot\env.ps1"
$tabla = "ProductosAtributos"

aws dynamodb describe-table --table-name $tabla 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host "La tabla $tabla ya existe."; exit 0 }

aws dynamodb create-table `
    --table-name $tabla `
    --attribute-definitions AttributeName=producto_id,AttributeType=S `
    --key-schema AttributeName=producto_id,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST | Out-Null

aws dynamodb describe-table --table-name $tabla `
    --query "Table.{Tabla:TableName,Estado:TableStatus,Clave:KeySchema[0].AttributeName}" --output table