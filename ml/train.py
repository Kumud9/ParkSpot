"""
Model Training & Evaluation Pipeline

Trains a GradientBoostingRegressor within a scikit-learn Pipeline
(incorporating cyclical time encoding, median imputation, and feature scaling).
Evaluates both deterministic baseline and the trained model on test data.
Saves model artifact to ml/artifacts/demand_model.joblib and metadata to ml/artifacts/metadata.json.
"""

import os
import json
from datetime import datetime, timezone
from typing import Dict, Any
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from config import (
    ARTIFACTS_DIR,
    MODEL_PATH,
    METADATA_PATH,
    FEATURES,
    GRADIENT_BOOSTING_PARAMS,
    MODEL_VERSION
)
from features import (
    load_dataset,
    split_time_series,
    prepare_xy_split,
    create_feature_pipeline
)

def evaluate_baseline_predictions(df: pd.DataFrame) -> np.ndarray:
    """
    Computes predictions using the Phase 3.1 deterministic baseline:
    Moving average adjusted by rolling 7-day momentum and peak indicator.
    """
    preds = []
    for _, row in df.iterrows():
        base = row["historicalBookingCount"]
        rolling = row["rolling7DayDemand"]
        is_peak = row["peakHourIndicator"]

        pred = (0.7 * base + 0.3 * row["previousHourDemand"]) * (1.1 if is_peak else 0.95)
        pred = np.clip(pred, 0, row["facilityCapacity"])
        preds.append(round(float(pred)))

    return np.array(preds)

def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Calculates numerical regression metrics: MAE, RMSE, R², MAPE.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))

    non_zero_mask = y_true > 0
    if np.any(non_zero_mask):
        mape = float(np.mean(np.abs((y_true[non_zero_mask] - y_pred[non_zero_mask]) / y_true[non_zero_mask])) * 100.0)
    else:
        mape = 0.0

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "r2": round(r2, 4),
        "mape": round(mape, 2)
    }

def compare_models(y_true: np.ndarray, baseline_preds: np.ndarray, ml_preds: np.ndarray) -> Dict[str, Any]:
    """
    Generates side-by-side comparison between deterministic baseline and ML model.
    """
    base_metrics = calculate_metrics(y_true, baseline_preds)
    ml_metrics = calculate_metrics(y_true, ml_preds)

    mae_diff = base_metrics["mae"] - ml_metrics["mae"]
    rmse_diff = base_metrics["rmse"] - ml_metrics["rmse"]
    r2_diff = ml_metrics["r2"] - base_metrics["r2"]

    ml_outperformed = (mae_diff > 0 and rmse_diff > 0) or (r2_diff > 0.05)

    comparison_table = (
        f"\n{'Model':<25} | {'MAE':<8} | {'RMSE':<8} | {'R²':<8} | {'MAPE (%)':<8}\n"
        f"{'-'*65}\n"
        f"{'Deterministic Baseline':<25} | {base_metrics['mae']:<8.4f} | {base_metrics['rmse']:<8.4f} | {base_metrics['r2']:<8.4f} | {base_metrics['mape']:<8.2f}\n"
        f"{'Gradient Boosting ML':<25} | {ml_metrics['mae']:<8.4f} | {ml_metrics['rmse']:<8.4f} | {ml_metrics['r2']:<8.4f} | {ml_metrics['mape']:<8.2f}\n"
    )

    return {
        "comparison_table": comparison_table,
        "baseline": base_metrics,
        "ml": ml_metrics,
        "ml_outperformed": ml_outperformed,
        "improvements": {
            "mae_reduction": round(mae_diff, 4),
            "rmse_reduction": round(rmse_diff, 4),
            "r2_gain": round(r2_diff, 4)
        }
    }

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
