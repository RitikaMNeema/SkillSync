from fastapi import APIRouter, Depends
from schemas.recruiters import (
    CreateRecruiterRequest, GetRecruiterRequest, UpdateRecruiterRequest,
    DeleteRecruiterRequest, SearchRecruitersRequest, ByCompanyRequest,
)
import controllers.recruiters as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/create", status_code=201)
async def create(body: CreateRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.create(body.model_dump())}

@router.post("/get")
async def get(body: GetRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get(body.recruiter_id)}

@router.post("/update")
async def update(body: UpdateRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.update(body.model_dump(exclude_none=True))}

@router.post("/delete")
async def delete(body: DeleteRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.delete(body.recruiter_id)}

@router.post("/search")
async def search(body: SearchRecruitersRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.search(body.name, body.company, body.industry, body.page)}

@router.post("/byCompany")
async def by_company(body: ByCompanyRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_company(body.company_id, body.page)}
