param(
    [Parameter(Mandatory = $true)][string]$ProductoId,
    [Parameter(Mandatory = $true)][string]$Clave,
    [string]$Bucket = "lomax-originales",
    [string]$Salida = ""
)
. "$PSScriptRoot\env.ps1"

$payload = @{ producto_id = $ProductoId; bucket = $Bucket; key = $Clave } | ConvertTo-Json -Compress
$archivoPayload = Join-Path $env:TEMP "payload-miniatura.json"
Set-Content -Path $archivoPayload -Value $payload -Encoding ascii
if (-not $Salida) { $Salida = Join-Path $env:TEMP "respuesta-miniatura.json" }

Write-Host "Payload enviado: $payload"
$meta = aws lambda invoke --function-name generar-miniatura --invocation-type RequestResponse `
    --payload "fileb://$archivoPayload" $Salida | ConvertFrom-Json

Write-Host "--- lambda invoke (transporte) ---"
$meta | ConvertTo-Json
Write-Host "--- Resultado funcional (payload de la función) ---"
Get-Content $Salida -Raw
if ($meta.FunctionError) { Write-Host "La ejecución reportó FunctionError: $($meta.FunctionError)" -ForegroundColor Red }