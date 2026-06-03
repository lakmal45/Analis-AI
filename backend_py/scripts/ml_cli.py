import argparse
import asyncio
import logging
import os
from pathlib import Path

# Add backend_py to sys.path so 'app.' imports work
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
# Load env variables so database connection works
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.ml.dataset_service import export_training_dataset
from app.ml.training import train_model
from app.ml.model_store import list_models, activate_model, delete_model, save_bundle
from app.tasks.ml_retraining import retrain_ml_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

async def handle_extract(args):
    print(f"Extracting dataset (min_signals={args.min_signals}, source={args.source})...")
    result = await export_training_dataset(min_signals=args.min_signals, source=args.source)
    if result["success"]:
        print(f"Success! Exported {result['count']} samples to {result['csvPath']}")
    else:
        print(f"Failed: {result['message']}")

def handle_train(args):
    print(f"Training model on dataset: {args.dataset}")
    try:
        bundle, metadata = train_model(dataset_path=args.dataset, notes=args.notes)
        eligible = metadata.get("promotion", {}).get("eligible", False)
        record = save_bundle(bundle, metadata, activate=eligible)
        print(f"Success! Trained model: {record['modelVersion']}")
        print(f"Metrics (ROCAUC): {record['metrics'].get('rocAuc')}")
        print(f"Promoted to Active: {eligible}")
    except Exception as e:
        print(f"Training failed: {e}")

async def handle_retrain(args):
    print("Running background retraining pipeline...")
    await retrain_ml_model()
    print("Pipeline completed. Check logs for details.")

def handle_list(args):
    registry = list_models()
    active = registry.get("activeModelVersion")
    print("--- ML Models ---")
    print(f"Active Model: {active if active else 'None'}\n")
    for m in registry.get("models", []):
        prefix = "-> " if m["modelVersion"] == active else "   "
        print(f"{prefix}{m['modelVersion']} (Trained: {m.get('trainedAt')})")

def handle_activate(args):
    try:
        model = activate_model(args.version)
        print(f"Success! Activated model: {model['modelVersion']}")
    except Exception as e:
        print(f"Failed to activate: {e}")

def handle_delete(args):
    try:
        if delete_model(args.version):
            print(f"Success! Deleted model: {args.version}")
        else:
            print(f"Model version not found: {args.version}")
    except Exception as e:
        print(f"Failed to delete: {e}")

def main():
    parser = argparse.ArgumentParser(description="Analis-AI ML Lifecycle CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Extract command
    extract_parser = subparsers.add_parser("extract", help="Extract dataset from database")
    extract_parser.add_argument("--min-signals", type=int, default=60, help="Minimum signals required")
    extract_parser.add_argument("--source", type=str, default="combined", choices=["signals", "backtests", "combined"])

    # Train command
    train_parser = subparsers.add_parser("train", help="Train ML model")
    train_parser.add_argument("--dataset", type=str, default="app/ml/data/training-data.csv", help="Path to dataset CSV")
    train_parser.add_argument("--notes", type=str, default="CLI manual training", help="Notes for the model registry")

    # Retrain command
    subparsers.add_parser("retrain", help="Run full extract + train automated pipeline")

    # List command
    subparsers.add_parser("list", help="List all models in registry")

    # Activate command
    activate_parser = subparsers.add_parser("activate", help="Activate a model version")
    activate_parser.add_argument("version", type=str, help="Model version to activate")

    # Delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a model version")
    delete_parser.add_argument("version", type=str, help="Model version to delete")

    args = parser.parse_args()

    if args.command == "extract":
        asyncio.run(handle_extract(args))
    elif args.command == "train":
        handle_train(args)
    elif args.command == "retrain":
        asyncio.run(handle_retrain(args))
    elif args.command == "list":
        handle_list(args)
    elif args.command == "activate":
        handle_activate(args)
    elif args.command == "delete":
        handle_delete(args)

if __name__ == "__main__":
    main()
