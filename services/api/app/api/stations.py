from fastapi import APIRouter, Request

router=APIRouter(prefix="/api/stations")

@router.get("")
def list_stations(request:Request):
    return request.app.state.stations.list()

@router.get("/{station_id}/capabilities")
def capabilities(station_id:str,request:Request):
    return request.app.state.stations.capabilities(station_id)

@router.get("/{station_id}/queue")
def queue(station_id:str,request:Request):
    request.app.state.stations.capabilities(station_id)
    queue=request.app.state.manager.queue(station_id)
    own={e["experiment_id"] for e in request.app.state.repository.list_experiments(request.state.owner)}
    return {"schema_version":"1.0","station_id":station_id,"queued_count":len(queue),
            "busy":any(l["station_id"]==station_id for l in request.app.state.repository.leases()),
            "own_positions":[{"experiment_id":eid,"position":i+1} for i,eid in enumerate(queue) if eid in own]}
