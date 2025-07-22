$url = "https://localhost:443/api/shows?owner=g.drizzle%40cap"
Write-Host "Testing URL: $url"

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -SkipCertificateCheck
    Write-Host "Success! Response:"
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
