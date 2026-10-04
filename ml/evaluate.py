"""
Model Evaluation: Deterministic Baseline vs Machine Learning Regressor

Calculates real mathematical metrics:
- MAE (Mean Absolute Error)
- RMSE (Root Mean Squared Error)
- R² (Coefficient of Determination)
- MAPE (Mean Absolute Percentage Error for non-zero entries)
"""

from typing import Dict, Any
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

def evaluate_baseline_predictions(
    df: pd.DataFrame
) -> np.ndarray:
    """
    Computes predictions using the Phase 3.1 deterministic baseline:
    Moving average adjusted by rolling 7-day momentum and peak indicator.
    """
    preds = []
    for _, row in df.iterrows():
        # Baseline uses historicalBookingCount adjusted by rolling momentum
        base = row["historicalBookingCount"]
        rolling = row["rolling7DayDemand"]
        is_peak = row["peakHourIndicator"]

        # Momentum ratio
        momentum_ratio = 1.0
        if rolling > 0 and base > 0:
            momentum_ratio = np.clip(base / rolling, 0.5, 1.8)

        # Baseline heuristic: combination of previous hour + peak weighting
        pred = (0.7 * base + 0.3 * row["previousHourDemand"]) * (1.1 if is_peak else 0.95)
        pred = np.clip(pred, 0, row["facilityCapacity"])
        preds.append(round(float(pred)))

    return np.array(preds)

def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Calculates actual numerical regression metrics.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))

    # MAPE on non-zero target values
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
