"""
Feature Engineering Pipeline for ParkSpot Demand Forecasting

Feature Definitions & Domain Rationale:
--------------------------------------
1. hourOfDay: Hour of day [0-23]. Captures diurnal rhythm (morning commuter arrival, midday lunch, evening exit).
2. dayOfWeek: Day of week [0-6, 0=Sunday]. Captures weekly business vs. weekend patterns.
3. isWeekend: Binary [0, 1]. Captures distinct weekend leisure behavior vs weekday business commuter traffic.
4. facilityCapacity: Number of active parking bays in the facility. Normalizes demand scale across facilities.
5. historicalBookingCount: Observed concurrent active bookings in the current hour bucket.
6. historicalUtilization: Utilization percentage (historicalBookingCount / facilityCapacity * 100).
7. averageDuration: Rolling average historical parking duration (hours) observed up to this bucket.
8. rolling7DayDemand: Rolling 7-day average hourly booking volume up to the current bucket.
9. previousHourDemand: Lag demand at t - 1 hour. Captures immediate auto-regressive momentum.
10. previousDayDemand: Lag demand at t - 24 hours. Captures same-hour day-over-day seasonality.
11. peakHourIndicator: Binary indicator [0, 1] identifying facility core peak windows (10:00-16:00 weekdays, 12:00-18:00 weekends).

Leakage Prevention:
-------------------
All lag and rolling features are derived strictly from intervals strictly preceding the forecast target horizon [t + 1, t + 2).
Target variable (futureBookingCount) is strictly isolated and never included in feature matrix X.
"""

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from config import FEATURES

class CyclicalTimeTransformer(BaseEstimator, TransformerMixin):
    """
    Transforms cyclical time features (hourOfDay and dayOfWeek) into sin/cos coordinates
    to preserve mathematical continuity (e.g. 23:00 is adjacent to 00:00).
    """
    def __init__(self, add_cyclical=True):
        self.add_cyclical = add_cyclical

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X_df = X.copy() if isinstance(X, pd.DataFrame) else pd.DataFrame(X, columns=FEATURES)

        if self.add_cyclical:
            if "hourOfDay" in X_df.columns:
                hour = X_df["hourOfDay"].astype(float)
                X_df["sin_hour"] = np.sin(2 * np.pi * hour / 24.0)
                X_df["cos_hour"] = np.cos(2 * np.pi * hour / 24.0)

            if "dayOfWeek" in X_df.columns:
                day = X_df["dayOfWeek"].astype(float)
                X_df["sin_day"] = np.sin(2 * np.pi * day / 7.0)
                X_df["cos_day"] = np.cos(2 * np.pi * day / 7.0)

        return X_df

def create_feature_pipeline() -> Pipeline:
    """
    Builds a robust scikit-learn pipeline for feature transformation.
    """
    return Pipeline([
        ("cyclical", CyclicalTimeTransformer(add_cyclical=True)),
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler())
    ])

def prepare_features(df: pd.DataFrame, feature_cols=None) -> pd.DataFrame:
    """
    Validates, handles missing values, and extracts the feature matrix X.
    """
    if feature_cols is None:
        feature_cols = FEATURES

    missing_cols = [c for c in feature_cols if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required feature columns: {missing_cols}")

    X = df[feature_cols].copy()

    # Fill NaNs for lag features safely with defaults
    if "previousHourDemand" in X.columns:
        X["previousHourDemand"] = X["previousHourDemand"].fillna(0)
    if "previousDayDemand" in X.columns:
        X["previousDayDemand"] = X["previousDayDemand"].fillna(X["historicalBookingCount"])
    if "rolling7DayDemand" in X.columns:
        X["rolling7DayDemand"] = X["rolling7DayDemand"].fillna(X["historicalBookingCount"] * 0.8)

    return X
