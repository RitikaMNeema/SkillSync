from fastapi import HTTPException
from models.recruiter import (
    find_company, create_company, update_company,
    recruiter_exists, create_recruiter, get_recruiter,
    update_recruiter, delete_recruiter, search_recruiters,
    recruiters_by_company, PAGE_SIZE,
)


async def create(body: dict) -> dict:
    rid = body["recruiter_id"]
    if await recruiter_exists(rid):
        raise HTTPException(409, "Recruiter profile already exists")

    company_id = body.get("company_id")
    if not company_id:
        if not body.get("company"):
            raise HTTPException(400, "Provide company_id or company object")
        c = body["company"]
        company_id = await create_company(c["name"], c.get("industry"), c.get("size"))
    else:
        if not await find_company(company_id):
            raise HTTPException(404, "Company not found")

    await create_recruiter(rid, company_id, body["name"], body["email"],
                           body.get("phone"), body.get("role"), body.get("access_level"))
    return await get_recruiter(rid)


async def get(recruiter_id: int) -> dict:
    r = await get_recruiter(recruiter_id)
    if not r:
        raise HTTPException(404, "Recruiter not found")
    return r


async def update(body: dict) -> dict:
    rid = body.pop("recruiter_id")
    existing = await get_recruiter(rid)
    if not existing:
        raise HTTPException(404, "Recruiter not found")
    company = body.pop("company", None)
    if body:
        await update_recruiter(rid, body)
    if company:
        await update_company(existing["company_id"], company)
    return await get_recruiter(rid)


async def delete(recruiter_id: int) -> dict:
    if not await get_recruiter(recruiter_id):
        raise HTTPException(404, "Recruiter not found")
    await delete_recruiter(recruiter_id)
    return {"recruiter_id": recruiter_id, "deleted": True}


async def search(name, company, industry, page) -> dict:
    rows, total = await search_recruiters(name, company, industry, page)
    return {"recruiters": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def by_company(company_id: int, page: int) -> dict:
    company = await find_company(company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    rows, total = await recruiters_by_company(company_id, page)
    return {"company": company, "recruiters": rows, "total": total, "page": page, "page_size": PAGE_SIZE}
