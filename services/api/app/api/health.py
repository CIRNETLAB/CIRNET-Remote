from fastapi import APIRouter
from app.config import settings
from contracts.boundary.models import HealthResponse
from app.services.api_contracts import ERROR_RESPONSES
from app.compatibility import health_service_name

router = APIRouter(prefix="/api")

@router.get("/health", operation_id='getHealth', response_model=HealthResponse, response_model_exclude_unset=True, responses=ERROR_RESPONSES)
def health():
    return {"status": "ok", "service": health_service_name(), "hardware_mode": settings.hardware_mode}
