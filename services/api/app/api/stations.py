from fastapi import APIRouter, Request
from contracts.boundary.models import PublicStationCapabilities, StationDescriptor, QueueState
from app.services.api_contracts import ERROR_RESPONSES, public_capabilities, public_station

router=APIRouter(prefix="/api/stations", responses=ERROR_RESPONSES)

@router.get("", operation_id='listStations', response_model=list[StationDescriptor], response_model_exclude_unset=True)
def list_stations(request:Request):
    return [public_station(station) for station in request.app.state.stations.list()]

@router.get("/{station_id}/capabilities", operation_id='getStationCapabilities', response_model=PublicStationCapabilities, response_model_exclude_unset=True)
def capabilities(station_id:str,request:Request):
    return public_capabilities(request.app.state.stations.capabilities(station_id))

@router.get("/{station_id}/queue", operation_id='getStationQueue', response_model=QueueState, response_model_exclude_unset=True)
def queue(station_id:str,request:Request):
    request.app.state.stations.capabilities(station_id)
    queue=request.app.state.manager.queue(station_id)
    own=request.app.state.repository.owned_experiment_ids(request.state.owner,queue)
    return {"schema_version":"1.0","station_id":station_id,"queued_count":len(queue),
            "busy":any(l["station_id"]==station_id for l in request.app.state.repository.leases()),
            "own_positions":[{"experiment_id":eid,"position":i+1} for i,eid in enumerate(queue) if eid in own]}
