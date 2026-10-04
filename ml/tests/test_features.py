import pytest
import pandas as pd
import numpy as np
import sys
from pathlib import Path

# Add ml root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from features import CyclicalTimeTransformer, prepare_features, create_feature_pipeline
from config import FEATURES

def test_cyclical_transformer_bounds():
    df = pd.DataFrame({
        "hourOfDay": [0, 6, 12, 18, 23],
        "dayOfWeek": [0, 1, 3, 5, 6]
    })
    transformer = CyclicalTimeTransformer(add_cyclical=True)
    transformed = transformer.transform(df)

    assert "sin_hour" in transformed.columns
    assert "cos_hour" in transformed.columns
    assert "sin_day" in transformed.columns
    assert "cos_day" in transformed.columns

    # Verify mathematical ranges [-1, 1]
    assert np.all(transformed["sin_hour"] >= -1.0) and np.all(transformed["sin_hour"] <= 1.0)
    assert np.all(transformed["cos_hour"] >= -1.0) and np.all(transformed["cos_hour"] <= 1.0)

def test_prepare_features_missing_cols():
    df = pd.DataFrame({"hourOfDay": [10]})
    with pytest.raises(ValueError, match="Missing required feature columns"):
        prepare_features(df)

def test_feature_pipeline_fit_transform():
    data = {
        "hourOfDay": [8, 9, 10, 11],
        "dayOfWeek": [1, 1, 1, 1],
        "isWeekend": [0, 0, 0, 0],
        "facilityCapacity": [100, 100, 100, 100],
        "historicalBookingCount": [20, 25, 30, 28],
        "historicalUtilization": [20.0, 25.0, 30.0, 28.0],
        "averageDuration": [2.0, 2.1, 2.0, 1.9],
        "rolling7DayDemand": [15.0, 15.2, 15.5, 15.8],
        "previousHourDemand": [18, 20, 25, 30],
        "previousDayDemand": [19, 21, 28, 27],
        "peakHourIndicator": [0, 1, 1, 1]
    }
    df = pd.DataFrame(data)
    pipeline = create_feature_pipeline()
    transformed = pipeline.fit_transform(df)

    assert transformed.shape[0] == 4
    # Columns: 11 base features + 4 cyclical sin/cos = 15 features
    assert transformed.shape[1] == 15
    assert not np.isnan(transformed).any()
