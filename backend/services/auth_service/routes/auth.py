from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from schemas.auth import RegisterRequest, LoginRequest, ValidateRequest, EmailCheckRequest, CommandStatusRequest
import controllers.auth as ctrl

router = APIRouter()


@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    data = await ctrl.register(body.email, body.password, body.role)
    return {"success": True, "data": data}


@router.post("/login")
async def login(body: LoginRequest):
    data = await ctrl.login(body.email, body.password)
    return {"success": True, "data": data}


@router.post("/logout")
async def logout(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse(status_code=400, content={"success": False, "error": "No token provided"})
    data = await ctrl.logout(auth[7:])
    return {"success": True, "data": data}


@router.post("/validate")
async def validate(body: ValidateRequest):
    data = await ctrl.validate(body.token)
    return {"success": True, "data": data}


@router.post("/email-exists")
async def email_exists(body: EmailCheckRequest):
    data = await ctrl.email_exists(body.email)
    return {"success": True, "data": data}


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest):
    data = await ctrl.get_command(body.command_id)
    return {"success": True, "data": data}
