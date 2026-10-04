import pytest
import pandas as pd
import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dataset import load_dataset, split_time_series, prepare_xy_split
from predict import predict_demand, calculate_estimated_confidence
from evaluate import calculate_metrics

def test_chronological_split_no_leakage():
    df = load_dataset()
    train_df, val_df, test_df = split_time_series(df)

    assert len(train_df) > 0
    assert len(val_df) > 0
    assert len(test_df) > 0
    assert len(train_df) + len(val_df) + len(test_df) == len(df)

    # Strictly monotonic timestamps
    if "timestamp" in df.columns:
        assert train_df["timestamp"].max() <= val_df["timestamp"].min()
        assert val_df["timestamp"].max() <= test_df["timestamp"].min()

def test_xy_split_target_isolation():
    df = load_dataset()
    X, y = prepare_xy_split(df.iloc[:50])

    assert "futureBookingCount" not in X.columns
    assert len(X) == 50
    assert len(y) == 50

def test_metrics_calculation():
    y_true = np.array([10, 20, 30, 40])
    y_pred = np.array([10, 22, 28, 41])
    metrics = calculate_metrics(y_true, y_pred)

    assert metrics["mae"] >= 0
    assert metrics["rmse"] >= metrics["mae"]
    assert metrics["r2"] <= 1.0

def test_confidence_estimation():
    conf_normal = calculate_estimated_confidence(predicted_val=50, capacity=100, rmse=3.0)
    assert 0.40 <= conf_normal <= 0.95

    # Near capacity limit boundary adjustment
    conf_boundary = calculate_estimated_confidence(predicted_val=99, capacity=100, rmse=3.0)
    assert conf_boundary <= conf_normal

def test_predict_demand_artifact():
    sample_features = [{
        "timestamp": "2026-10-05T10:00:00.000Z",
        "hourOfDay": 10,
        "dayOfWeek": 1,
        "isWeekend": 0,
        "facilityCapacity": 100,
        "historicalBookingCount": 35.0,
        "historicalUtilization": 35.0,
        "averageDuration": 2.0,
        "rolling7DayDemand": 30.0,
        "previousHourDemand": 28.0,
        "previousDayDemand": 32.0,
        "peakHourIndicator": 1
    }]

    result = predict_demand(facility_id="fac_test_1", feature_rows=sample_features)
    assert result["facilityId"] == "fac_test_1"
    assert len(result["predictions"]) == 1
    p = result["predictions"][0]
    assert p["predictedDemand"] >= 0
    assert 0.0 <= p["confidence"] <= 1.0
