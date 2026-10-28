from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel


class ResumenFinancieroOut(BaseModel):
    cantidad_ventas: int
    ingresos_totales: Decimal
    costo_mercaderia_vendida: Decimal
    ganancia_neta_estimada: Decimal
    ticket_promedio: Decimal
    productos_con_stock_bajo: int


class VentaPorMetodoPagoOut(BaseModel):
    metodo_pago: str
    cantidad_operaciones: int
    total_recaudado: Decimal


class TopProductoOut(BaseModel):
    ranking: Optional[int] = None
    producto_id: int
    codigo_barras: str
    nombre: str
    categoria_nombre: Optional[str] = None
    unidades_vendidas: int
    ingresos_generados: Decimal
    ganancia_generada: Decimal
    stock_actual: Optional[int] = None


class RendimientoEmpleadoOut(BaseModel):
    usuario_id: int
    nombre_completo: str
    username: str
    cantidad_ventas: int
    total_vendido: Decimal
    porcentaje_total: Optional[Decimal] = Decimal("0.00")


class VentaPorCategoriaOut(BaseModel):
    categoria_id: int
    categoria_nombre: str
    unidades_vendidas: int
    total_vendido: Decimal
    porcentaje_total: Decimal


class VentaFilaReporteOut(BaseModel):
    id: int
    numero_comprobante: str
    fecha_venta: datetime
    cajero_nombre: str
    cliente_nombre: str
    metodo_pago: str
    total: Decimal
    costo_total: Decimal
    ganancia: Decimal
    cantidad_articulos: int
    items_resumen: str


class ResumenVentasFiltroOut(BaseModel):
    cantidad_ventas: int
    total_ingresos: Decimal
    costo_total: Decimal
    ganancia_neta: Decimal
    margen_porcentaje: Decimal
    ticket_promedio: Decimal


class ReporteVentasFiltradoOut(BaseModel):
    resumen: ResumenVentasFiltroOut
    ventas: List[VentaFilaReporteOut]
    por_empleado: List[RendimientoEmpleadoOut]
    por_categoria: List[VentaPorCategoriaOut]
    por_metodo_pago: List[VentaPorMetodoPagoOut]


class ResumenInventarioOut(BaseModel):
    total_productos_distintos: int
    total_unidades_stock: int
    valor_total_costo: Decimal
    valor_total_venta: Decimal
    ganancia_potencial: Decimal
    margen_potencial_porcentaje: Decimal
    productos_stock_critico: int
    productos_agotados: int


class ItemInventarioReporteOut(BaseModel):
    id: int
    codigo_barras: str
    nombre: str
    categoria_id: int
    categoria_nombre: str
    proveedor_nombre: Optional[str] = None
    stock_actual: int
    stock_minimo: int
    precio_compra: Decimal
    precio_venta: Decimal
    valor_costo_linea: Decimal
    valor_venta_linea: Decimal
    estado_stock: str  # 'NORMAL', 'BAJO', 'AGOTADO'


class ReporteInventarioOut(BaseModel):
    resumen: ResumenInventarioOut
    items: List[ItemInventarioReporteOut]


class ReporteGeneralAdminOut(BaseModel):
    resumen: ResumenFinancieroOut
    por_metodo_pago: List[VentaPorMetodoPagoOut]
    top_productos: List[TopProductoOut]
    rendimiento_empleados: List[RendimientoEmpleadoOut]
