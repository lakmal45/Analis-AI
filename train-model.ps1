$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "backend"
$trainEndpoint = "http://127.0.0.1:8001/train"
$healthEndpoint = "http://127.0.0.1:8001/health"

function Show-Value {
    param(
        [string]$Label,
        $Value
    )

    if ($null -eq $Value -or $Value -eq "") {
        Write-Host ("$Label N/A") -ForegroundColor Green
    } else {
        Write-Host ("$Label $Value") -ForegroundColor Green
    }
}

function Show-Section {
    param(
        [string]$Title
    )

    Write-Host ""
    Write-Host $Title -ForegroundColor Cyan
}

Write-Host "Exporting fresh training data from MongoDB..." -ForegroundColor Cyan
Push-Location $backendPath
try {
    npm.cmd run export:training-data
} finally {
    Pop-Location
}

Write-Host "Checking ML service availability..." -ForegroundColor Cyan
try {
    $null = Invoke-RestMethod -Method Get -Uri $healthEndpoint
} catch {
    throw "ML service is not reachable at $healthEndpoint. Start it first with .\start-all.ps1 or run uvicorn in backend\ml_service."
}

$payload = @{
    datasetPath = "data/training-data.csv"
    activateOnTrain = $true
    notes = "manual_train_model_script"
} | ConvertTo-Json

Write-Host "Requesting calibrated model training with walk-forward validation..." -ForegroundColor Cyan
$response = Invoke-RestMethod -Method Post -Uri $trainEndpoint -ContentType "application/json" -Body $payload

Write-Host ""
Write-Host "Training completed." -ForegroundColor Green
Show-Value -Label "Model Version:         " -Value $response.modelVersion
Show-Value -Label "Dataset Path:          " -Value $response.datasetPath
Show-Value -Label "Activation Requested:  " -Value $response.activationRequested
Show-Value -Label "Activated:             " -Value $response.activated

if ($response.activationBlockedReasons -and $response.activationBlockedReasons.Count -gt 0) {
    Write-Host "Activation Blocked By:" -ForegroundColor Yellow
    foreach ($reason in $response.activationBlockedReasons) {
        Write-Host ("  - " + $reason) -ForegroundColor Yellow
    }
}

if ($response.metrics) {
    Show-Section -Title "Holdout Metrics"
    Show-Value -Label "ROC-AUC:               " -Value $response.metrics.rocAuc
    Show-Value -Label "PR-AUC:                " -Value $response.metrics.prAuc
    Show-Value -Label "Log Loss:              " -Value $response.metrics.logLoss
    Show-Value -Label "Brier Score:           " -Value $response.metrics.brierScore
    Show-Value -Label "Calibration Method:    " -Value $response.metrics.calibrationMethod

    Show-Section -Title "Dataset Splits"
    Show-Value -Label "Train Rows:            " -Value $response.metrics.trainRows
    Show-Value -Label "Calibration Rows:      " -Value $response.metrics.calibrationRows
    Show-Value -Label "Test Rows:             " -Value $response.metrics.testRows
    Show-Value -Label "Dataset Rows:          " -Value $response.metrics.datasetRows

    if ($response.metrics.walkForward) {
        Show-Section -Title "Walk-Forward Validation"
        Show-Value -Label "Requested Folds:       " -Value $response.metrics.walkForward.requestedFolds
        Show-Value -Label "Completed Folds:       " -Value $response.metrics.walkForward.completedFolds
        Show-Value -Label "Mean ROC-AUC:          " -Value $response.metrics.walkForward.rocAucMean
        Show-Value -Label "Mean PR-AUC:           " -Value $response.metrics.walkForward.prAucMean
        Show-Value -Label "Mean Log Loss:         " -Value $response.metrics.walkForward.logLossMean
        Show-Value -Label "Mean Brier Score:      " -Value $response.metrics.walkForward.brierScoreMean
    }
}

if ($response.promotion) {
    Show-Section -Title "Promotion Gate"
    Show-Value -Label "Eligible:              " -Value $response.promotion.eligible
    if ($response.promotion.thresholds) {
        Show-Value -Label "Min Dataset Rows:      " -Value $response.promotion.thresholds.minDatasetRows
        Show-Value -Label "Min Holdout ROC-AUC:   " -Value $response.promotion.thresholds.minRocAuc
        Show-Value -Label "Min Walk-Forward ROC:  " -Value $response.promotion.thresholds.minWalkForwardRocAuc
        Show-Value -Label "Max Brier Score:       " -Value $response.promotion.thresholds.maxBrierScore
    }
}
