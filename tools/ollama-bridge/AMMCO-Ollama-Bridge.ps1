param(
  [string]$Model = "qwen2.5-coder:1.5b",
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Ensure-Tool {
  param([string]$Command,[string]$WingetId,[string]$DisplayName)

  $found = Get-Command $Command -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }

  Write-Host "$DisplayName is not installed." -ForegroundColor Yellow
  $answer = Read-Host "Install $DisplayName now with winget? [Y/n]"
  if ($answer -and $answer -notmatch '^[Yy]') {
    throw "$DisplayName is required."
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget was not found. Install App Installer from Microsoft Store, then run this file again."
  }

  & winget install --id $WingetId -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget could not install $DisplayName." }

  Write-Host "$DisplayName was installed. Run this file again." -ForegroundColor Green
  Read-Host "Press Enter to close"
  exit 0
}

function Get-OrCreateToken {
  $folder = Join-Path $env:LOCALAPPDATA "AMMCO"
  $path = Join-Path $folder "ollama-bridge-token.txt"

  if (Test-Path $path) {
    $existing = (Get-Content $path -Raw).Trim()
    if ($existing.Length -ge 24) { return $existing }
  }

  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }

  $token = [Convert]::ToBase64String($bytes)
  Set-Content -Path $path -Value $token -Encoding ASCII -NoNewline
  try { (Get-Item $path).Attributes = (Get-Item $path).Attributes -bor [IO.FileAttributes]::Hidden } catch {}
  return $token
}

function Test-Ollama {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 4
    return $response.StatusCode -eq 200
  } catch { return $false }
}

function Start-OllamaIfNeeded([string]$OllamaExe) {
  if (Test-Ollama) { return }

  Write-Step "Starting Ollama"
  Start-Process -FilePath $OllamaExe -ArgumentList "serve" -WindowStyle Hidden | Out-Null

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Ollama) { return }
  }

  throw "Ollama did not start on http://127.0.0.1:11434."
}

function Ensure-Model([string]$OllamaExe,[string]$ModelName) {
  Write-Step "Checking model $ModelName"
  $list = (& $OllamaExe list 2>&1 | Out-String)
  $found = $false

  foreach ($line in ($list -split '\r?\n')) {
    if ($line -match ("^" + [regex]::Escape($ModelName) + "\s")) {
      $found = $true
      break
    }
  }

  if ($found) {
    Write-Host "Model is already installed." -ForegroundColor Green
    return
  }

  $answer = Read-Host "Model $ModelName is not installed. Download it now? [Y/n]"
  if ($answer -and $answer -notmatch '^[Yy]') { throw "A local Ollama model is required." }

  & $OllamaExe pull $ModelName
  if ($LASTEXITCODE -ne 0) { throw "Could not download model $ModelName." }
}

function Read-HttpLine([System.Net.Sockets.NetworkStream]$Stream) {
  $bytes = New-Object System.Collections.Generic.List[byte]
  while ($true) {
    $b = $Stream.ReadByte()
    if ($b -lt 0) { throw "Client disconnected." }
    if ($b -eq 10) { break }
    if ($b -ne 13) { $bytes.Add([byte]$b) }
    if ($bytes.Count -gt 32768) { throw "HTTP header line is too large." }
  }
  return [Text.Encoding]::ASCII.GetString($bytes.ToArray())
}

function Read-ExactBytes([System.Net.Sockets.NetworkStream]$Stream,[int]$Count) {
  if ($Count -le 0) { return [byte[]]@() }
  $buffer = New-Object byte[] $Count
  $offset = 0
  while ($offset -lt $Count) {
    $read = $Stream.Read($buffer,$offset,$Count - $offset)
    if ($read -le 0) { throw "Client disconnected while sending request body." }
    $offset += $read
  }
  return $buffer
}

function Read-ChunkedBody([System.Net.Sockets.NetworkStream]$Stream) {
  $memory = New-Object IO.MemoryStream
  try {
    while ($true) {
      $sizeLine = Read-HttpLine $Stream
      $sizeText = ($sizeLine -split ';',2)[0].Trim()
      $size = [Convert]::ToInt32($sizeText,16)

      if ($size -eq 0) {
        while ((Read-HttpLine $Stream) -ne "") {}
        break
      }

      $chunk = Read-ExactBytes $Stream $size
      $memory.Write($chunk,0,$chunk.Length)
      [void](Read-ExactBytes $Stream 2)
    }
    return $memory.ToArray()
  } finally { $memory.Dispose() }
}

function Send-HttpResponse {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$Status,
    [string]$Reason,
    [byte[]]$Body,
    [string]$ContentType = "application/json; charset=utf-8"
  )

  if ($null -eq $Body) { $Body = [byte[]]@() }
  $crlf = [char]13 + [char]10
  $header = "HTTP/1.1 $Status $Reason$crlf" +
            "Content-Type: $ContentType$crlf" +
            "Content-Length: $($Body.Length)$crlf" +
            "Cache-Control: no-store$crlf" +
            "Connection: close$crlf$crlf"

  $headBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headBytes,0,$headBytes.Length)
  if ($Body.Length -gt 0) { $Stream.Write($Body,0,$Body.Length) }
  $Stream.Flush()
}

function Send-Json {
  param([System.Net.Sockets.NetworkStream]$Stream,[int]$Status,[string]$Reason,[string]$Json)
  Send-HttpResponse -Stream $Stream -Status $Status -Reason $Reason -Body ([Text.Encoding]::UTF8.GetBytes($Json))
}

function Start-Tunnel([string]$CloudflaredExe,[int]$BridgePort) {
  Write-Step "Starting secure HTTPS tunnel"

  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $stdout = Join-Path $env:TEMP "ammco-cloudflared-$stamp.out.log"
  $stderr = Join-Path $env:TEMP "ammco-cloudflared-$stamp.err.log"

  $process = Start-Process -FilePath $CloudflaredExe -ArgumentList @("tunnel","--url","http://127.0.0.1:$BridgePort","--no-autoupdate") -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru

  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    $text = ""
    if (Test-Path $stdout) { $text += (Get-Content $stdout -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $stderr) { $text += [Environment]::NewLine + (Get-Content $stderr -Raw -ErrorAction SilentlyContinue) }

    $match = [regex]::Match($text,'https://[a-z0-9-]+\.trycloudflare\.com','IgnoreCase')
    if ($match.Success) {
      $url = $match.Value
      break
    }

    if ($process.HasExited) { break }
  }

  if (-not $url) {
    try { if (-not $process.HasExited) { $process.Kill() } } catch {}
    $detail = ""
    if (Test-Path $stderr) { $detail = Get-Content $stderr -Raw -ErrorAction SilentlyContinue }
    throw ("Cloudflare Tunnel did not return a public URL." + [Environment]::NewLine + $detail)
  }

  return @{ Process=$process; Url=$url; Stdout=$stdout; Stderr=$stderr }
}

Add-Type -AssemblyName System.Net.Http

Write-Host ""
Write-Host "AMMCO - Local Ollama Bridge for Windows" -ForegroundColor Green
Write-Host "No Node.js. No Git. Ollama stays private on this PC." -ForegroundColor DarkGray

$ollama = Ensure-Tool -Command "ollama" -WingetId "Ollama.Ollama" -DisplayName "Ollama"
$cloudflared = Ensure-Tool -Command "cloudflared" -WingetId "Cloudflare.cloudflared" -DisplayName "cloudflared"

Start-OllamaIfNeeded $ollama
Ensure-Model -OllamaExe $ollama -ModelName $Model
$token = Get-OrCreateToken

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
$listener.Start()

$tunnel = $null
$http = [Net.Http.HttpClient]::new()
$http.Timeout = [TimeSpan]::FromMinutes(10)

try {
  $tunnel = Start-Tunnel -CloudflaredExe $cloudflared -BridgePort $Port
  $baseUrl = $tunnel.Url.TrimEnd('/')

  Write-Host ""
  Write-Host "READY" -ForegroundColor Green
  Write-Host "Keep this window open while using AI Developer." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Add these values to Vercel Preview Environment Variables:" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "AI_PROVIDER=ollama"
  Write-Host "AI_API_BASE_URL=$baseUrl/v1"
  Write-Host "AI_API_KEY=$token"
  Write-Host "AI_MODEL=$Model"
  Write-Host ""
  Write-Host "Do not share AI_API_KEY. Press Ctrl+C to stop the bridge." -ForegroundColor Yellow
  Write-Host ""

  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $null
    try {
      $client.ReceiveTimeout = 120000
      $client.SendTimeout = 120000
      $stream = $client.GetStream()

      $requestLine = Read-HttpLine $stream
      if (-not $requestLine) { continue }

      $parts = $requestLine -split ' ',3
      if ($parts.Count -lt 2) {
        Send-Json $stream 400 "Bad Request" '{"error":"BAD_REQUEST"}'
        continue
      }

      $method = $parts[0].ToUpperInvariant()
      $requestTarget = $parts[1]
      $headers = @{}

      while ($true) {
        $line = Read-HttpLine $stream
        if ($line -eq "") { break }
        $idx = $line.IndexOf(':')
        if ($idx -gt 0) {
          $name = $line.Substring(0,$idx).Trim().ToLowerInvariant()
          $value = $line.Substring($idx + 1).Trim()
          $headers[$name] = $value
        }
      }

      $uri = [Uri]("http://bridge.local" + $requestTarget)
      $path = $uri.AbsolutePath
      $allowed = $path.StartsWith("/v1/") -or $path -eq "/api/tags" -or $path -eq "/api/show"

      if (-not $allowed) {
        Send-Json $stream 404 "Not Found" '{"error":"NOT_FOUND"}'
        continue
      }

      $auth = if ($headers.ContainsKey("authorization")) { $headers["authorization"] } else { "" }
      if ($auth -ne ("Bearer " + $token)) {
        Send-Json $stream 401 "Unauthorized" '{"error":"UNAUTHORIZED"}'
        continue
      }

      $body = [byte[]]@()
      if ($headers.ContainsKey("transfer-encoding") -and $headers["transfer-encoding"].ToLowerInvariant().Contains("chunked")) {
        $body = Read-ChunkedBody $stream
      } elseif ($headers.ContainsKey("content-length")) {
        $length = [int]$headers["content-length"]
        if ($length -gt 10485760) {
          Send-Json $stream 413 "Payload Too Large" '{"error":"PAYLOAD_TOO_LARGE"}'
          continue
        }
        $body = Read-ExactBytes $stream $length
      }

      $target = "http://127.0.0.1:11434" + $uri.PathAndQuery
      $message = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($method),$target)

      if ($body.Length -gt 0 -and $method -notin @("GET","HEAD")) {
        $content = [Net.Http.ByteArrayContent]::new($body)
        if ($headers.ContainsKey("content-type")) {
          [void]$content.Headers.TryAddWithoutValidation("Content-Type",$headers["content-type"])
        } else {
          [void]$content.Headers.TryAddWithoutValidation("Content-Type","application/json")
        }
        $message.Content = $content
      }

      $response = $http.SendAsync($message).GetAwaiter().GetResult()
      $responseBody = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      $contentType = if ($response.Content.Headers.ContentType) { $response.Content.Headers.ContentType.ToString() } else { "application/json" }

      Send-HttpResponse -Stream $stream -Status ([int]$response.StatusCode) -Reason $response.ReasonPhrase -Body $responseBody -ContentType $contentType

      $message.Dispose()
      $response.Dispose()
    } catch {
      try {
        if ($stream) {
          $detail = ConvertTo-Json $_.Exception.Message -Compress
          Send-Json $stream 502 "Bad Gateway" ('{"error":"BRIDGE_ERROR","detail":' + $detail + '}')
        }
      } catch {}
    } finally {
      try { $client.Close() } catch {}
    }
  }
} finally {
  try { $listener.Stop() } catch {}
  try { $http.Dispose() } catch {}
  if ($tunnel -and $tunnel.Process) {
    try { if (-not $tunnel.Process.HasExited) { $tunnel.Process.Kill() } } catch {}
  }
}
