try { 
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8 
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
} catch {}

$env:AWS_ENDPOINT_URL      = "http://localhost:4566"
$env:AWS_DEFAULT_REGION    = "us-east-1"
$env:AWS_ACCESS_KEY_ID     = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"

# RDS (solo entorno local)
$env:DB_ID       = "lomax-db"
$env:DB_NAME     = "lomax"
$env:DB_USER     = "lomax_admin"
$env:DB_PASSWORD = "LomaxAdmin2026"
$env:DB_HOST     = "localhost"
$env:DB_PORT     = "7001"

Write-Host "Entorno listo -> $env:AWS_ENDPOINT_URL | RDS $($env:DB_HOST):$($env:DB_PORT)"