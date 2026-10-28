from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class RolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    descripcion: Optional[str] = None


class UsuarioBase(BaseModel):
    nombre_completo: str
    username: str
    email: Optional[str] = None
    rol_id: int
    activo: bool = True


class UsuarioCreate(UsuarioBase):
    password: str


class UsuarioUpdate(BaseModel):
    nombre_completo: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    rol_id: Optional[int] = None
    activo: Optional[bool] = None
    password: Optional[str] = None


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_completo: str
    username: str
    email: Optional[str] = None
    activo: bool
    fecha_creacion: datetime
    rol: RolOut


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut
