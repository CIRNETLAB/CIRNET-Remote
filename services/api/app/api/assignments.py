from fastapi import APIRouter, Request

router=APIRouter(prefix="/api/assignments")

@router.get("")
def list_assignments(request:Request):
    return request.app.state.repository.list_assignments()

@router.post("",status_code=201)
def create_assignment(payload:dict,request:Request):
    return request.app.state.repository.create_assignment(payload)

@router.get("/{assignment_id}")
def get_assignment(assignment_id:str,request:Request):
    return request.app.state.repository.get_assignment(assignment_id)
