from typing import Literal
from fastapi import APIRouter, Request
from contracts.boundary.models import OperationRecord, ErrorEnvelope
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix='/api/operations')


@router.get('/{operation_key}',operation_id='getOperation',response_model=OperationRecord,response_model_exclude_unset=True,
            responses=ERROR_RESPONSES)
def operation(operation_key:str,request:Request,kind:Literal['create','run','stop']='create',experiment_id:str|None=None):
    return request.app.state.manager.operation(request.state.owner,operation_key,kind,experiment_id)
