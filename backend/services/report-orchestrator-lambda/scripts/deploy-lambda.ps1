[CmdletBinding()]
param(
  [string]$FunctionName = "hyper-intern-m1c-orchestrator-lambda",
  [string]$Region = "ap-northeast-2",
  [string]$OutputZip = "..\..\..\dist\orchestrator-lambda.zip",
  [switch]$PackageOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$serviceRoot = Split-Path -Parent $scriptDir
$repoRoot = Resolve-Path (Join-Path $serviceRoot "..\..\..")
$outputZipPath = [System.IO.Path]::GetFullPath((Join-Path $serviceRoot $OutputZip))
$outputZipDir = Split-Path -Parent $outputZipPath

function Invoke-CmdCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [string]$CommandLine
  )

  Write-Host "==> $Description"
  & $env:ComSpec /d /s /c $CommandLine
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

Push-Location $serviceRoot
try {
  Write-Host "==> Cleaning node_modules and dist"
  Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue

  Invoke-CmdCommand -Description "Installing dependencies" -CommandLine "npm.cmd ci --cache .npm-cache"
  Invoke-CmdCommand -Description "Building TypeScript output" -CommandLine "npm.cmd run build"

  $requiredArtifacts = @(
    "dist\lambda-handler.js",
    "dist\shared\catalog_discovered.json",
    "dist\shared\reporting_policy.json"
  )
  foreach ($artifact in $requiredArtifacts) {
    if (-not (Test-Path (Join-Path $serviceRoot $artifact))) {
      throw "Expected build artifact '$artifact' was not created."
    }
  }

  Write-Host "==> Reinstalling production-only dependencies"
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  Invoke-CmdCommand -Description "Installing production dependencies" -CommandLine "npm.cmd ci --omit=dev --cache .npm-cache"

  New-Item -ItemType Directory -Force -Path $outputZipDir | Out-Null
  if (Test-Path $outputZipPath) {
    Remove-Item $outputZipPath -Force
  }

  $distEntries = @(Get-ChildItem -Path (Join-Path $serviceRoot "dist") -Force)
  if ($distEntries.Count -eq 0) {
    throw "The dist directory is empty; refusing to create a deployment archive."
  }

  $archiveInputs = @($distEntries.FullName) + @(
    (Join-Path $serviceRoot "node_modules"),
    (Join-Path $serviceRoot "package.json")
  )

  Write-Host "==> Creating deployment archive at $outputZipPath"
  Compress-Archive -Path $archiveInputs -DestinationPath $outputZipPath

  if ($PackageOnly) {
    Write-Host "==> Package ready: $outputZipPath"
    return
  }

  Push-Location $repoRoot
  try {
    Invoke-CmdCommand -Description "Updating Lambda function code" -CommandLine "aws lambda update-function-code --function-name $FunctionName --zip-file fileb://dist/orchestrator-lambda.zip --region $Region"
    Invoke-CmdCommand -Description "Waiting for Lambda update to finish" -CommandLine "aws lambda wait function-updated --function-name $FunctionName --region $Region"
  }
  finally {
    Pop-Location
  }

  Write-Host "==> Lambda deployment finished successfully"
}
finally {
  Pop-Location
}
