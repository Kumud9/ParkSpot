"""
Model Training Pipeline

Trains a GradientBoostingRegressor within a scikit-learn Pipeline
(incorporating cyclical time encoding, median imputation, and feature scaling).
Evaluates both deterministic baseline and the trained model on test data.
Saves model artifact to ml/artifacts/demand_model.joblib and metadata to ml/artifacts/metadata.json.
"""

import os
import json
from datetime import datetime, timezone
import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.pipeline import Pipeline

from config import (
    ARTIFACTS_DIR,
    MODEL_PATH,
    METADATA_PATH,
    FEATURES,
    GRADIENT_BOOSTING_PARAMS,
    MODEL_VERSION
)
from dataset import load_dataset, split_time_series, prepare_xy_split
from features import create_feature_pipeline
from evaluate import evaluate_baseline_predictions, compare_models

def train_demand_model(data_path=None):
    print("=" * 60)
    print("PARKSPOT DEMAND FORECASTING — MODEL TRAINING PIPELINE")
    print("=" * 60)

    # 1. Load dataset
    df = load_dataset(data_path)
    print(f"Loaded dataset: {len(df)} rows.")

    # 2. Chronological Train / Val / Test split
    train_df, val_df, test_df = split_time_series(df)
    print(f"Chronological split -> Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")

    train_start = str(train_df["timestamp"].min()) if "timestamp" in train_df.columns else "N/A"
    train_end = str(train_df["timestamp"].max()) if "timestamp" in train_df.columns else "N/A"
    test_start = str(test_df["timestamp"].min()) if "timestamp" in test_df.columns else "N/A"
    test_end = str(test_df["timestamp"].max()) if "timestamp" in test_df.columns else "N/A"

    print(f"Training window:   {train_start} -> {train_end}")
    print(f"Test window:       {test_start} -> {test_end}")

    # 3. Prepare X and y
    X_train, y_train = prepare_xy_split(train_df)
    X_val, y_val = prepare_xy_split(val_df)
    X_test, y_test = prepare_xy_split(test_df)

    # 4. Construct complete Pipeline (Feature engineering + Estimator)
    feature_prep = create_feature_pipeline()
    regressor = GradientBoostingRegressor(**GRADIENT_BOOSTING_PARAMS)

    full_pipeline = Pipeline([
        ("preprocessor", feature_prep),
        ("regressor", regressor)
    ])

    print("\nTraining GradientBoostingRegressor...")
    full_pipeline.fit(X_train, y_train)
    print("Training complete.")

    # 5. Predictions on Test Set
    test_ml_preds = full_pipeline.predict(X_test)
    test_ml_preds = [max(0, round(float(p))) for p in test_ml_preds]

    test_baseline_preds = evaluate_baseline_predictions(test_df)

    # 6. Evaluation & Comparison
    eval_results = compare_models(y_test.values, test_baseline_preds, test_ml_preds)
    print(eval_results["comparison_table"])

    if eval_results["ml_outperformed"]:
        print(">> Evaluation Verdict: ML model OUTPERFORMED baseline.")
    else:
        print(">> Evaluation Verdict: Baseline performs comparably or better. Keeping transparent lineage.")

    # 7. Persist Artifacts
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    joblib.dump(full_pipeline, MODEL_PATH)
    print(f"Saved model pipeline to: {MODEL_PATH}")

    metadata = {
        "modelVersion": MODEL_VERSION,
        "modelType": "GradientBoostingRegressor",
        "hyperparameters": GRADIENT_BOOSTING_PARAMS,
        "features": FEATURES,
        "trainingStart": train_start,
        "trainingEnd": train_end,
        "testStart": test_start,
        "testEnd": test_end,
        "sampleCounts": {
            "total": len(df),
            "train": len(train_df),
            "val": len(val_df),
            "test": len(test_df)
        },
        "metrics": {
            "baseline": eval_results["baseline"],
            "ml": eval_results["ml"],
            "ml_outperformed": eval_results["ml_outperformed"],
            "improvements": eval_results["improvements"]
        },
        "createdAt": datetime.now(timezone.utc).isoformat()
    }

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to: {METADATA_PATH}")

    return full_pipeline, metadata

if __name__ == "__main__":
    train_demand_model()
