"""
Prediction Engine for ParkSpot Demand Forecasting

Loads the persisted GradientBoosting model pipeline and metadata.
Generates structured predictions with model-derived confidence.
"""

import json
from pathlib import Path
from typing import List, Dict, Any
import joblib
import numpy as np
import pandas as pd
from config import MODEL_PATH, METADATA_PATH, FEATURES, MODEL_VERSION
from features import prepare_features

_model_cache = None
_metadata_cache = None

def get_model():
    global _model_cache, _metadata_cache
    if _model_cache is None:
        if not Path(MODEL_PATH).exists():
            raise FileNotFoundError(f"Model artifact not found at: {MODEL_PATH}. Run training first.")
        _model_cache = joblib.load(MODEL_PATH)

    if _metadata_cache is None:
        if Path(METADATA_PATH).exists():
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                _metadata_cache = json.load(f)
        else:
            _metadata_cache = {"modelVersion": MODEL_VERSION}

    return _model_cache, _metadata_cache

def calculate_estimated_confidence(
    predicted_val: float,
    capacity: int,
    rmse: float = 6.0
) -> float:
    """
    Computes an estimated confidence score [0.30 - 0.95] derived from
    historical model test RMSE, capacity scale, and edge boundaries.
    """
    if capacity <= 0:
        return 0.50

    # Margin relative to capacity
    rel_error = rmse / max(10, capacity)
    base_confidence = max(0.40, min(0.92, 1.0 - rel_error))

    # Adjust confidence slightly near extreme capacity limits
    if predicted_val >= capacity * 0.95 or predicted_val <= capacity * 0.05:
        base_confidence *= 0.95

    return round(float(base_confidence), 2)

def predict_demand(
    facility_id: str,
    feature_rows: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Executes model inference on structured feature rows.
    """
    if not feature_rows:
        return {
            "facilityId": facility_id,
            "modelVersion": MODEL_VERSION,
            "predictions": []
        }

    pipeline, metadata = get_model()
    rmse = metadata.get("metrics", {}).get("ml", {}).get("rmse", 6.5)

    df_input = pd.DataFrame(feature_rows)
    X = prepare_features(df_input, FEATURES)

    raw_preds = pipeline.predict(X)

    predictions = []
    for i, pred_val in enumerate(raw_preds):
        row = feature_rows[i]
        capacity = int(row.get("facilityCapacity", 100))
        clamped_pred = max(0, min(capacity, round(float(pred_val))))
        confidence = calculate_estimated_confidence(clamped_pred, capacity, rmse)

        predictions.append({
            "timestamp": row.get("timestamp"),
            "hourOfDay": row.get("hourOfDay"),
            "dayOfWeek": row.get("dayOfWeek"),
            "predictedDemand": clamped_pred,
            "confidence": confidence
        })

    return {
        "facilityId": facility_id,
        "modelVersion": metadata.get("modelVersion", MODEL_VERSION),
        "predictions": predictions
    }
