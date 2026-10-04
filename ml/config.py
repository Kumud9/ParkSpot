import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
DEFAULT_DATA_PATH = DATA_DIR / "parkspot_demand.csv"
MODEL_PATH = ARTIFACTS_DIR / "demand_model.joblib"
METADATA_PATH = ARTIFACTS_DIR / "metadata.json"

FEATURES = [
    "hourOfDay",
    "dayOfWeek",
    "isWeekend",
    "facilityCapacity",
    "historicalBookingCount",
    "historicalUtilization",
    "averageDuration",
    "rolling7DayDemand",
    "previousHourDemand",
    "previousDayDemand",
    "peakHourIndicator"
]

TARGET = "futureBookingCount"

# Train/Val/Test split ratios (Strictly chronological)
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15

# Default Model Hyperparameters
GRADIENT_BOOSTING_PARAMS = {
    "n_estimators": 120,
    "learning_rate": 0.05,
    "max_depth": 4,
    "min_samples_split": 5,
    "min_samples_leaf": 3,
    "random_state": 42
}

MODEL_VERSION = "gradient-boosting-v1.0"
