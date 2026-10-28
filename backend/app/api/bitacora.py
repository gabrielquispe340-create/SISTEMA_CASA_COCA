from datetime import date, datetime, time, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.security import require_admin
from app.db.database import get_db
from app.models.bitacora import BitacoraActividad
from app.models.usuario import Usuario
from app.schemas.bitacora import BitacoraActividadOut, ResumenBitacoraOut

router = APIRouter(
    prefix="/api/bitacora",
    tags=["CU05 - Bitácora de Actividades del Sistema (Admin)"],
)


@router.get("/resumen", response_model=ResumenBitacoraOut)
def obtener_resumen_bitacora(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """CU05: Devuelve los indicadores clave (KPIs) de la bitácora de auditoría (Solo ADMIN)."""
    hoy_inicio = datetime.combine(
        datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc
    )

    total_eventos = db.query(func.count(BitacoraActividad.id)).scalar() or 0

    eventos_hoy = (
        db.query(func.count(BitacoraActividad.id))
        .filter(BitacoraActividad.fecha_registro >= hoy_inicio)
        .scalar()
        or 0
    )

    accesos_exitosos = (
        db.query(func.count(BitacoraActividad.id))
        .filter(BitacoraActividad.accion == "INICIO_SESION")
        .scalar()
        or 0
    )

    alertas_criticas = (
        db.query(func.count(BitacoraActividad.id))
        .filter(BitacoraActividad.nivel.in_(["WARNING", "CRITICAL"]))
        .scalar()
        or 0
    )

    return ResumenBitacoraOut(
        total_eventos=int(total_eventos),
        eventos_hoy=int(eventos_hoy),
        accesos_exitosos=int(accesos_exitosos),
        alertas_criticas=int(alertas_criticas),
    )


@router.get("/", response_model=List[BitacoraActividadOut])
def listar_bitacora(
    buscar: Optional[str] = Query(
        default=None, description="Buscar en descripción, acción o usuario"
    ),
    modulo: Optional[str] = Query(
        default=None,
        description="Filtrar por módulo (AUTENTICACION, USUARIOS, VENTAS, CAJA, INVENTARIO, CATALOGO)",
    ),
    nivel: Optional[str] = Query(
        default=None, description="Filtrar por nivel (INFO, SUCCESS, WARNING, CRITICAL)"
    ),
    usuario_id: Optional[int] = Query(default=None),
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin: Optional[date] = Query(default=None),
    limite: int = Query(default=150, le=500),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """CU05: Consulta el historial completo de actividades del sistema con filtros avanzados (Solo ADMIN)."""
    query = db.query(BitacoraActividad).options(
        joinedload(BitacoraActividad.usuario).joinedload(Usuario.rol)
    )

    if modulo and modulo.strip() and modulo.upper() != "TODOS":
        query = query.filter(BitacoraActividad.modulo == modulo.strip().upper())

    if nivel and nivel.strip() and nivel.upper() != "TODOS":
        query = query.filter(BitacoraActividad.nivel == nivel.strip().upper())

    if usuario_id is not None:
        query = query.filter(BitacoraActividad.usuario_id == usuario_id)

    if fecha_inicio:
        dt_inicio = datetime.combine(fecha_inicio, time.min, tzinfo=timezone.utc)
        query = query.filter(BitacoraActividad.fecha_registro >= dt_inicio)

    if fecha_fin:
        dt_fin = datetime.combine(fecha_fin, time.max, tzinfo=timezone.utc)
        query = query.filter(BitacoraActividad.fecha_registro <= dt_fin)

    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.outerjoin(Usuario, BitacoraActividad.usuario_id == Usuario.id).filter(
            or_(
                BitacoraActividad.descripcion.ilike(patron),
                BitacoraActividad.accion.ilike(patron),
                BitacoraActividad.modulo.ilike(patron),
                Usuario.nombre_completo.ilike(patron),
                Usuario.username.ilike(patron),
            )
        )

    return query.order_by(BitacoraActividad.fecha_registro.desc()).limit(limite).all()
