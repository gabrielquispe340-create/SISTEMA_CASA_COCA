from typing import Optional
from fastapi import Request
from sqlalchemy.orm import Session
from app.models.bitacora import BitacoraActividad


def registrar_evento_bitacora(
    db: Session,
    modulo: str,
    accion: str,
    descripcion: str,
    usuario_id: Optional[int] = None,
    nivel: str = "INFO",
    request: Optional[Request] = None,
    commit: bool = True,
) -> BitacoraActividad:
    """
    Registra un evento de auditoría en la tabla bitacora_actividades (CU05).
    """
    ip_cliente = "127.0.0.1"
    if request and request.client and request.client.host:
        ip_cliente = request.client.host

    evento = BitacoraActividad(
        usuario_id=usuario_id,
        modulo=modulo.upper(),
        accion=accion.upper(),
        descripcion=descripcion,
        ip_origen=ip_cliente,
        nivel=nivel.upper(),
    )
    db.add(evento)
    if commit:
        db.commit()
        db.refresh(evento)
    return evento
