# Builds the React app and publishes the floating window into plugin/window, framework-dependent
# (it needs the .NET 10 Desktop Runtime and the WebView2 runtime on the machine that runs it).
$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot 'overlay\PetOverlay.csproj'
$web = Join-Path $PSScriptRoot 'overlay\web'
$window = Join-Path $PSScriptRoot 'plugin\window'
$runtime = 'win-x64'

Push-Location $web
try {
    npm ci --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
}
finally {
    Pop-Location
}

dotnet restore $project -r $runtime
if ($LASTEXITCODE -ne 0) {
    # A broken NuGet credential provider can make dotnet restore fail; Visual Studio's MSBuild runs it fine.
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $msbuild = & $vswhere -latest -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
    if (-not $msbuild) { throw 'dotnet restore failed and no Visual Studio MSBuild was found' }
    & $msbuild $project -t:Restore "-p:RuntimeIdentifier=$runtime" -v:minimal
    if ($LASTEXITCODE -ne 0) { throw 'restore failed' }
}

if (Test-Path $window) { Remove-Item $window -Recurse -Force }
dotnet publish $project -c Release -r $runtime --self-contained false --no-restore -p:DebugType=none -p:PublishReferencesDocumentationFiles=false -o $window
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }

Write-Host "Published to $window"
