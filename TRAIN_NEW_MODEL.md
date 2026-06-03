# Train A Fresh ML Model

## 1. Generate New Backtest Data

After clearing old runs, use your app's backtest feature to create new `BacktestRun` documents with the latest indicator set.

Important:

- Make sure the backtests are saved successfully.
- Make sure the saved trades include populated `features`.
- Try to generate enough `WIN` and `LOSS` examples across the symbols and timeframes you care about.

The training exporter only uses trades/signals with usable feature data.

## 2. Export Training Data From MongoDB

The backend already has a script that reads from MongoDB and writes:

- `backend/ml_service/data/training-data.json`
- `backend/ml_service/data/training-data.csv`

From the `backend` folder run:

```powershell
npm run export:training-data

node scripts/exportTrainingData.js --source backtests --include-old-data --allow-unguarded-backtests
```

Optional filters:

```powershell
node scripts/exportTrainingData.js --source backtests
node scripts/exportTrainingData.js --source backtests --symbol BTCUSDT
node scripts/exportTrainingData.js --source backtests --timeframe 1h
node scripts/exportTrainingData.js --source backtests --min-resolved 2026-05-19T00:00:00.000Z
```

Notes:

- Use `--source backtests` if you want training data only from `BacktestRun`.
- If you also want completed live signals included, use the default combined export or `--source combined`.

## 3. Start The ML Service

From the `backend/ml_service` folder:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

If `.venv` already exists, you only need:

```powershell
cd backend/ml_service
.venv\Scripts\activate
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

## 4. Train A New Model

With the ML service running, train from the exported CSV:

```powershell
curl -X POST http://127.0.0.1:8001/train ^
  -H "Content-Type: application/json" ^
  -d "{\"datasetPath\":\"data/training-data.csv\"}"
```

If you want to explicitly request activation when the model passes promotion checks:

```powershell
curl -X POST http://127.0.0.1:8001/train ^
  -H "Content-Type: application/json" ^
  -d "{\"datasetPath\":\"data/training-data.csv\",\"activateOnTrain\":true}"
```

What this does:

- reads `backend/ml_service/data/training-data.csv`
- trains a new versioned model
- saves artifacts in `backend/ml_service/artifacts`
- may auto-activate the model if promotion rules pass

## 5. Check The Latest Training Run

To inspect the latest training metadata:

```powershell
curl http://127.0.0.1:8001/training/latest
```

To inspect available models:

```powershell
curl http://127.0.0.1:8001/models
```

## 6. Activate The New Model

If the new model was not auto-activated, activate it manually.

First get the model version from:

- `GET /models`, or
- `backend/ml_service/artifacts/latest_training.json`, or
- `backend/ml_service/artifacts/registry.json`

Then activate it:

```powershell
curl -X POST http://127.0.0.1:8001/models/YOUR_MODEL_VERSION/activate
```

Example:

```powershell
curl -X POST http://127.0.0.1:8001/models/xgb_v1_20260519T120000Z/activate
```

To verify the switch:

```powershell
curl http://127.0.0.1:8001/models
curl http://127.0.0.1:8001/health
```

You should see the new version in:

- `activeModelVersion` from `GET /models`
- `activeModelVersion` and `modelVersion` from `GET /health`

Current example from this repo:

- latest trained model: `xgb_v1_20260519T163017Z`
- currently active model: `xgb_v1_20260516T120432Z`

So to activate the newest trained model right now:

```powershell
curl -X POST http://127.0.0.1:8001/models/xgb_v1_20260519T163017Z/activate

or

Invoke-WebRequest -Method POST -Uri "http://127.0.0.1:8001/models/xgb_v1_20260519T163017Z/activate"
```

## 7. Delete Old Models

There is currently no `DELETE /models/:version` endpoint in `backend/ml_service/app.py`.
Old models must be removed manually from the artifact files and from `backend/ml_service/artifacts/registry.json`.

Important safety rules:

- Do not delete the version currently shown as `activeModelVersion`.
- Activate the replacement model first, then remove old ones.
- Delete both the `.joblib` file and the matching `.meta.joblib` file for the same version.

### Step 1: Check which model is active

```powershell
curl http://127.0.0.1:8001/models
```

### Step 2: Remove the old artifact files

From `backend/ml_service`:

```powershell
Remove-Item .\artifacts\models\xgb_v1_20260513T185621Z.joblib
Remove-Item .\artifacts\models\xgb_v1_20260513T185621Z.meta.joblib
```

### Step 3: Remove the old model entry from `registry.json`

Open `backend/ml_service/artifacts/registry.json` and delete the matching object from the `models` array.

Do not change:

- `activeModelVersion` if it already points to the model you want to keep active
- the metadata for the model versions you are keeping

### Step 4: Restart the ML service

After manual cleanup, restart `uvicorn` so the service reloads the updated registry cleanly.

### Example cleanup in the current repo state

If you activate `xgb_v1_20260519T163017Z`, then the oldest inactive model you can safely remove is:

- `xgb_v1_20260513T185621Z`

That means deleting these files:

- `backend/ml_service/artifacts/models/xgb_v1_20260513T185621Z.joblib`
- `backend/ml_service/artifacts/models/xgb_v1_20260513T185621Z.meta.joblib`

And removing its entry from:

- `backend/ml_service/artifacts/registry.json`

## 8. Run The New Model Through The Backend

The Node backend talks to the ML service through `ML_SERVICE_URL`.

In `backend/.env` make sure you have:

```env
ML_SERVICE_URL=http://127.0.0.1:8001
ML_REQUEST_TIMEOUT_MS=5000
```

Then start the backend from the `backend` folder:

```powershell
npm run dev
```

When the backend requests predictions, it will use the active ML model from the ML service.

## 9. One-Step Backend Retrain Option

The backend also has a retrain endpoint that:

1. exports fresh training data from MongoDB
2. sends a training request to the ML service

Endpoint:

```text
POST /api/ai/ml/retrain
```

This is useful after you have already created fresh backtest data and want the backend to handle export plus retraining in one flow.

## Recommended Clean Workflow

1. Generate new backtests with the latest indicators.
2. Export training data with `--source backtests`.
3. Start the ML service.
4. Train the new model.
5. Confirm the trained version in `/models`.
6. Activate it if needed.
7. Verify `/health` shows the expected active version.
8. Delete older inactive models if you want to clean up artifacts.
9. Run the backend and test predictions/backtests against the new model.

## Common Problem

If training fails because there is not enough data, the exporter/trainer may require:

- enough total samples
- both `WIN` and `LOSS` rows
- valid `features` on the saved trades/signals

If that happens, generate more backtests first, then export and train again.
