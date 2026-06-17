# Servidor local simples (sem precisar de Python/Node) - PAY4CHARGE
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8000
$prefix = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "Nao consegui iniciar o servidor na porta $port."
  Write-Host "Talvez ja exista um servidor rodando nessa porta. Feche-o e tente de novo."
  Write-Host ""
  Read-Host "Pressione Enter para sair"
  exit 1
}

Write-Host ""
Write-Host "  PAY4CHARGE - servidor local ativo"
Write-Host "  $prefix" + "index.html"
Write-Host "  Deixe esta janela aberta enquanto usa o dashboard."
Write-Host "  Para parar: feche esta janela ou pressione Ctrl+C."
Write-Host ""

# Abre o navegador UMA vez
Start-Process ($prefix + "index.html")

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
  } catch {
    break
  }
  $request  = $context.Request
  $response = $context.Response

  $path = [System.Uri]::UnescapeDataString($request.Url.LocalPath).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
  $file = Join-Path $root $path

  if (Test-Path $file -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    switch ($ext) {
      ".html" { $response.ContentType = "text/html; charset=utf-8" }
      ".css"  { $response.ContentType = "text/css; charset=utf-8" }
      ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
      ".json" { $response.ContentType = "application/json; charset=utf-8" }
      ".svg"  { $response.ContentType = "image/svg+xml" }
      ".png"  { $response.ContentType = "image/png" }
      ".ico"  { $response.ContentType = "image/x-icon" }
      default { $response.ContentType = "application/octet-stream" }
    }
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $response.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - arquivo nao encontrado: $path")
    $response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $response.OutputStream.Close()
}
