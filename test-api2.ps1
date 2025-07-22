[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
$url = "https://localhost:443/api/shows?owner=g.drizzle%40cap"
Write-Host "Testing URL: $url"

try {
    $webClient = New-Object System.Net.WebClient
    $response = $webClient.DownloadString($url)
    Write-Host "Success! Response:"
    Write-Host $response
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
