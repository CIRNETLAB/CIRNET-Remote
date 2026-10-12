from fastapi import APIRouter, Request
from app.services.hardware_client import GatewayError

router=APIRouter(prefix="/api/experiments")

@router.post("",status_code=201)
def create_experiment(payload:dict,request:Request):
    return request.app.state.manager.create(request.state.owner,payload)

@router.get("")
def list_experiments(request:Request):
    return request.app.state.manager.list(request.state.owner)

@router.get("/{experiment_id}")
def get_experiment(experiment_id:str,request:Request):
    return request.app.state.manager.get(experiment_id,request.state.owner)

@router.post("/{experiment_id}/run")
def run_experiment(experiment_id:str,request:Request):
    return request.app.state.manager.run(experiment_id,request.state.owner)

@router.post("/{experiment_id}/stop")
def stop_experiment(experiment_id:str,request:Request):
    return request.app.state.manager.stop(experiment_id,request.state.owner)

@router.get("/{experiment_id}/results")
def results(experiment_id:str,request:Request):
    return request.app.state.manager.get(experiment_id,request.state.owner)

@router.post("/{experiment_id}/instruments")
def configure_instrument(experiment_id:str,payload:dict,request:Request):
    e=request.app.state.manager.get(experiment_id,request.state.owner)
    if set(payload)!={"instrument","configuration"}: raise ValueError("INVALID_CONFIGURATION")
    if e["state"] not in ("ROUTE_PREPARE","GUARDED_POWER_UP","RUNNING"):
        raise ValueError("INVALID_STATE")
    if payload["instrument"] not in ("clock","generator","trigger"): raise ValueError("INVALID_CONFIGURATION")
    return request.app.state.gateway.call(e["station_id"],experiment_id,"configure_instrument",**payload)
