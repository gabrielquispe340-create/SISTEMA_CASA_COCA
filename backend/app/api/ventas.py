from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.bitacora_helper import registrar_evento_bitacora
from app.core.security import require_admin, require_empleado_or_admin
from app.db.database import get_db
from app.models.catalogo import Producto
from app.models.inventario import MovimientoInventario
from app.models.usuario import Usuario
from app.models.venta import Cliente, DetalleVenta, SesionCaja, Venta
from app.schemas.venta import ClienteCreate, ClienteOut, VentaCreate, VentaOut

router = APIRouter(prefix="/api/ventas", tags=["Ventas y Punto de Venta (POS)"])


# =============================================================================
# GESTIÓN DE CLIENTES EN MOSTRADOR
# =============================================================================
@router.get("/clientes", response_model=List[ClienteOut])
def listar_clientes(
    buscar: Optional[str] = Query(default=None, description="Buscar por NIT/CI o nombre"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """Permite al empleado buscar clientes por documento o nombre al facturar."""
    query = db.query(Cliente)
    if buscar:
        patron = f"%{buscar.strip()}%"
        query = query.filter(
            (Cliente.documento_identidad.ilike(patron))
            | (Cliente.nombre_completo.ilike(patron))
        )
    return query.order_by(Cliente.id).limit(50).all()


@router.post(
    "/clientes", response_model=ClienteOut, status_code=status.HTTP_201_CREATED
)
def registrar_cliente(
    datos: ClienteCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """Registra un nuevo cliente rápidamente desde el Punto de Venta."""
    existente = (
        db.query(Cliente)
        .filter(Cliente.documento_identidad == datos.documento_identidad)
        .first()
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un cliente registrado con ese documento (NIT/CI)",
        )
    cliente = Cliente(**datos.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


# =============================================================================
# REGISTRO Y CONSULTA DE VENTAS (POS)
# =============================================================================
@router.post("/", response_model=VentaOut, status_code=status.HTTP_201_CREATED)
def registrar_venta(
    datos: VentaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """
    Registra una venta completa en el Punto de Venta (POS):
    1. Verifica que haya productos en el carrito y stock suficiente.
    2. Descuenta el stock de cada producto automáticamente.
    3. Guarda el precio de venta y el costo histórico para reportes exactos de ganancia.
    4. Registra cada salida en el Kardex (movimientos_inventario).
    5. Si el empleado tiene una sesión de caja abierta, suma el importe a su turno.
    """
    if not datos.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La venta debe incluir al menos un producto.",
        )

    # Buscar sesión de caja abierta del usuario
    sesion_caja = (
        db.query(SesionCaja)
        .filter(
            SesionCaja.usuario_id == current_user.id,
            SesionCaja.estado == "ABIERTA",
        )
        .first()
    )

    # Validar que un empleado no pueda vender si la caja no está abierta
    if current_user.rol and current_user.rol.nombre == "EMPLEADO" and not sesion_caja:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes realizar una venta porque tu caja está cerrada. Debes abrir tu turno de caja en el módulo de Caja y Movimientos antes de comenzar a vender.",
        )

    # Generar número de comprobante correlativo
    ultimo_id = db.query(Venta.id).order_by(Venta.id.desc()).first()
    siguiente_num = (ultimo_id[0] + 1) if ultimo_id else 1
    fecha_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    numero_comprobante = f"V-{fecha_str}-{siguiente_num:05d}"

    subtotal_acumulado = Decimal("0.00")
    detalles_a_crear: List[DetalleVenta] = []
    movimientos_a_crear: List[MovimientoInventario] = []

    for item in datos.items:
        producto = (
            db.query(Producto)
            .filter(Producto.id == item.producto_id, Producto.activo.is_(True))
            .first()
        )
        if not producto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"El producto con ID {item.producto_id} no existe o está inactivo.",
            )
        if producto.stock_actual < item.cantidad:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Stock insuficiente para '{producto.nombre}'. "
                    f"Disponible: {producto.stock_actual}, Solicitado: {item.cantidad}."
                ),
            )

        precio_unit = Decimal(str(producto.precio_venta))
        costo_unit = Decimal(str(producto.precio_compra))
        desc_linea = Decimal(str(item.descuento_linea))
        subtotal_linea = (precio_unit * item.cantidad) - desc_linea

        if subtotal_linea < Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El descuento en '{producto.nombre}' no puede superar el precio.",
            )

        stock_anterior = producto.stock_actual
        producto.stock_actual -= item.cantidad

        subtotal_acumulado += subtotal_linea

        detalles_a_crear.append(
            DetalleVenta(
                producto_id=producto.id,
                cantidad=item.cantidad,
                precio_unitario=precio_unit,
                costo_unitario=costo_unit,
                descuento_linea=desc_linea,
                subtotal_linea=subtotal_linea,
            )
        )

        movimientos_a_crear.append(
            MovimientoInventario(
                producto_id=producto.id,
                usuario_id=current_user.id,
                tipo_movimiento="VENTA",
                cantidad=item.cantidad,
                stock_anterior=stock_anterior,
                stock_resultante=producto.stock_actual,
                referencia=f"Venta {numero_comprobante}",
            )
        )

    descuento_global = Decimal(str(datos.descuento_global))
    impuestos = Decimal(str(datos.impuestos))
    total_venta = subtotal_acumulado - descuento_global + impuestos

    if total_venta < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El total de la venta no puede ser negativo.",
        )

    nueva_venta = Venta(
        numero_comprobante=numero_comprobante,
        sesion_caja_id=sesion_caja.id if sesion_caja else None,
        usuario_id=current_user.id,
        cliente_id=datos.cliente_id,
        subtotal=subtotal_acumulado,
        descuento=descuento_global,
        impuestos=impuestos,
        total=total_venta,
        metodo_pago=datos.metodo_pago.upper(),
        estado="COMPLETADA",
        detalles=detalles_a_crear,
    )

    db.add(nueva_venta)
    for mov in movimientos_a_crear:
        db.add(mov)

    # Actualizar acumulados en la sesión de caja abierta
    if sesion_caja:
        if nueva_venta.metodo_pago == "EFECTIVO":
            sesion_caja.total_ventas_efectivo = Decimal(
                str(sesion_caja.total_ventas_efectivo)
            ) + total_venta
        else:
            sesion_caja.total_ventas_otros = Decimal(
                str(sesion_caja.total_ventas_otros)
            ) + total_venta
        sesion_caja.monto_final_esperado = (
            Decimal(str(sesion_caja.monto_inicial))
            + Decimal(str(sesion_caja.total_ventas_efectivo))
            + sesion_caja.total_ingresos
            - sesion_caja.total_egresos
        )

    # Registrar auditoría en la misma transacción (sin commit separado)
    registrar_evento_bitacora(
        db=db,
        modulo="VENTAS",
        accion="REGISTRAR_VENTA",
        descripcion=f"Venta {numero_comprobante} registrada por '{current_user.nombre_completo}' por un total de Bs. {total_venta} ({nueva_venta.metodo_pago}).",
        usuario_id=current_user.id,
        nivel="SUCCESS",
        commit=False,
    )

    # Un solo commit atómico para venta, detalles, movimientos, sesión de caja y bitácora
    db.commit()

    # Cargar la venta completa con todas sus relaciones para la respuesta
    venta_db = (
        db.query(Venta)
        .options(
            joinedload(Venta.detalles).joinedload(DetalleVenta.producto),
            joinedload(Venta.cliente),
            joinedload(Venta.usuario),
        )
        .filter(Venta.id == nueva_venta.id)
        .first()
    )
    return venta_db


@router.get("/", response_model=List[VentaOut])
def listar_ventas(
    limite: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """
    Si es EMPLEADO: devuelve sus ventas realizadas.
    Si es ADMIN: devuelve todas las ventas de la tienda.
    """
    query = (
        db.query(Venta)
        .options(
            joinedload(Venta.detalles).joinedload(DetalleVenta.producto),
            joinedload(Venta.cliente),
            joinedload(Venta.usuario),
        )
    )
    if current_user.rol.nombre != "ADMIN":
        query = query.filter(Venta.usuario_id == current_user.id)
    return query.order_by(Venta.fecha_venta.desc()).limit(limite).all()


@router.get("/{venta_id}", response_model=VentaOut)
def obtener_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_empleado_or_admin),
):
    """Obtiene los detalles completos de una venta por su ID."""
    venta = (
        db.query(Venta)
        .options(
            joinedload(Venta.detalles).joinedload(DetalleVenta.producto),
            joinedload(Venta.cliente),
            joinedload(Venta.usuario),
        )
        .filter(Venta.id == venta_id)
        .first()
    )
    if not venta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"La venta con ID #{venta_id} no existe.",
        )
    return venta


@router.post("/{venta_id}/anular", response_model=VentaOut)
def anular_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Anula una venta y reintegra automáticamente los productos al stock (Solo ADMIN)."""
    venta = (
        db.query(Venta)
        .options(
            joinedload(Venta.detalles).joinedload(DetalleVenta.producto),
            joinedload(Venta.cliente),
            joinedload(Venta.usuario),
        )
        .filter(Venta.id == venta_id)
        .first()
    )
    if not venta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Venta no encontrada",
        )
    if venta.estado == "ANULADA":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta venta ya fue anulada previamente",
        )

    for detalle in venta.detalles:
        producto = (
            db.query(Producto).filter(Producto.id == detalle.producto_id).first()
        )
        if producto:
            stock_ant = producto.stock_actual
            producto.stock_actual += detalle.cantidad
            db.add(
                MovimientoInventario(
                    producto_id=producto.id,
                    usuario_id=current_user.id,
                    tipo_movimiento="ANULACION",
                    cantidad=detalle.cantidad,
                    stock_anterior=stock_ant,
                    stock_resultante=producto.stock_actual,
                    referencia=f"Anulación de {venta.numero_comprobante}",
                )
            )

    venta.estado = "ANULADA"
    db.commit()
    db.refresh(venta)

    registrar_evento_bitacora(
        db=db,
        modulo="VENTAS",
        accion="ANULAR_VENTA",
        descripcion=f"El administrador '{current_user.nombre_completo}' anuló la venta {venta.numero_comprobante} (Bs. {venta.total}) y reintegró el stock.",
        usuario_id=current_user.id,
        nivel="CRITICAL",
    )
    return venta
