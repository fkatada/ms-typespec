# Use case:
#
# The purpose of this script is to compact the steps required to regenerate TypeSpec into a single script.
#
param (
  [int] $Parallelization = [Environment]::ProcessorCount
)


$ExitCode = 0

if ($Parallelization -lt 1) {
  $Parallelization = 1
}

Write-Host "Parallelization: $Parallelization"


$generateScript = {
  $tspFile = $_

  if ((($tspFile -match "payload[\\/]pageable[\\/]main\.tsp") -and (-not ($tspFile -match "azure[\\/]payload[\\/]pageable[\\/]main\.tsp"))) -or ($tspFile -match "payload[\\/]xml[\\/]main\.tsp")) {
    Write-Host "
    SKIPPED
    $tspFile
    "
    # xml is not supported
    # nested pageItems/nextLink/continuationToken is not supported
    return
  }

  $tspClientFile = $tspFile -replace 'main.tsp', 'client.tsp'
  if (($tspClientFile -match 'client.tsp$') -and (Test-Path $tspClientFile)) {
    $tspFile = $tspClientFile
  }

  # With TypeSpec code generation being parallelized, we need to make sure that the output directory is unique
  # for each test run. We do this by appending a random number to the output directory.
  # Without this, we could have multiple runs trying to write to the same directory which introduces race conditions.
  $tspOptions = "--option ""@typespec/http-client-java.emitter-output-dir={project-root}/tsp-output/$(Get-Random)"""
  if ($tspFile -match "type[\\/]enum[\\/]extensible[\\/]") {
    # override namespace for reserved keyword "enum"
    $tspOptions += " --option ""@typespec/http-client-java.namespace=type.enums.extensible"""
  } elseif ($tspFile -match "type[\\/]enum[\\/]fixed[\\/]") {
    # override namespace for reserved keyword "enum"
    $tspOptions += " --option ""@typespec/http-client-java.namespace=type.enums.fixed"""
  } elseif ($tspFile -match "client[\\/]namespace[\\/]") {
    # specify the namespace, but @clientNamespace in client.tsp should take precedence
    $tspOptions += " --option ""@typespec/http-client-java.namespace=client.clientnamespace"""
  } elseif ($tspFile -match "azure[\\/]example[\\/]basic[\\/]") {
    # override examples-dir
    $tspOptions += " --option ""@typespec/http-client-java.examples-dir={project-root}/specs/azure/example/basic/examples"""
  } elseif ($tspFile -match "azure[\\/]client-generator-core[\\/]client-initialization[\\/]") {
    $tspOptions += " --option ""@typespec/http-client-java.enable-subclient=true"""
  } elseif ($tspFile -match "resiliency[\\/]srv-driven[\\/]old\.tsp") {
    # override namespace for "resiliency/srv-driven/old.tsp" (make it different to that from "main.tsp")
    $tspOptions += " --option ""@typespec/http-client-java.namespace=resiliency.servicedriven.v1"""
    # enable advanced versioning for resiliency test
    $tspOptions += " --option ""@typespec/http-client-java.advanced-versioning=true"""
    $tspOptions += " --option ""@typespec/http-client-java.api-version=all"""
  } elseif ($tspFile -match "resiliency[\\/]srv-driven[\\/]main\.tsp") {
    # enable advanced versioning for resiliency test
    $tspOptions += " --option ""@typespec/http-client-java.advanced-versioning=true"""
    $tspOptions += " --option ""@typespec/http-client-java.api-version=all"""
  } elseif ($tspFile -match "azure[\\/]resource-manager[\\/].*[\\/]main\.tsp") {
    # for mgmt, do not generate tests due to random mock values
    $tspOptions += " --option ""@typespec/http-client-java.generate-tests=false"""
    # also generate with group-etag-headers=false since mgmt doesn't support etag grouping yet
    $tspOptions += " --option ""@typespec/http-client-java.group-etag-headers=false"""
  } elseif ($tspFile -match "tsp[\\/]versioning.tsp") {
    # test generating from specific api-version
    $tspOptions += " --option ""@typespec/http-client-java.api-version=2022-09-01"""
    # exclude preview from service versions
    $tspOptions += " --option ""@typespec/http-client-java.service-version-exclude-preview=true"""
  } elseif ($tspFile -match "tsp[\\/]error.tsp") {
    # test for default-http-exception-type
    $tspOptions += " --option ""@typespec/http-client-java.use-default-http-status-code-to-exception-type-mapping=false"""
  } elseif ($tspFile -match "type[\\/]array" -or $tspFile -match "type[\\/]dictionary") {
    # TODO https://github.com/Azure/autorest.java/issues/2964
    # also serve as a test for "use-object-for-unknown" emitter option
    $tspOptions += " --option ""@typespec/http-client-java.use-object-for-unknown=true"""
  } elseif ($tspFile -match "arm.tsp") {
    # for mgmt, do not generate tests due to random mock values
    $tspOptions += " --option ""@typespec/http-client-java.generate-tests=false"""
    # test service-name
    $tspOptions += " --option ""@typespec/http-client-java.service-name=Arm Resource Provider"""
    # also test generating from specific api-version
    $tspOptions += " --option ""@typespec/http-client-java.api-version=2023-11-01"""
    # exclude preview from service versions
    $tspOptions += " --option ""@typespec/http-client-java.service-version-exclude-preview=true"""
    # rename model
    $tspOptions += " --option ""@typespec/http-client-java.rename-model=TopLevelArmResourceListResult:ResourceListResult,CustomTemplateResourcePropertiesAnonymousEmptyModel:AnonymousEmptyModel"""
    # remove inner
    $tspOptions += " --option ""@typespec/http-client-java.remove-inner=NginxConfigurationResponse"""
    # generate async methods
    $tspOptions += " --option ""@typespec/http-client-java.generate-async-methods=true"""
  } elseif ($tspFile -match "arm-stream-style-serialization.tsp") {
    # for mgmt, do not generate tests due to random mock values
    $tspOptions += " --option ""@typespec/http-client-java.generate-tests=false"""
    # test service-name
    $tspOptions += " --option ""@typespec/http-client-java.service-name=Arm Resource Provider"""
  } elseif ($tspFile -match "subclient.tsp") {
    $tspOptions += " --option ""@typespec/http-client-java.enable-subclient=true"""
    # test for include-api-view-properties
    $tspOptions += " --option ""@typespec/http-client-java.include-api-view-properties=false"""
  }

  # Test customization for one of the TypeSpec definitions - naming.tsp
  if ($tspFile -match "tsp[\\/]naming.tsp$") {
    # Test for rename-model
    $tspOptions += " --option ""@typespec/http-client-java.rename-model=RunObjectLastError1:RunObjectLastErrorRenamed,RunObjectLastErrorCode:RunObjectLastErrorCodeRenamed"""
    # Add the customization-class option for Java emitter
    $tspOptions += " --option ""@typespec/http-client-java.customization-class=../../customization/src/main/java/CustomizationTest.java"""
  }

  # Test customization using only JavaParser for one of the TypeSpec definitions - naming-javaparser.tsp
  if ($tspFile -match "tsp[\\/]naming-javaparser.tsp$") {
    # Add the customization-class option for Java emitter
    $tspOptions += " --option ""@typespec/http-client-java.customization-class=../../customization/src/main/java/JavaParserCustomizationTest.java"""
  }

  $tspTrace = "--trace import-resolution --trace projection --trace http-client-java"
  $tspCommand = "npx --no-install tsp compile $tspFile $tspOptions $tspTrace"

  # output of "tsp compile" seems trigger powershell error or exit, hence the "2>&1"
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $generateOutput = Invoke-Expression $tspCommand 2>&1
  $timer.Stop()

  $global:ExitCode = $global:ExitCode -bor $LASTEXITCODE

  if ($LASTEXITCODE -ne 0) {
    Write-Host "
    ========================
    $tspCommand
    ========================
    FAILED (Time elapsed: $($timer.ToString()))
    $([String]::Join("`n", $generateOutput))
    "
  } else {
    Write-Host "
    ========================
    $tspCommand
    ========================
    SUCCEEDED (Time elapsed: $($timer.ToString()))
    "
  }

  if ($global:ExitCode -ne 0) {
    throw "Failed to generate from tsp $tspFile"
  }
}

Push-Location $PSScriptRoot
try {
  ./Setup.ps1

  New-Item -Path ./existingcode/src/main/java/tsptest -ItemType Directory -Force | Out-Null

  if (Test-Path ./src/main/java/tsptest/partialupdate) {
    Copy-Item -Path ./src/main/java/tsptest/partialupdate -Destination ./existingcode/src/main/java/tsptest/partialupdate -Recurse -Force
  }

  if (Test-Path ./src/main) {
    Remove-Item ./src/main -Recurse -Force
  }
  if (Test-Path ./src/samples) {
    Remove-Item ./src/samples -Recurse -Force
  }
  if (Test-Path ./src/test) {
    Get-ChildItem -Path ./src/test -Recurse -Directory | Where-Object {$_.Name -match "^generated$"} | Remove-Item -Recurse -Force
  }
  if (Test-Path ./tsp-output) {
    Remove-Item ./tsp-output -Recurse -Force
  }

  # generate for other local test sources except partial update
  $job = Get-Item ./tsp/* -Filter "*.tsp" -Exclude "*partialupdate*" | ForEach-Object -Parallel $generateScript -ThrottleLimit $Parallelization -AsJob

  $job | Wait-Job -Timeout 600
  $job | Receive-Job

  # partial update test
  npx --no-install tsp compile ./tsp/partialupdate.tsp --option="@typespec/http-client-java.emitter-output-dir={project-root}/existingcode"
  Copy-Item -Path ./existingcode/src/main/java/tsptest/partialupdate -Destination ./src/main/java/tsptest/partialupdate -Recurse -Force
  Remove-Item ./existingcode -Recurse -Force

  # generate for http-specs/azure-http-specs test sources
  Copy-Item -Path node_modules/@typespec/http-specs/specs -Destination ./ -Recurse -Force
  Copy-Item -Path node_modules/@azure-tools/azure-http-specs/specs -Destination ./ -Recurse -Force

  $job = (Get-ChildItem ./specs -Include "main.tsp","old.tsp" -File -Recurse) | ForEach-Object -Parallel $generateScript -ThrottleLimit $Parallelization -AsJob

  $job | Wait-Job -Timeout 1200
  $job | Receive-Job

  Remove-Item ./specs -Recurse -Force

  Copy-Item -Path ./tsp-output/*/src -Destination ./ -Recurse -Force -Exclude @("ReadmeSamples.java", "module-info.java")

  Remove-Item ./tsp-output -Recurse -Force

  if (Test-Path ./src/main/resources/META-INF/client-structure-service_metadata.json) {
    # client structure is generated from multiple client.tsp files and the last one to execute overwrites
    # the api view properties file. Because the tests run in parallel, the order is not guaranteed. This
    # causes git diff check to fail as the checked in file is not the same as the generated one.
    Remove-Item ./src/main/resources/META-INF/client-structure-service_metadata.json -Force
  }

  if ($ExitCode -ne 0) {
    throw "Failed to generate from tsp"
  }
} finally {
  Pop-Location
}
