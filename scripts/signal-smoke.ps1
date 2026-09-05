[CmdletBinding()]
param(
  [string]$BaseUrl = 'https://life-site-dashboard-staging-708819606972.europe-west2.run.app'
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

function Get-ErrorBody {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)
  if ($ErrorRecord.ErrorDetails.Message) { return $ErrorRecord.ErrorDetails.Message }
  $response = $ErrorRecord.Exception.Response
  if ($response -and $response.Content) {
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ($body) { return $body }
  }
  if ($response -and $response.GetResponseStream) {
    $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  }
  return $ErrorRecord.Exception.Message
}

function Invoke-SignalSmokeRequest {
  param(
    [string]$Step,
    [string]$Uri,
    [string]$Method = 'GET',
    [hashtable]$Headers,
    [object]$Body
  )
  try {
    $params = @{ Uri = $Uri; Method = $Method; ErrorAction = 'Stop' }
    if ($Headers) { $params.Headers = $Headers }
    if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = ($Body | ConvertTo-Json -Compress) }
    return Invoke-RestMethod @params
  } catch {
    Write-Host "HTTP error during ${Step}:`n$(Get-ErrorBody $_)"
    throw "HTTP request failed during $Step."
  }
}

$outcome = ''
try {
  $health = Invoke-SignalSmokeRequest -Step 'health check' -Uri "$base/api/health"
  if ($health.status -ne 'ok') { Write-Host ($health | ConvertTo-Json -Compress); throw "health check returned status '$($health.status)'" }

  $credential = Get-Credential -Message 'Dashboard login'
  $password = $credential.GetNetworkCredential().Password
  $login = Invoke-SignalSmokeRequest -Step 'dashboard login' -Uri "$base/api/auth/login" -Method POST -Body @{ username = $credential.UserName; password = $password }
  $password = $null
  if (-not $login.token) { throw 'dashboard login returned no token.' }
  $dashboardAuth = @{ Authorization = "Bearer $($login.token)" }

  $captureSecureToken = Read-Host 'Signal capture bearer token' -AsSecureString
  $captureToken = [System.Net.NetworkCredential]::new('', $captureSecureToken).Password
  if (-not $captureToken) { throw 'Signal capture bearer token was empty.' }
  $captureAuth = @{ Authorization = "Bearer $captureToken" }
  $capture = Invoke-SignalSmokeRequest -Step 'Signal capture' -Uri "$base/api/actions/signal-captures" -Method POST -Headers $captureAuth -Body @{
    rawText = 'Reference note: the city library catalogue explains how to renew a borrowed book online.'
    sourceType = 'paste'
    sourceTitle = 'Signal smoke test reference'
    capturedAt = [DateTime]::UtcNow.ToString('o')
  }
  $captureToken = $null
  $captureSecureToken.Dispose()
  $captureId = $capture.data.captureId
  if (-not $captureId) { throw 'Signal capture returned no captureId.' }
  Write-Host "Capture: $captureId"

  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  $item = $null
  do {
    $queue = Invoke-SignalSmokeRequest -Step 'Signal review queue' -Uri "$base/api/signal/items?limit=100" -Headers $dashboardAuth
    foreach ($entry in @($queue.data)) {
      if ($entry.entryType -ne 'item') { continue }
      $candidate = $entry.item
      if ($candidate.captureId -eq $captureId) { $item = $candidate; break }
    }
    if ($item) { break }
    Start-Sleep -Seconds 3
  } while ([DateTime]::UtcNow -lt $deadline)
  if (-not $item) { throw "no review item for capture $captureId after 60 seconds." }

  Write-Host "Item: $($item.id) type: $($item.type)"
  if ($item.type -ne 'information') { throw "expected information item, got '$($item.type)'." }
  $kept = Invoke-SignalSmokeRequest -Step 'Signal Keep' -Uri "$base/api/signal/items/$($item.id)/keep" -Method POST -Headers $dashboardAuth
  if ($kept.data.dispatchStatus -ne 'succeeded' -or -not $kept.data.destinationId) { Write-Host ($kept.data | ConvertTo-Json -Compress); throw 'Signal Keep did not complete dispatch.' }
  $outcome = "PASS: capture=$captureId item=$($item.id) dispatchStatus=$($kept.data.dispatchStatus) destinationId=$($kept.data.destinationId)"
} catch {
  $outcome = "FAIL: $($_.Exception.Message -replace '\r?\n', ' ')"
} finally {
  $password = $null
  $captureToken = $null
  $credential = $null
  $login = $null
  Write-Host $outcome
}

if ($outcome -like 'FAIL:*') { exit 1 }
