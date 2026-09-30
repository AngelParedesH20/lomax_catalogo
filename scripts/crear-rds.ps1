. "$PSScriptRoot\env.ps1"

aws rds describe-db-instances --db-instance-identifier $env:DB_ID 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "La instancia $env:DB_ID ya existe, no se crea de nuevo."
} else {
    Write-Host "Creando instancia RDS PostgreSQL $env:DB_ID ..."
    aws rds create-db-instance `
        --db-instance-identifier $env:DB_ID `
        --engine postgres `
        --db-instance-class db.t3.micro `
        --allocated-storage 20 `
        --master-username $env:DB_USER `
        --master-user-password $env:DB_PASSWORD `
        --db-name $env:DB_NAME | Out-Null
}

do {
    Start-Sleep -Seconds 3
    $estado = aws rds describe-db-instances --db-instance-identifier $env:DB_ID --query "DBInstances[0].DBInstanceStatus" --output text
    Write-Host "  estado: $estado"
} while ($estado -ne "available")

aws rds describe-db-instances --db-instance-identifier $env:DB_ID `
    --query "DBInstances[0].{Estado:DBInstanceStatus,Motor:Engine,BD:DBName,Host:Endpoint.Address,Puerto:Endpoint.Port}" --output table