import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api import health, predict, PredictRequest, FeatureRow
from pydantic import ValidationError

def test_health_endpoint():
    res = health()
    assert res["status"] == "healthy"
    assert res["modelLoaded"] is True
    assert res["modelVersion"] == "gradient-boosting-v1.0"

def test_predict_endpoint_valid():
    row1 = FeatureRow(
        timestamp="2026-10-05T11:00:00.000Z",
        hourOfDay=11,
        dayOfWeek=1,
        isWeekend=0,
        facilityCapacity=80,
        historicalBookingCount=20.0,
        historicalUtilization=25.0,
        averageDuration=2.0,
        rolling7DayDemand=18.0,
        previousHourDemand=15.0,
        previousDayDemand=22.0,
        peakHourIndicator=1
    )
    row2 = FeatureRow(
        timestamp="2026-10-05T12:00:00.000Z",
        hourOfDay=12,
        dayOfWeek=1,
        isWeekend=0,
        facilityCapacity=80,
        historicalBookingCount=25.0,
        historicalUtilization=31.25,
        averageDuration=2.0,
        rolling7DayDemand=18.0,
        previousHourDemand=20.0,
        previousDayDemand=24.0,
        peakHourIndicator=1
    )

    req = PredictRequest(
        facilityId="test-facility-101",
        horizon=2,
        features=[row1, row2]
    )

    result = predict(req)
    assert result["facilityId"] == "test-facility-101"
    assert len(result["predictions"]) == 2
    for pred in result["predictions"]:
        assert pred["predictedDemand"] >= 0
        assert 0.0 <= pred["confidence"] <= 1.0

def test_predict_endpoint_validation():
    # Empty features should raise Pydantic ValidationError
    with pytest.raises(ValidationError):
        PredictRequest(
            facilityId="test-facility-101",
            horizon=1,
            features=[]
        )

    # Invalid hourOfDay (> 23) should raise ValidationError
    with pytest.raises(ValidationError):
        FeatureRow(
            hourOfDay=25,
            dayOfWeek=1,
            isWeekend=0,
            facilityCapacity=80
        )
