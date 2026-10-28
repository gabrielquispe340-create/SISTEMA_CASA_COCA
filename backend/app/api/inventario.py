from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.bitacora_helper import registrar_evento_bitacora
from app.core.security import require_admin, require_empleado_or_admin
from app.db.database import get_db
from app.db.seed import seed_initial_data
from app.models.catalogo import Producto, Proveedor
from app.models.inventario import Compra, DetalleCompra, MovimientoInventario
from app.models.usuario import Usuario
from app.schemas.inventario import (
    ActualizarVencimientoProducto,
    AjusteInventarioCreate,
    AlertaStockItemOut,
    AlertaVencimientoItemOut,
    CompraCreate,
    CompraOut,
    DetalleCompraOut,
    ItemStockDisponibleOut,
    MovimientoInventarioOut,
    ResumenAlertasInventarioOut,
    ResumenStockDisponibleOut,
)

router = APIRouter(
    prefix="/api/inventario", tags=["Inventario, Stock Disponible, Compras y Kardex"]
)


# =============================================================================
# CU09: CONSULTAR STOCK DISPONIBLE (ADM, EMP)
# =============================================================================
@router.get("/stock-disponible", response_model=ResumenStockDisponibleOut)
def consultar_stock_disponible(
    buscar: Optional[str] = Query(default=None),
    categoria_id: Optional[int] = Query(default=None),
    nivel: Optional[str] = Query(
        default=None, description="Filtrar por OPTIMO, BAJO o AGOTADO"
    ),
    solo_activos: bool = Query(default=True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """
    Consulta el stock disponible en tiempo real de todos los productos de la tienda,
    incluyendo alertas de stock mínimo, semáforo de cobertura y valorización (CU09 - ADM, EMP).
    """
    seed_initial_data(db)

    query = db.query(Producto).options(
        joinedload(Producto.categoria), joinedload(Producto.proveedor)
    )
    if solo_activos:
        query = query.filter(Producto.activo.is_(True))
    if categoria_id is not None and categoria_id > 0:
        query = query.filter(Producto.categoria_id == categoria_id)
    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(patron),
                Producto.codigo_barras.ilike(patron),
                Producto.descripcion.ilike(patron),
            )
        )

    productos = query.order_by(Producto.stock_actual.asc(), Producto.nombre.asc()).all()

    total_unidades = 0
    optimos = 0
    bajos = 0
    agotados = 0
    valor_costo = Decimal("0.00")
    valor_venta = Decimal("0.00")
    items_out: List[ItemStockDisponibleOut] = []

    for p in productos:
        stock_act = int(p.stock_actual or 0)
        stock_min = max(1, int(p.stock_minimo or 5))

        if stock_act <= 0:
            estado = "AGOTADO"
            agotados += 1
            porcentaje = 0
        elif stock_act <= stock_min:
            estado = "BAJO"
            bajos += 1
            porcentaje = min(99, max(12, int((stock_act / (stock_min * 2)) * 100)))
        else:
            estado = "OPTIMO"
            optimos += 1
            porcentaje = min(100, max(50, int((stock_act / (stock_min * 3)) * 100)))

        if nivel and nivel.upper() in ("OPTIMO", "BAJO", "AGOTADO"):
            if estado != nivel.upper():
                continue

        total_unidades += max(0, stock_act)
        costo_u = Decimal(str(p.precio_compra or 0))
        venta_u = Decimal(str(p.precio_venta or 0))
        val_venta_item = venta_u * max(0, stock_act)

        valor_costo += costo_u * max(0, stock_act)
        valor_venta += val_venta_item

        items_out.append(
            ItemStockDisponibleOut(
                id=p.id,
                codigo_barras=p.codigo_barras,
                nombre=p.nombre,
                descripcion=p.descripcion,
                categoria_id=p.categoria_id,
                categoria_nombre=p.categoria.nombre if p.categoria else "General",
                proveedor_nombre=p.proveedor.nombre_empresa if p.proveedor else None,
                stock_actual=stock_act,
                stock_minimo=int(p.stock_minimo or 0),
                estado_stock=estado,
                porcentaje_nivel=porcentaje,
                precio_compra=costo_u,
                precio_venta=venta_u,
                valor_stock_venta=val_venta_item,
                fecha_vencimiento=p.fecha_vencimiento,
                lote=p.lote,
                activo=p.activo,
                fecha_actualizacion=p.fecha_actualizacion,
            )
        )

    return ResumenStockDisponibleOut(
        total_productos=len(items_out),
        total_unidades_disponibles=total_unidades,
        productos_optimos=optimos,
        productos_stock_bajo=bajos,
        productos_agotados=agotados,
        valor_total_costo=valor_costo,
        valor_total_venta=valor_venta,
        items=items_out,
    )


# =============================================================================
# CU11: GENERAR ALERTAS DE STOCK MÍNIMO Y PRODUCTOS PRÓXIMOS A VENCER (ADM)
# =============================================================================
def _construir_resumen_alertas(
    db: Session, dias_umbral: int = 30, incluir_vigentes: bool = False
) -> ResumenAlertasInventarioOut:
    seed_initial_data(db)

    productos = (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.activo.is_(True))
        .all()
    )

    hoy = date.today()
    alertas_stock: List[AlertaStockItemOut] = []
    alertas_vencimiento: List[AlertaVencimientoItemOut] = []

    total_agotados = 0
    total_criticos = 0
    total_vencidos = 0
    total_proximos = 0
    costo_total_reposicion = Decimal("0.00")
    valor_total_riesgo = Decimal("0.00")

    for p in productos:
        stock_act = int(p.stock_actual or 0)
        stock_min = max(1, int(p.stock_minimo or 5))
        costo_unit = Decimal(str(p.precio_compra or 0))
        venta_unit = Decimal(str(p.precio_venta or 0))
        cat_nom = p.categoria.nombre if p.categoria else "General"
        prov_nom = p.proveedor.nombre_empresa if p.proveedor else "Sin proveedor"

        # 1. Evaluación de Stock Mínimo
        if stock_act <= stock_min:
            es_agotado = stock_act <= 0
            if es_agotado:
                total_agotados += 1
                nivel_st = "AGOTADO"
                msg_st = f"Producto sin existencias (0 uds. disponibles, mínimo requerido: {stock_min})."
            else:
                total_criticos += 1
                nivel_st = "CRITICO"
                msg_st = f"Stock por debajo del umbral de seguridad ({stock_act} uds. <= mín. {stock_min})."

            deficit = max(1, stock_min - stock_act)
            sugerido = max(stock_min * 2 - stock_act, stock_min)
            costo_rep = costo_unit * sugerido
            costo_total_reposicion += costo_rep

            alertas_stock.append(
                AlertaStockItemOut(
                    producto_id=p.id,
                    codigo_barras=p.codigo_barras,
                    nombre=p.nombre,
                    categoria_nombre=cat_nom,
                    proveedor_nombre=prov_nom,
                    stock_actual=stock_act,
                    stock_minimo=stock_min,
                    deficit_unidades=deficit,
                    cantidad_compra_sugerida=sugerido,
                    nivel_alerta=nivel_st,
                    mensaje_alerta=msg_st,
                    precio_compra=costo_unit,
                    costo_reposicion_estimado=costo_rep,
                )
            )

        # 2. Evaluación de Fecha de Vencimiento
        if p.fecha_vencimiento is not None:
            dias_rest = (p.fecha_vencimiento - hoy).days
            val_riesgo = venta_unit * max(0, stock_act)

            if dias_rest < 0:
                estado_venc = "VENCIDO"
                accion_sug = "Retirar de mostrador inmediatamente y registrar baja por merma."
                total_vencidos += 1
                valor_total_riesgo += val_riesgo
            elif dias_rest <= 7:
                estado_venc = "URGENTE"
                accion_sug = "Priorizar salida inmediata en mostrador / aplicar promoción rápida."
                total_proximos += 1
                valor_total_riesgo += val_riesgo
            elif dias_rest <= dias_umbral:
                estado_venc = "PREVENTIVO"
                accion_sug = "Ubicar al frente del estante (FEFO: primero en vencer, primero en salir)."
                total_proximos += 1
                valor_total_riesgo += val_riesgo
            else:
                estado_venc = "VIGENTE"
                accion_sug = "Fecha de vencimiento dentro del margen seguro."

            if dias_rest <= dias_umbral or incluir_vigentes:
                alertas_vencimiento.append(
                    AlertaVencimientoItemOut(
                        producto_id=p.id,
                        codigo_barras=p.codigo_barras,
                        nombre=p.nombre,
                        categoria_nombre=cat_nom,
                        lote=p.lote or "LOTE-GEN",
                        stock_actual=stock_act,
                        fecha_vencimiento=p.fecha_vencimiento,
                        dias_restantes=dias_rest,
                        estado_vencimiento=estado_venc,
                        accion_sugerida=accion_sug,
                        valor_riesgo_venta=val_riesgo,
                    )
                )

    alertas_stock.sort(key=lambda x: (x.stock_actual, -x.deficit_unidades))
    alertas_vencimiento.sort(key=lambda x: x.dias_restantes)

    return ResumenAlertasInventarioOut(
        fecha_generacion=datetime.now(timezone.utc),
        dias_umbral_vencimiento=dias_umbral,
        total_alertas_activas=(
            total_agotados + total_criticos + total_vencidos + total_proximos
        ),
        total_agotados=total_agotados,
        total_stock_critico=total_criticos,
        total_vencidos=total_vencidos,
        total_proximos_vencer=total_proximos,
        costo_total_reposicion=costo_total_reposicion,
        valor_total_riesgo_vencimiento=valor_total_riesgo,
        alertas_stock=alertas_stock,
        alertas_vencimiento=alertas_vencimiento,
    )


@router.get("/alertas", response_model=ResumenAlertasInventarioOut)
def obtener_alertas_inventario(
    dias_umbral: int = Query(
        default=30,
        ge=1,
        le=365,
        description="Ventana de días para considerar un producto próximo a vencer",
    ),
    incluir_vigentes: bool = Query(
        default=False,
        description="Si es True, incluye también los productos con vencimiento mayor al umbral",
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """Obtiene en tiempo real las alertas de stock mínimo y productos próximos a vencer (CU11 - Solo ADMIN)."""
    return _construir_resumen_alertas(
        db=db, dias_umbral=dias_umbral, incluir_vigentes=incluir_vigentes
    )


@router.post("/alertas/generar", response_model=ResumenAlertasInventarioOut)
def generar_y_auditar_alertas(
    request: Request,
    dias_umbral: int = Query(default=30, ge=1, le=365),
    incluir_vigentes: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """
    Ejecuta un barrido completo del catálogo para generar alertas de stock mínimo y
    productos próximos a vencer, registrando la auditoría en la Bitácora (CU11 - Solo ADMIN).
    """
    resumen = _construir_resumen_alertas(
        db=db, dias_umbral=dias_umbral, incluir_vigentes=incluir_vigentes
    )

    registrar_evento_bitacora(
        db=db,
        modulo="INVENTARIO",
        accion="GENERAR_ALERTAS",
        descripcion=(
            f"Generación de alertas de inventario (umbral {dias_umbral} días): "
            f"{resumen.total_agotados} agotados, {resumen.total_stock_critico} con stock crítico, "
            f"{resumen.total_vencidos} vencidos y {resumen.total_proximos_vencer} próximos a vencer."
        ),
        usuario_id=admin_actual.id,
        nivel="WARNING" if resumen.total_alertas_activas > 0 else "INFO",
        request=request,
    )

    return resumen


@router.patch("/productos/{producto_id}/vencimiento")
def actualizar_vencimiento_y_umbral(
    producto_id: int,
    datos: ActualizarVencimientoProducto,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Actualiza la fecha de vencimiento, lote y/o stock mínimo de un producto desde el Centro de Alertas (CU11)."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado.",
        )

    if "fecha_vencimiento" in datos.model_fields_set:
        producto.fecha_vencimiento = datos.fecha_vencimiento
    if datos.lote is not None:
        producto.lote = datos.lote.strip() or None
    if datos.stock_minimo is not None:
        producto.stock_minimo = datos.stock_minimo

    db.commit()
    db.refresh(producto)

    registrar_evento_bitacora(
        db=db,
        modulo="INVENTARIO",
        accion="ACTUALIZAR_VENCIMIENTO_STOCK_MIN",
        descripcion=(
            f"Se actualizó control de alerta en '{producto.nombre}' (SKU {producto.codigo_barras}): "
            f"Vencimiento={producto.fecha_vencimiento or 'S/F'}, Lote={producto.lote or '-'}, "
            f"Stock Mínimo={producto.stock_minimo} uds."
        ),
        usuario_id=admin_actual.id,
        nivel="INFO",
        request=request,
    )

    return {
        "mensaje": "Parámetros de vencimiento y stock mínimo actualizados correctamente.",
        "producto_id": producto.id,
        "fecha_vencimiento": producto.fecha_vencimiento,
        "lote": producto.lote,
        "stock_minimo": producto.stock_minimo,
    }


def _formatear_compra_out(compra: Compra) -> CompraOut:
    detalles_out: List[DetalleCompraOut] = []
    total_unidades = 0
    for d in (compra.detalles or []):
        total_unidades += int(d.cantidad or 0)
        detalles_out.append(
            DetalleCompraOut(
                id=d.id,
                compra_id=d.compra_id,
                producto_id=d.producto_id,
                producto_nombre=d.producto.nombre if d.producto else f"Producto #{d.producto_id}",
                producto_codigo=d.producto.codigo_barras if d.producto else "-",
                cantidad=d.cantidad,
                costo_unitario_compra=d.costo_unitario_compra,
                subtotal_linea=d.subtotal_linea,
            )
        )
    return CompraOut(
        id=compra.id,
        proveedor_id=compra.proveedor_id,
        proveedor_nombre=compra.proveedor.nombre_empresa if compra.proveedor else "Proveedor General",
        usuario_id=compra.usuario_id,
        usuario_nombre=compra.usuario.nombre_completo if compra.usuario else "Administrador",
        numero_factura_proveedor=compra.numero_factura_proveedor,
        fecha_compra=compra.fecha_compra,
        total_compra=compra.total_compra,
        total_unidades=total_unidades,
        total_items=len(detalles_out),
        estado=compra.estado,
        detalles=detalles_out,
    )


@router.post("/compras", response_model=CompraOut, status_code=status.HTTP_201_CREATED)
def registrar_compra(
    datos: CompraCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """
    CU13: Registrar compra de mercadería (ingreso a inventario) - Solo ADMIN:
    - Valida proveedor e ítems ingresados.
    - Incrementa el stock_actual de cada producto.
    - Actualiza el precio_compra (costo unitario de adquisición).
    - Opcionalmente actualiza precio_venta, fecha_vencimiento y lote (integración FEFO CU11).
    - Registra el comprobante de compra (Compra y DetalleCompra).
    - Registra cada movimiento de entrada tipo 'COMPRA' en el Kardex.
    - Registra evento auditable en la Bitácora del Sistema (CU05).
    """
    if not datos.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La compra debe incluir al menos un producto.",
        )

    proveedor = None
    if datos.proveedor_id and datos.proveedor_id > 0:
        proveedor = db.query(Proveedor).filter(Proveedor.id == datos.proveedor_id).first()
        if not proveedor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El proveedor seleccionado no existe en el catálogo.",
            )

    total_compra = Decimal("0.00")
    detalles_compra: List[DetalleCompra] = []
    movimientos: List[MovimientoInventario] = []
    nombres_productos: List[str] = []

    for item in datos.items:
        producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
        if not producto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto con ID {item.producto_id} no encontrado.",
            )

        costo_unit = Decimal(str(item.costo_unitario_compra))
        subtotal_linea = costo_unit * item.cantidad
        total_compra += subtotal_linea

        stock_anterior = producto.stock_actual
        producto.stock_actual += item.cantidad
        producto.precio_compra = costo_unit

        if item.nuevo_precio_venta is not None and item.nuevo_precio_venta > 0:
            producto.precio_venta = Decimal(str(item.nuevo_precio_venta))
        if item.fecha_vencimiento:
            producto.fecha_vencimiento = item.fecha_vencimiento
        if item.lote and item.lote.strip():
            producto.lote = item.lote.strip()
        if proveedor and not producto.proveedor_id:
            producto.proveedor_id = proveedor.id

        detalles_compra.append(
            DetalleCompra(
                producto_id=producto.id,
                cantidad=item.cantidad,
                costo_unitario_compra=costo_unit,
                subtotal_linea=subtotal_linea,
            )
        )

        ref_fac = f"Factura: {datos.numero_factura_proveedor}" if datos.numero_factura_proveedor else "Sin Factura"
        if datos.observaciones:
            ref_fac += f" ({datos.observaciones.strip()})"

        empaque_txt = ""
        if item.cantidad_paquetes and item.unidades_por_paquete and item.unidades_por_paquete > 1:
            empaque_txt = f" [{item.cantidad_paquetes} bultos/packs x {item.unidades_por_paquete} uds]"

        prov_referencia = f"al proveedor '{proveedor.nombre_empresa}'" if proveedor else "(Proveedor no especificado)"
        movimientos.append(
            MovimientoInventario(
                producto_id=producto.id,
                usuario_id=current_user.id,
                tipo_movimiento="COMPRA",
                cantidad=item.cantidad,
                stock_anterior=stock_anterior,
                stock_resultante=producto.stock_actual,
                referencia=f"Ingreso por Compra {prov_referencia} - {ref_fac}{empaque_txt}",
            )
        )
        nombres_productos.append(f"{producto.nombre} (+{item.cantidad} uds{empaque_txt})")

    compra = Compra(
        proveedor_id=proveedor.id if proveedor else None,
        usuario_id=current_user.id,
        numero_factura_proveedor=datos.numero_factura_proveedor.strip() if datos.numero_factura_proveedor else None,
        total_compra=total_compra,
        estado="RECIBIDA",
        detalles=detalles_compra,
    )
    db.add(compra)
    for mov in movimientos:
        db.add(mov)

    db.commit()
    db.refresh(compra)

    # Recargar con relaciones completas
    compra_cargada = (
        db.query(Compra)
        .options(
            joinedload(Compra.detalles).joinedload(DetalleCompra.producto),
            joinedload(Compra.proveedor),
            joinedload(Compra.usuario),
        )
        .filter(Compra.id == compra.id)
        .first()
    )

    resumen_items = ", ".join(nombres_productos[:3])
    if len(nombres_productos) > 3:
        resumen_items += f" y {len(nombres_productos) - 3} más"

    prov_bitacora = f"al proveedor '{proveedor.nombre_empresa}'" if proveedor else "sin proveedor especificado"
    registrar_evento_bitacora(
        db=db,
        modulo="INVENTARIO",
        accion="REGISTRAR_COMPRA",
        descripcion=(
            f"Compra #{compra.id} de mercadería registrada {prov_bitacora}. "
            f"Factura: {datos.numero_factura_proveedor or 'S/N'}. "
            f"Total: Bs. {total_compra:.2f} ({len(datos.items)} productos: {resumen_items})."
        ),
        usuario_id=current_user.id,
        nivel="SUCCESS",
    )

    return _formatear_compra_out(compra_cargada)


@router.get("/compras", response_model=List[CompraOut])
def listar_compras(
    buscar: Optional[str] = Query(default=None),
    proveedor_id: Optional[int] = Query(default=None),
    estado: Optional[str] = Query(default=None),
    fecha_desde: Optional[str] = Query(default=None),
    fecha_hasta: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """
    Lista el historial de compras de mercadería a proveedores (Solo ADMIN).
    Soporta búsqueda por texto, proveedor, estado y rango de fechas.
    """
    seed_initial_data(db)

    query = (
        db.query(Compra)
        .options(
            joinedload(Compra.detalles).joinedload(DetalleCompra.producto),
            joinedload(Compra.proveedor),
            joinedload(Compra.usuario),
        )
        .order_by(Compra.fecha_compra.desc())
    )

    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.outerjoin(Compra.proveedor).filter(
            or_(
                Compra.numero_factura_proveedor.ilike(patron),
                Proveedor.nombre_empresa.ilike(patron),
            )
        )

    if proveedor_id and proveedor_id > 0:
        query = query.filter(Compra.proveedor_id == proveedor_id)

    if estado and estado != "TODOS":
        query = query.filter(Compra.estado == estado)

    if fecha_desde:
        query = query.filter(Compra.fecha_compra >= f"{fecha_desde} 00:00:00")

    if fecha_hasta:
        query = query.filter(Compra.fecha_compra <= f"{fecha_hasta} 23:59:59")

    compras = query.limit(300).all()
    return [_formatear_compra_out(c) for c in compras]


@router.get("/compras/{compra_id}", response_model=CompraOut)
def obtener_detalle_compra(
    compra_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """
    Consulta los detalles y el comprobante de una compra de mercadería por ID (Solo ADMIN).
    """
    compra = (
        db.query(Compra)
        .options(
            joinedload(Compra.detalles).joinedload(DetalleCompra.producto),
            joinedload(Compra.proveedor),
            joinedload(Compra.usuario),
        )
        .filter(Compra.id == compra_id)
        .first()
    )
    if not compra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Compra con ID #{compra_id} no encontrada.",
        )
    return _formatear_compra_out(compra)


@router.post("/compras/{compra_id}/anular", response_model=CompraOut)
def anular_compra(
    compra_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """
    Anula una compra de mercadería previa (Solo ADMIN):
    - Verifica que la compra esté RECIBIDA.
    - Valida que exista stock disponible para revertir el ingreso.
    - Descuenta del inventario las unidades ingresadas en dicha compra.
    - Registra movimientos de Kardex con tipo 'ANULACION_COMPRA'.
    - Marca la compra como 'ANULADA' y audita en la Bitácora.
    """
    compra = (
        db.query(Compra)
        .options(
            joinedload(Compra.detalles).joinedload(DetalleCompra.producto),
            joinedload(Compra.proveedor),
            joinedload(Compra.usuario),
        )
        .filter(Compra.id == compra_id)
        .first()
    )
    if not compra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Compra con ID #{compra_id} no encontrada.",
        )
    if compra.estado == "ANULADA":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La compra #{compra_id} ya se encuentra ANULADA.",
        )

    # Validar que los productos tienen stock suficiente para revertir
    for d in compra.detalles:
        producto = db.query(Producto).filter(Producto.id == d.producto_id).first()
        if not producto:
            continue
        if producto.stock_actual < d.cantidad:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"No se puede anular la compra: el producto '{producto.nombre}' solo tiene "
                    f"{producto.stock_actual} unidades en stock actual y se requiere revertir {d.cantidad} unidades."
                ),
            )

    # Revertir stock y asentar Kardex
    for d in compra.detalles:
        producto = db.query(Producto).filter(Producto.id == d.producto_id).first()
        if not producto:
            continue
        stock_ant = producto.stock_actual
        producto.stock_actual -= d.cantidad

        mov = MovimientoInventario(
            producto_id=producto.id,
            usuario_id=current_user.id,
            tipo_movimiento="ANULACION_COMPRA",
            cantidad=d.cantidad,
            stock_anterior=stock_ant,
            stock_resultante=producto.stock_actual,
            referencia=f"Anulación de Compra #{compra.id} (Factura {compra.numero_factura_proveedor or 'S/N'})",
        )
        db.add(mov)

    compra.estado = "ANULADA"
    db.commit()
    db.refresh(compra)

    prov_nombre = compra.proveedor.nombre_empresa if compra.proveedor else "Proveedor"
    registrar_evento_bitacora(
        db=db,
        modulo="INVENTARIO",
        accion="ANULAR_COMPRA",
        descripcion=f"Compra #{compra.id} anulada. Se revirtió el ingreso de mercadería del proveedor '{prov_nombre}'. Total: Bs. {compra.total_compra:.2f}.",
        usuario_id=current_user.id,
        nivel="WARNING",
    )

    return _formatear_compra_out(compra)


@router.post(
    "/ajustes",
    response_model=MovimientoInventarioOut,
    status_code=status.HTTP_201_CREATED,
)
def registrar_ajuste_inventario(
    datos: AjusteInventarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Permite al Administrador hacer ajustes manuales de stock (entradas o mermas/salidas)."""
    tipo = datos.tipo_movimiento.upper()
    if tipo not in ("AJUSTE_ENTRADA", "AJUSTE_SALIDA"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El tipo de movimiento debe ser 'AJUSTE_ENTRADA' o 'AJUSTE_SALIDA'",
        )

    producto = db.query(Producto).filter(Producto.id == datos.producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    stock_anterior = producto.stock_actual
    if tipo == "AJUSTE_SALIDA":
        if producto.stock_actual < datos.cantidad:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No se puede descontar {datos.cantidad} unidades; el stock actual es {producto.stock_actual}",
            )
        producto.stock_actual -= datos.cantidad
    else:
        producto.stock_actual += datos.cantidad

    movimiento = MovimientoInventario(
        producto_id=producto.id,
        usuario_id=current_user.id,
        tipo_movimiento=tipo,
        cantidad=datos.cantidad,
        stock_anterior=stock_anterior,
        stock_resultante=producto.stock_actual,
        referencia=datos.referencia,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)

    registrar_evento_bitacora(
        db=db,
        modulo="INVENTARIO",
        accion=tipo,
        descripcion=f"Ajuste de inventario ({tipo}) en '{producto.nombre}': {datos.cantidad} uds. Motivo: {datos.referencia}.",
        usuario_id=current_user.id,
        nivel="WARNING" if tipo == "AJUSTE_SALIDA" else "INFO",
    )
    return movimiento


@router.get("/kardex", response_model=List[MovimientoInventarioOut])
def consultar_kardex(
    producto_id: Optional[int] = Query(default=None),
    limite: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """Consulta el historial de movimientos de inventario / Kardex."""
    query = db.query(MovimientoInventario)
    if producto_id is not None:
        query = query.filter(MovimientoInventario.producto_id == producto_id)
    movimientos = (
        query.order_by(MovimientoInventario.fecha_movimiento.desc())
        .limit(limite)
        .all()
    )

    mapa_productos = {
        p.id: (p.nombre, p.codigo_barras)
        for p in db.query(Producto.id, Producto.nombre, Producto.codigo_barras).all()
    }
    mapa_usuarios = {
        u.id: u.nombre_completo
        for u in db.query(Usuario.id, Usuario.nombre_completo).all()
    }

    resultado: List[MovimientoInventarioOut] = []
    for m in movimientos:
        prod_info = mapa_productos.get(m.producto_id, ("Producto", "-"))
        resultado.append(
            MovimientoInventarioOut(
                id=m.id,
                producto_id=m.producto_id,
                usuario_id=m.usuario_id,
                tipo_movimiento=m.tipo_movimiento,
                cantidad=m.cantidad,
                stock_anterior=m.stock_anterior,
                stock_resultante=m.stock_resultante,
                referencia=m.referencia,
                fecha_movimiento=m.fecha_movimiento,
                producto_nombre=prod_info[0],
                producto_codigo=prod_info[1],
                usuario_nombre=mapa_usuarios.get(m.usuario_id, "Sistema"),
            )
        )
    return resultado
