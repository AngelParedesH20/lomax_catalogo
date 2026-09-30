. "$PSScriptRoot\env.ps1"

foreach ($b in @("lomax-originales", "lomax-miniaturas")) {
    aws s3api head-bucket --bucket $b 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "El bucket $b ya existe."
    } else {
        aws s3api create-bucket --bucket $b | Out-Null
        Write-Host "Bucket $b creado."
    }
}
aws s3api list-buckets --query "Buckets[].Name" --output table