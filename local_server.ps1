$http = [System.Net.HttpListener]::new()
$http.Prefixes.Add("http://localhost:8000/")
try {
    $http.Start()
} catch {
    write-error "Failed to start listener: $_"
    exit 1
}
write-host "Listening on http://localhost:8000/..."
while ($http.IsListening) {
    try {
        $context = $http.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        # Decode URI to support Arabic characters in path
        $decodedPath = [System.Uri]::UnescapeDataString($path)
        
        $localPath = Join-Path (Get-Location) $decodedPath.TrimStart('/')

        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            # Content types
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = "text/html; charset=utf-8"
            if ($ext -eq ".css") { $contentType = "text/css" }
            elseif ($ext -eq ".js") { $contentType = "application/javascript; charset=utf-8" }
            elseif ($ext -eq ".png") { $contentType = "image/png" }
            elseif ($ext -eq ".jpg" -or $ext -eq ".jpeg") { $contentType = "image/jpeg" }
            elseif ($ext -eq ".svg") { $contentType = "image/svg+xml" }
            elseif ($ext -eq ".icon" -or $ext -eq ".ico") { $contentType = "image/x-icon" }

            $response.ContentType = $contentType
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
        }
        $response.Close()
    } catch {
        write-warning "Request Error: $_"
    }
}
