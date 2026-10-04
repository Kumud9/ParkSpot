"""
FastAPI Micro-Service for Demand Forecast Prediction

Stateless REST API serving the persisted Gradient Boosting ML demand model.
"""

from typing import List, Optional, Any, Dict
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from predict import predict_demand, get_model
from config import MODEL_VERSION

app = FastAPI(
    title="ParkSpot ML Forecasting Service",
    description="Stateless predictive demand inference service for ParkSpot B2B Platform",
    version="1.0.0"
)

class FeatureRow(BaseModel):
    timestamp: Optional[str] = None
    hourOfDay: int = Field(..., ge=0, le=23, description="Hour of day [0-23]")
    dayOfWeek: int = Field(..., ge=0, le=6, description="Day of week [0-6, 0=Sun]")
    isWeekend: int = Field(..., ge=0, le=1, description="Binary weekend flag [0, 1]")
    facilityCapacity: int = Field(..., ge=1, le=10000, description="Active spot capacity")
    historicalBookingCount: float = Field(0.0, ge=0.0, description="Concurrent bookings in current bucket")
    historicalUtilization: float = Field(0.0, ge=0.0, le=100.0, description="Occupancy percentage")
    averageDuration: float = Field(2.0, ge=0.1, le=72.0, description="Average dwell duration in hours")
    rolling7DayDemand: float = Field(0.0, ge=0.0, description="Hourly average volume over rolling 7 days")
    previousHourDemand: float = Field(0.0, ge=0.0, description="Lag demand at t-1 hour")
    previousDayDemand: float = Field(0.0, ge=0.0, description="Lag demand at t-24 hours")
    peakHourIndicator: int = Field(0, ge=0, le=1, description="Peak indicator flag")

class PredictRequest(BaseModel):
    facilityId: str = Field(..., min_length=1, max_length=100, description="Facility Identifier")
    horizon: int = Field(24, ge=1, le=168, description="Forecast horizon steps")
    features: List[FeatureRow] = Field(..., min_length=1, max_length=168, description="Ordered feature rows")

class PredictionItem(BaseModel):
    timestamp: Optional[str] = None
    hourOfDay: Optional[int] = None
    dayOfWeek: Optional[int] = None
    predictedDemand: int = Field(..., ge=0)
    confidence: float = Field(..., ge=0.0, le=1.0)

class PredictResponse(BaseModel):
    facilityId: str
    modelVersion: str
    predictions: List[PredictionItem]

@app.get("/health", status_code=status.HTTP_200_OK)
def health():
    try:
        _, metadata = get_model()
        return {
            "status": "healthy",
            "service": "parkspot-ml-forecasting",
            "modelLoaded": True,
            "modelVersion": metadata.get("modelVersion", MODEL_VERSION)
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "service": "parkspot-ml-forecasting",
            "modelLoaded": False,
            "error": str(exc)
        }

@app.post("/predict", response_model=PredictResponse, status_code=status.HTTP_200_OK)
def predict(request: PredictRequest):
    try:
        feature_dicts = [row.model_dump() for row in request.features]
        result = predict_demand(
            facility_id=request.facilityId,
            feature_rows=feature_dicts
        )
        return result
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model artifact not loaded: {str(exc)}"
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failure: {str(exc)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
