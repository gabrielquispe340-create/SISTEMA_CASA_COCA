from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.usuario import UsuarioOut


class BitacoraActividadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_id: Optional[int] = None
    modulo: str
    accion: str
    descripcion: str
    ip_origen: Optional[str] = "127.0.0.1"
    nivel: str
    fecha_registro: datetime
    usuario: Optional[UsuarioOut] = None


class ResumenBitacoraOut(BaseModel):
    total_eventos: int
    eventos_hoy: int
    accesos_exitosos: int
    alertas_criticas: int
