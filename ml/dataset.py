"""
Dataset Loading and Chronological Time-Aware Splitting

Enforces strict temporal order:
- 70% earliest -> Train
- 15% intermediate -> Validation
- 15% latest -> Test
No random shuffling is ever permitted to prevent lookahead data leakage.
"""

import json
from pathlib import Path
from typing import Tuple, Dict, Any
import pandas as pd
from config import (
    DEFAULT_DATA_PATH,
    FEATURES,
    TARGET,
    TRAIN_RATIO,
    VAL_RATIO,
    TEST_RATIO
)
from features import prepare_features

def load_dataset(file_path: Path = None) -> pd.DataFrame:
    """
    Loads historical demand records from CSV or JSON.
    Ensures timestamp is sorted ascending.
    """
    path = Path(file_path) if file_path else DEFAULT_DATA_PATH
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found at: {path}")

    if path.suffix.lower() == ".json":
        with open(path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            rows = raw_data.get("rows", raw_data)
            df = pd.DataFrame(rows)
    else:
        df = pd.read_csv(path)

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values("timestamp").reset_index(drop=True)

    return df

def split_time_series(
    df: pd.DataFrame,
    train_ratio: float = TRAIN_RATIO,
    val_ratio: float = VAL_RATIO
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Splits dataset chronologically into train, validation, and test subsets.
    Asserts no chronological overlap.
    """
    n = len(df)
    if n < 20:
        raise ValueError(f"Insufficient data rows ({n}) for train/val/test splitting.")

    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train_df = df.iloc[:train_end].copy().reset_index(drop=True)
    val_df = df.iloc[train_end:val_end].copy().reset_index(drop=True)
    test_df = df.iloc[val_end:].copy().reset_index(drop=True)

    # Validate strictly monotonic temporal boundaries
    if "timestamp" in df.columns:
        train_max = train_df["timestamp"].max()
        val_min = val_df["timestamp"].min()
        val_max = val_df["timestamp"].max()
        test_min = test_df["timestamp"].min()

        assert train_max <= val_min, f"Temporal leakage: train max {train_max} > val min {val_min}"
        assert val_max <= test_min, f"Temporal leakage: val max {val_max} > test min {test_min}"

    return train_df, val_df, test_df

def prepare_xy_split(
    df: pd.DataFrame
) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Extracts features X and target y.
    """
    X = prepare_features(df, FEATURES)
    y = df[TARGET].copy()
    return X, y
