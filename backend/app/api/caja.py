from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.bitacora_helper import registrar_evento_bitacora
from app.core.security import require_admin, require_empleado_or_admin
from app.db.database import get_db
from app.models.usuario import Usuario
from app.models.venta import MovimientoCaja, SesionCaja
from app.schemas.venta import (
    MovimientoCajaCreate,
    MovimientoCajaOut,
    SesionCajaAbrir,
    SesionCajaCerrar,
    SesionCajaOut,
)

router = APIRouter(prefix="/api/caja", tags=["Turnos y Arqueo de Caja"])


@router.get("/actual", response_model=Optional[SesionCajaOut])
def obtener_caja_abierta(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """Obtiene la sesión de caja actualmente ABIERTA del empleado autenticado."""
    return (
        db.query(SesionCaja)
        .options(joinedload(SesionCaja.usuario), joinedload(SesionCaja.movimientos))
        .filter(
            SesionCaja.usuario_id == current_user.id,
            SesionCaja.estado == "ABIERTA",
        )
        .first()
    )


@router.post("/abrir", response_model=SesionCajaOut, status_code=status.HTTP_201_CREATED)
def abrir_caja(
    datos: SesionCajaAbrir,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """Abre un nuevo turno de caja para el empleado con un fondo inicial."""
    caja_activa = (
        db.query(SesionCaja)
        .filter(
            SesionCaja.usuario_id == current_user.id,
            SesionCaja.estado == "ABIERTA",
        )
        .first()
    )
    if caja_activa:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya tienes una sesión de caja abierta. Debes cerrarla antes de abrir otra.",
        )

    nueva_sesion = SesionCaja(
        usuario_id=current_user.id,
        monto_inicial=datos.monto_inicial,
        total_ventas_efectivo=Decimal("0.00"),
        total_ventas_otros=Decimal("0.00"),
        monto_final_esperado=datos.monto_inicial,
        estado="ABIERTA",
        observaciones=datos.observaciones,
    )
    db.add(nueva_sesion)
    db.commit()
    db.refresh(nueva_sesion)

    registrar_evento_bitacora(
        db=db,
        modulo="CAJA",
        accion="ABRIR_CAJA",
        descripcion=f"El empleado '{current_user.nombre_completo}' abrió turno de caja #{nueva_sesion.id} con fondo inicial de Bs. {datos.monto_inicial}.",
        usuario_id=current_user.id,
        nivel="SUCCESS",
    )
    return nueva_sesion


@router.post("/cerrar", response_model=SesionCajaOut)
def cerrar_caja(
    datos: SesionCajaCerrar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """Cierra la sesión de caja activa del empleado y calcula el arqueo (sobrante o faltante)."""
    sesion = (
        db.query(SesionCaja)
        .options(joinedload(SesionCaja.movimientos), joinedload(SesionCaja.usuario))
        .filter(
            SesionCaja.usuario_id == current_user.id,
            SesionCaja.estado == "ABIERTA",
        )
        .first()
    )
    if not sesion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tienes ninguna sesión de caja abierta actualmente.",
        )

    esperado = (
        Decimal(str(sesion.monto_inicial))
        + Decimal(str(sesion.total_ventas_efectivo))
        + sesion.total_ingresos
        - sesion.total_egresos
    )
    real = Decimal(str(datos.monto_final_real))

    sesion.fecha_cierre = datetime.now(timezone.utc)
    sesion.monto_final_esperado = esperado
    sesion.monto_final_real = real
    sesion.diferencia = real - esperado
    sesion.estado = "CERRADA"
    if datos.observaciones:
        sesion.observaciones = datos.observaciones

    db.commit()
    db.refresh(sesion)

    nivel_cierre = "WARNING" if sesion.diferencia < Decimal("0.00") else "INFO"
    registrar_evento_bitacora(
        db=db,
        modulo="CAJA",
        accion="CERRAR_CAJA",
        descripcion=(
            f"El empleado '{current_user.nombre_completo}' cerró caja #{sesion.id}. "
            f"Esperado: Bs. {esperado}, Real: Bs. {real}, Diferencia: Bs. {sesion.diferencia}."
        ),
        usuario_id=current_user.id,
        nivel=nivel_cierre,
    )
    return sesion


@router.get("/historial", response_model=List[SesionCajaOut])
def historial_cajas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """
    Si es ADMIN: devuelve el historial de todas las cajas de todos los empleados.
    Si es EMPLEADO: devuelve únicamente el historial de sus propios turnos.
    """
    query = db.query(SesionCaja).options(
        joinedload(SesionCaja.usuario),
        joinedload(SesionCaja.movimientos),
    )
    if current_user.rol.nombre != "ADMIN":
        query = query.filter(SesionCaja.usuario_id == current_user.id)
    return query.order_by(SesionCaja.fecha_apertura.desc()).limit(100).all()


# =============================================================================
# MOVIMIENTOS DE CAJA (INGRESOS Y EGRESOS EXCLUSIVO ADMINISTRADOR)
# =============================================================================
@router.get("/movimientos", response_model=List[MovimientoCajaOut])
def listar_movimientos_caja(
    sesion_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """
    Lista los movimientos de caja (ingresos y egresos).
    Función exclusiva de supervisión para el ADMINISTRADOR.
    """
    query = db.query(MovimientoCaja).options(joinedload(MovimientoCaja.usuario))

    if sesion_id:
        query = query.filter(MovimientoCaja.sesion_caja_id == sesion_id)

    return query.order_by(MovimientoCaja.fecha.desc()).limit(100).all()


@router.post("/movimientos", response_model=MovimientoCajaOut, status_code=status.HTTP_201_CREATED)
def registrar_movimiento_caja(
    datos: MovimientoCajaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """
    Registra una entrada (INGRESO) o salida (EGRESO) de efectivo en la caja.
    Exclusivo para el ADMINISTRADOR.
    """
    tipo = datos.tipo.upper().strip()
    if tipo not in ["INGRESO", "EGRESO"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El tipo de movimiento debe ser 'INGRESO' o 'EGRESO'.",
        )

    monto = Decimal(str(datos.monto))
    if monto <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El monto del movimiento debe ser estrictamente mayor a Bs. 0.00.",
        )

    motivo = datos.motivo.strip()
    if len(motivo) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El motivo o concepto del movimiento debe tener al menos 3 caracteres.",
        )

    # Buscar la sesión de caja correspondiente
    sesion = None
    if datos.sesion_caja_id:
        sesion = (
            db.query(SesionCaja)
            .options(joinedload(SesionCaja.movimientos))
            .filter(SesionCaja.id == datos.sesion_caja_id)
            .first()
        )
        if not sesion:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No se encontró la sesión de caja #{datos.sesion_caja_id}.",
            )
        if sesion.estado != "ABIERTA":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pueden registrar movimientos en una sesión de caja que ya está cerrada.",
            )
        if current_user.rol.nombre != "ADMIN" and sesion.usuario_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para registrar movimientos en la caja de otro usuario.",
            )
    else:
        # Buscar la caja abierta del usuario autenticado
        sesion = (
            db.query(SesionCaja)
            .options(joinedload(SesionCaja.movimientos))
            .filter(
                SesionCaja.usuario_id == current_user.id,
                SesionCaja.estado == "ABIERTA",
            )
            .first()
        )
        # Si es ADMIN y no tiene sesión propia abierta, buscar alguna sesión abierta en el sistema
        if not sesion and current_user.rol.nombre == "ADMIN":
            sesion = (
                db.query(SesionCaja)
                .options(joinedload(SesionCaja.movimientos))
                .filter(SesionCaja.estado == "ABIERTA")
                .order_by(SesionCaja.id.desc())
                .first()
            )

    if not sesion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se encontró ninguna sesión de caja abierta. Debes abrir un turno de caja antes de registrar movimientos.",
        )

    # Si es EGRESO, validar disponibilidad de efectivo en caja
    disponible_actual = (
        Decimal(str(sesion.monto_inicial))
        + Decimal(str(sesion.total_ventas_efectivo))
        + sesion.total_ingresos
        - sesion.total_egresos
    )

    if tipo == "EGRESO" and monto > disponible_actual:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Efectivo insuficiente en caja. El saldo disponible actual es de Bs. {disponible_actual:.2f}. "
                f"No es posible retirar o egresar Bs. {monto:.2f}."
            ),
        )

    # Crear el registro del movimiento
    nuevo_movimiento = MovimientoCaja(
        sesion_caja_id=sesion.id,
        usuario_id=current_user.id,
        tipo=tipo,
        monto=monto,
        motivo=motivo,
        numero_comprobante=datos.numero_comprobante.strip() if datos.numero_comprobante else None,
    )
    db.add(nuevo_movimiento)

    # Actualizar monto_final_esperado de la sesión de caja
    if tipo == "INGRESO":
        sesion.monto_final_esperado = Decimal(str(sesion.monto_final_esperado)) + monto
    else:
        sesion.monto_final_esperado = Decimal(str(sesion.monto_final_esperado)) - monto

    db.commit()
    db.refresh(nuevo_movimiento)

    # Registrar en bitácora de auditoría
    accion_bitacora = "INGRESO_CAJA" if tipo == "INGRESO" else "EGRESO_CAJA"
    comprobante_info = f" (Comprobante: {nuevo_movimiento.numero_comprobante})" if nuevo_movimiento.numero_comprobante else ""
    registrar_evento_bitacora(
        db=db,
        modulo="CAJA",
        accion=accion_bitacora,
        descripcion=(
            f"El usuario '{current_user.nombre_completo}' registró un {tipo} de efectivo por "
            f"Bs. {monto:.2f} en el turno de caja #{sesion.id}. Motivo: '{motivo}'.{comprobante_info}"
        ),
        usuario_id=current_user.id,
        nivel="INFO" if tipo == "INGRESO" else "WARNING",
    )

    return nuevo_movimiento
