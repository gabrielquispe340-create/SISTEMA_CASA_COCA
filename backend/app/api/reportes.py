from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.security import require_admin
from app.db.database import get_db
from app.models.catalogo import Categoria, Producto, Proveedor
from app.models.usuario import Usuario
from app.models.venta import DetalleVenta, Venta
from app.schemas.catalogo import ProductoOut
from app.schemas.reporte import (
    ItemInventarioReporteOut,
    RendimientoEmpleadoOut,
    ReporteGeneralAdminOut,
    ReporteInventarioOut,
    ReporteVentasFiltradoOut,
    ResumenFinancieroOut,
    ResumenInventarioOut,
    ResumenVentasFiltroOut,
    TopProductoOut,
    VentaFilaReporteOut,
    VentaPorCategoriaOut,
    VentaPorMetodoPagoOut,
)

router = APIRouter(
    prefix="/api/reportes", tags=["Reportes y Analítica Financiera (Admin)"]
)


@router.get("/dashboard", response_model=ReporteGeneralAdminOut)
def obtener_reporte_general(
    fecha_inicio: Optional[date] = Query(
        default=None, description="Fecha inicial (YYYY-MM-DD)"
    ),
    fecha_fin: Optional[date] = Query(
        default=None, description="Fecha final (YYYY-MM-DD)"
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """
    Genera el reporte ejecutivo completo para el Administrador:
    - Ingresos totales, costo de mercadería vendida y ganancia neta real.
    - Desglose de recaudación por método de pago (Efectivo, Tarjeta, QR).
    - Top 10 productos más vendidos y su utilidad generada.
    - Rendimiento de ventas por cada empleado.
    """
    filtro_ventas = [Venta.estado == "COMPLETADA"]
    if fecha_inicio:
        dt_inicio = datetime.combine(fecha_inicio, time.min, tzinfo=timezone.utc)
        filtro_ventas.append(Venta.fecha_venta >= dt_inicio)
    if fecha_fin:
        dt_fin = datetime.combine(fecha_fin, time.max, tzinfo=timezone.utc)
        filtro_ventas.append(Venta.fecha_venta <= dt_fin)

    # 1. Totales generales de ventas
    ventas_totales = (
        db.query(
            func.count(Venta.id).label("cantidad"),
            func.coalesce(func.sum(Venta.total), 0).label("ingresos"),
        )
        .filter(*filtro_ventas)
        .first()
    )
    cantidad_ventas = int(ventas_totales.cantidad or 0)
    ingresos_totales = Decimal(str(ventas_totales.ingresos or "0.00"))

    # 2. Costo histórico de mercadería vendida
    costo_query = (
        db.query(
            func.coalesce(
                func.sum(DetalleVenta.costo_unitario * DetalleVenta.cantidad), 0
            ).label("costo_total")
        )
        .join(Venta, Venta.id == DetalleVenta.venta_id)
        .filter(*filtro_ventas)
        .first()
    )
    costo_mercaderia = Decimal(str(costo_query.costo_total or "0.00"))
    ganancia_neta = ingresos_totales - costo_mercaderia
    ticket_promedio = (
        (ingresos_totales / cantidad_ventas).quantize(Decimal("0.01"))
        if cantidad_ventas > 0
        else Decimal("0.00")
    )

    # 3. Cantidad de productos con stock crítico
    stock_bajo_count = (
        db.query(func.count(Producto.id))
        .filter(
            Producto.activo.is_(True),
            Producto.stock_actual <= Producto.stock_minimo,
        )
        .scalar()
        or 0
    )

    resumen = ResumenFinancieroOut(
        cantidad_ventas=cantidad_ventas,
        ingresos_totales=ingresos_totales,
        costo_mercaderia_vendida=costo_mercaderia,
        ganancia_neta_estimada=ganancia_neta,
        ticket_promedio=ticket_promedio,
        productos_con_stock_bajo=int(stock_bajo_count),
    )

    # 4. Ventas agrupadas por método de pago
    metodos_rows = (
        db.query(
            Venta.metodo_pago,
            func.count(Venta.id).label("operaciones"),
            func.coalesce(func.sum(Venta.total), 0).label("recaudado"),
        )
        .filter(*filtro_ventas)
        .group_by(Venta.metodo_pago)
        .all()
    )
    por_metodo_pago = [
        VentaPorMetodoPagoOut(
            metodo_pago=row.metodo_pago,
            cantidad_operaciones=int(row.operaciones),
            total_recaudado=Decimal(str(row.recaudado)),
        )
        for row in metodos_rows
    ]

    # 5. Top 10 productos más vendidos
    top_rows = (
        db.query(
            Producto.id,
            Producto.codigo_barras,
            Producto.nombre,
            Categoria.nombre.label("categoria_nombre"),
            Producto.stock_actual,
            func.sum(DetalleVenta.cantidad).label("unidades"),
            func.sum(DetalleVenta.subtotal_linea).label("ingresos"),
            func.sum(
                DetalleVenta.subtotal_linea
                - (DetalleVenta.costo_unitario * DetalleVenta.cantidad)
            ).label("ganancia"),
        )
        .join(DetalleVenta, DetalleVenta.producto_id == Producto.id)
        .join(Venta, Venta.id == DetalleVenta.venta_id)
        .outerjoin(Categoria, Categoria.id == Producto.categoria_id)
        .filter(*filtro_ventas)
        .group_by(
            Producto.id,
            Producto.codigo_barras,
            Producto.nombre,
            Categoria.nombre,
            Producto.stock_actual,
        )
        .order_by(func.sum(DetalleVenta.cantidad).desc())
        .limit(10)
        .all()
    )
    top_productos = [
        TopProductoOut(
            ranking=idx,
            producto_id=row.id,
            codigo_barras=row.codigo_barras,
            nombre=row.nombre,
            categoria_nombre=row.categoria_nombre or "General",
            unidades_vendidas=int(row.unidades or 0),
            ingresos_generados=Decimal(str(row.ingresos or "0.00")),
            ganancia_generada=Decimal(str(row.ganancia or "0.00")),
            stock_actual=int(row.stock_actual or 0),
        )
        for idx, row in enumerate(top_rows, start=1)
    ]

    # 6. Rendimiento por empleado/vendedor
    empleados_rows = (
        db.query(
            Usuario.id,
            Usuario.nombre_completo,
            Usuario.username,
            func.count(Venta.id).label("ventas_realizadas"),
            func.coalesce(func.sum(Venta.total), 0).label("monto_total"),
        )
        .join(Venta, Venta.usuario_id == Usuario.id)
        .filter(*filtro_ventas)
        .group_by(Usuario.id, Usuario.nombre_completo, Usuario.username)
        .order_by(func.sum(Venta.total).desc())
        .all()
    )
    rendimiento_empleados = [
        RendimientoEmpleadoOut(
            usuario_id=row.id,
            nombre_completo=row.nombre_completo,
            username=row.username,
            cantidad_ventas=int(row.ventas_realizadas),
            total_vendido=Decimal(str(row.monto_total)),
            porcentaje_total=(
                (Decimal(str(row.monto_total)) / ingresos_totales * Decimal("100")).quantize(
                    Decimal("0.1")
                )
                if ingresos_totales > 0
                else Decimal("0.0")
            ),
        )
        for row in empleados_rows
    ]

    return ReporteGeneralAdminOut(
        resumen=resumen,
        por_metodo_pago=por_metodo_pago,
        top_productos=top_productos,
        rendimiento_empleados=rendimiento_empleados,
    )


@router.get("/ventas-filtradas", response_model=ReporteVentasFiltradoOut)
def obtener_reporte_ventas_filtradas(
    fecha_inicio: Optional[date] = Query(default=None, description="Fecha inicial"),
    fecha_fin: Optional[date] = Query(default=None, description="Fecha final"),
    usuario_id: Optional[int] = Query(default=None, description="Filtro por empleado"),
    categoria_id: Optional[int] = Query(default=None, description="Filtro por categoría"),
    producto_id: Optional[int] = Query(default=None, description="Filtro por producto"),
    metodo_pago: Optional[str] = Query(default=None, description="Filtro método de pago"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """
    Genera el reporte analítico detallado de ventas con filtros combinados:
    por fecha, empleado/cajero, categoría, producto y método de pago.
    Incluye resumen financiero del filtro, listado transaccional y distribuciones porcentuales.
    """
    filtro_ventas = [Venta.estado == "COMPLETADA"]
    if fecha_inicio and isinstance(fecha_inicio, date):
        dt_inicio = datetime.combine(fecha_inicio, time.min, tzinfo=timezone.utc)
        filtro_ventas.append(Venta.fecha_venta >= dt_inicio)
    if fecha_fin and isinstance(fecha_fin, date):
        dt_fin = datetime.combine(fecha_fin, time.max, tzinfo=timezone.utc)
        filtro_ventas.append(Venta.fecha_venta <= dt_fin)
    if usuario_id and isinstance(usuario_id, int) and usuario_id > 0:
        filtro_ventas.append(Venta.usuario_id == usuario_id)
    if metodo_pago and isinstance(metodo_pago, str) and metodo_pago.strip() and metodo_pago.strip().upper() != "TODOS":
        filtro_ventas.append(Venta.metodo_pago == metodo_pago.strip().upper())

    if producto_id and isinstance(producto_id, int) and producto_id > 0:
        filtro_ventas.append(Venta.detalles.any(DetalleVenta.producto_id == producto_id))

    if categoria_id and isinstance(categoria_id, int) and categoria_id > 0:
        filtro_ventas.append(
            Venta.detalles.any(
                DetalleVenta.producto.has(Producto.categoria_id == categoria_id)
            )
        )

    ventas_db = (
        db.query(Venta)
        .options(
            joinedload(Venta.usuario),
            joinedload(Venta.cliente),
            selectinload(Venta.detalles).joinedload(DetalleVenta.producto).joinedload(Producto.categoria),
        )
        .filter(*filtro_ventas)
        .order_by(Venta.fecha_venta.desc())
        .limit(300)
        .all()
    )

    total_ingresos = Decimal("0.00")
    costo_total = Decimal("0.00")
    ventas_filas: List[VentaFilaReporteOut] = []

    emp_map = {}
    cat_map = {}
    pago_map = {}

    for v in ventas_db:
        v_total = Decimal(str(v.total or "0.00"))
        v_costo = sum(
            (Decimal(str(d.costo_unitario or "0.00")) * d.cantidad for d in v.detalles),
            Decimal("0.00"),
        )
        v_ganancia = v_total - v_costo
        total_ingresos += v_total
        costo_total += v_costo

        items_strs = [
            f"{d.producto.nombre if d.producto else 'Item'} (x{d.cantidad})"
            for d in v.detalles
        ]
        resumen_items = ", ".join(items_strs[:3])
        if len(items_strs) > 3:
            resumen_items += f" y {len(items_strs) - 3} más"

        cajero_nom = v.usuario.nombre_completo if v.usuario else "Empleado"
        cliente_nom = v.cliente.nombre_completo if v.cliente else "Cliente Mostrador"

        ventas_filas.append(
            VentaFilaReporteOut(
                id=v.id,
                numero_comprobante=v.numero_comprobante,
                fecha_venta=v.fecha_venta,
                cajero_nombre=cajero_nom,
                cliente_nombre=cliente_nom,
                metodo_pago=v.metodo_pago,
                total=v_total,
                costo_total=v_costo,
                ganancia=v_ganancia,
                cantidad_articulos=sum(d.cantidad for d in v.detalles),
                items_resumen=resumen_items or "Sin detalle",
            )
        )

        # Agrupación por empleado
        u_id = v.usuario_id
        if u_id not in emp_map:
            emp_map[u_id] = {
                "id": u_id,
                "nombre": cajero_nom,
                "username": v.usuario.username if v.usuario else "",
                "cantidad": 0,
                "total": Decimal("0.00"),
            }
        emp_map[u_id]["cantidad"] += 1
        emp_map[u_id]["total"] += v_total

        # Agrupación por método de pago
        m_pago = v.metodo_pago
        if m_pago not in pago_map:
            pago_map[m_pago] = {"operaciones": 0, "total": Decimal("0.00")}
        pago_map[m_pago]["operaciones"] += 1
        pago_map[m_pago]["total"] += v_total

        # Agrupación por categoría
        for d in v.detalles:
            if d.producto and d.producto.categoria:
                cid = d.producto.categoria.id
                cnom = d.producto.categoria.nombre
            else:
                cid = 0
                cnom = "General / Sin Categoría"

            subt = Decimal(str(d.subtotal_linea or "0.00"))
            if cid not in cat_map:
                cat_map[cid] = {
                    "id": cid,
                    "nombre": cnom,
                    "unidades": 0,
                    "total": Decimal("0.00"),
                }
            cat_map[cid]["unidades"] += d.cantidad
            cat_map[cid]["total"] += subt

    cantidad_ventas = len(ventas_filas)
    ganancia_neta = total_ingresos - costo_total
    ticket_promedio = (
        (total_ingresos / cantidad_ventas).quantize(Decimal("0.01"))
        if cantidad_ventas > 0
        else Decimal("0.00")
    )
    margen_porcentaje = (
        ((ganancia_neta / total_ingresos) * Decimal("100")).quantize(Decimal("0.1"))
        if total_ingresos > 0
        else Decimal("0.0")
    )

    por_empleado = [
        RendimientoEmpleadoOut(
            usuario_id=e["id"],
            nombre_completo=e["nombre"],
            username=e["username"],
            cantidad_ventas=e["cantidad"],
            total_vendido=e["total"],
            porcentaje_total=(
                (e["total"] / total_ingresos * Decimal("100")).quantize(Decimal("0.1"))
                if total_ingresos > 0
                else Decimal("0.0")
            ),
        )
        for e in sorted(emp_map.values(), key=lambda x: x["total"], reverse=True)
    ]

    por_categoria = [
        VentaPorCategoriaOut(
            categoria_id=c["id"],
            categoria_nombre=c["nombre"],
            unidades_vendidas=c["unidades"],
            total_vendido=c["total"],
            porcentaje_total=(
                (c["total"] / total_ingresos * Decimal("100")).quantize(Decimal("0.1"))
                if total_ingresos > 0
                else Decimal("0.0")
            ),
        )
        for c in sorted(cat_map.values(), key=lambda x: x["total"], reverse=True)
    ]

    por_metodo_pago = [
        VentaPorMetodoPagoOut(
            metodo_pago=k,
            cantidad_operaciones=v["operaciones"],
            total_recaudado=v["total"],
        )
        for k, v in pago_map.items()
    ]

    return ReporteVentasFiltradoOut(
        resumen=ResumenVentasFiltroOut(
            cantidad_ventas=cantidad_ventas,
            total_ingresos=total_ingresos,
            costo_total=costo_total,
            ganancia_neta=ganancia_neta,
            margen_porcentaje=margen_porcentaje,
            ticket_promedio=ticket_promedio,
        ),
        ventas=ventas_filas,
        por_empleado=por_empleado,
        por_categoria=por_categoria,
        por_metodo_pago=por_metodo_pago,
    )


@router.get("/inventario-valorizado", response_model=ReporteInventarioOut)
def obtener_reporte_inventario_valorizado(
    categoria_id: Optional[int] = Query(default=None),
    proveedor_id: Optional[int] = Query(default=None),
    estado_stock: Optional[str] = Query(default="TODOS"),
    busqueda: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """
    Genera el reporte de inventario valorizado:
    - Capital invertido al costo vs valor comercial a precio de venta.
    - Ganancia potencial proyectada y margen de rendimiento en almacén.
    - Filtro por categoría, proveedor, estado de stock (Normal, Bajo, Agotado) y búsqueda.
    """
    query = (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.activo.is_(True))
    )

    if categoria_id and isinstance(categoria_id, int) and categoria_id > 0:
        query = query.filter(Producto.categoria_id == categoria_id)
    if proveedor_id and isinstance(proveedor_id, int) and proveedor_id > 0:
        query = query.filter(Producto.proveedor_id == proveedor_id)
    if busqueda and isinstance(busqueda, str) and busqueda.strip():
        term = f"%{busqueda.strip()}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(term),
                Producto.codigo_barras.ilike(term),
                Producto.descripcion.ilike(term),
            )
        )

    todos_prods = query.order_by(Producto.nombre.asc()).limit(500).all()

    items: List[ItemInventarioReporteOut] = []
    total_unidades = 0
    valor_costo_total = Decimal("0.00")
    valor_venta_total = Decimal("0.00")
    criticos_count = 0
    agotados_count = 0

    estado_filtro = (estado_stock if isinstance(estado_stock, str) else "TODOS").upper()

    for p in todos_prods:
        st_actual = int(p.stock_actual or 0)
        st_minimo = int(p.stock_minimo or 0)
        p_costo = Decimal(str(p.precio_compra or "0.00"))
        p_venta = Decimal(str(p.precio_venta or "0.00"))

        if st_actual <= 0:
            est = "AGOTADO"
            agotados_count += 1
        elif st_actual <= st_minimo:
            est = "BAJO"
            criticos_count += 1
        else:
            est = "NORMAL"

        if estado_filtro != "TODOS" and est != estado_filtro:
            continue

        linea_costo = p_costo * Decimal(str(st_actual))
        linea_venta = p_venta * Decimal(str(st_actual))

        total_unidades += st_actual
        valor_costo_total += linea_costo
        valor_venta_total += linea_venta

        items.append(
            ItemInventarioReporteOut(
                id=p.id,
                codigo_barras=p.codigo_barras,
                nombre=p.nombre,
                categoria_id=p.categoria_id,
                categoria_nombre=p.categoria.nombre if p.categoria else "General",
                proveedor_nombre=p.proveedor.nombre_empresa if p.proveedor else "Sin Proveedor",
                stock_actual=st_actual,
                stock_minimo=st_minimo,
                precio_compra=p_costo,
                precio_venta=p_venta,
                valor_costo_linea=linea_costo,
                valor_venta_linea=linea_venta,
                estado_stock=est,
            )
        )

    ganancia_potencial = valor_venta_total - valor_costo_total
    margen_potencial = (
        ((ganancia_potencial / valor_venta_total) * Decimal("100")).quantize(Decimal("0.1"))
        if valor_venta_total > 0
        else Decimal("0.0")
    )

    resumen = ResumenInventarioOut(
        total_productos_distintos=len(items),
        total_unidades_stock=total_unidades,
        valor_total_costo=valor_costo_total,
        valor_total_venta=valor_venta_total,
        ganancia_potencial=ganancia_potencial,
        margen_potencial_porcentaje=margen_potencial,
        productos_stock_critico=criticos_count,
        productos_agotados=agotados_count,
    )

    return ReporteInventarioOut(resumen=resumen, items=items)


@router.get("/productos-mas-vendidos", response_model=List[TopProductoOut])
def obtener_productos_mas_vendidos(
    fecha_inicio: Optional[date] = Query(default=None),
    fecha_fin: Optional[date] = Query(default=None),
    categoria_id: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """
    Devuelve los productos con mayor número de unidades vendidas y mayor recaudación,
    permitiendo filtrar por rango de fechas y categoría.
    """
    filtro = [Venta.estado == "COMPLETADA", Producto.activo.is_(True)]
    if fecha_inicio and isinstance(fecha_inicio, date):
        dt_inicio = datetime.combine(fecha_inicio, time.min, tzinfo=timezone.utc)
        filtro.append(Venta.fecha_venta >= dt_inicio)
    if fecha_fin and isinstance(fecha_fin, date):
        dt_fin = datetime.combine(fecha_fin, time.max, tzinfo=timezone.utc)
        filtro.append(Venta.fecha_venta <= dt_fin)
    if categoria_id and isinstance(categoria_id, int) and categoria_id > 0:
        filtro.append(Producto.categoria_id == categoria_id)

    limit_val = limit if isinstance(limit, int) else 20
    top_rows = (
        db.query(
            Producto.id,
            Producto.codigo_barras,
            Producto.nombre,
            Categoria.nombre.label("categoria_nombre"),
            Producto.stock_actual,
            func.sum(DetalleVenta.cantidad).label("unidades"),
            func.sum(DetalleVenta.subtotal_linea).label("ingresos"),
            func.sum(
                DetalleVenta.subtotal_linea
                - (DetalleVenta.costo_unitario * DetalleVenta.cantidad)
            ).label("ganancia"),
        )
        .join(DetalleVenta, DetalleVenta.producto_id == Producto.id)
        .join(Venta, Venta.id == DetalleVenta.venta_id)
        .outerjoin(Categoria, Categoria.id == Producto.categoria_id)
        .filter(*filtro)
        .group_by(
            Producto.id,
            Producto.codigo_barras,
            Producto.nombre,
            Categoria.nombre,
            Producto.stock_actual,
        )
        .order_by(func.sum(DetalleVenta.cantidad).desc())
        .limit(limit_val)
        .all()
    )

    resultado = []
    for idx, row in enumerate(top_rows, start=1):
        resultado.append(
            TopProductoOut(
                ranking=idx,
                producto_id=row.id,
                codigo_barras=row.codigo_barras,
                nombre=row.nombre,
                categoria_nombre=row.categoria_nombre or "General",
                unidades_vendidas=int(row.unidades or 0),
                ingresos_generados=Decimal(str(row.ingresos or "0.00")),
                ganancia_generada=Decimal(str(row.ganancia or "0.00")),
                stock_actual=int(row.stock_actual or 0),
            )
        )
    return resultado


@router.get("/stock-critico", response_model=List[ProductoOut])
def obtener_productos_stock_critico(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """Devuelve todos los productos cuyo stock actual es menor o igual al stock mínimo."""
    return (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(
            Producto.activo.is_(True),
            Producto.stock_actual <= Producto.stock_minimo,
        )
        .order_by(Producto.stock_actual.asc())
        .all()
    )
