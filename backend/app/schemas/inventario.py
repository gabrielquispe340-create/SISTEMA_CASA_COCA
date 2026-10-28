from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ItemCompraCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)
    costo_unitario_compra: Decimal = Field(..., ge=0)
    nuevo_precio_venta: Optional[Decimal] = Field(default=None, ge=0)
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None
    cantidad_paquetes: Optional[int] = None
    unidades_por_paquete: Optional[int] = None


class CompraCreate(BaseModel):
    proveedor_id: Optional[int] = None
    numero_factura_proveedor: Optional[str] = None
    observaciones: Optional[str] = None
    items: List[ItemCompraCreate]


class DetalleCompraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    compra_id: int
    producto_id: int
    producto_nombre: Optional[str] = None
    producto_codigo: Optional[str] = None
    cantidad: int
    costo_unitario_compra: Decimal
    subtotal_linea: Decimal


class CompraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    usuario_id: int
    usuario_nombre: Optional[str] = None
    numero_factura_proveedor: Optional[str] = None
    fecha_compra: datetime
    total_compra: Decimal
    total_unidades: Optional[int] = 0
    total_items: Optional[int] = 0
    estado: str
    detalles: List[DetalleCompraOut] = []


class AjusteInventarioCreate(BaseModel):
    producto_id: int
    tipo_movimiento: str = Field(..., description="AJUSTE_ENTRADA o AJUSTE_SALIDA")
    cantidad: int = Field(..., gt=0)
    referencia: str = Field(..., description="Motivo del ajuste de inventario")


class MovimientoInventarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    producto_id: int
    usuario_id: int
    tipo_movimiento: str
    cantidad: int
    stock_anterior: int
    stock_resultante: int
    referencia: Optional[str] = None
    fecha_movimiento: datetime
    producto_nombre: Optional[str] = None
    producto_codigo: Optional[str] = None
    usuario_nombre: Optional[str] = None


class ItemStockDisponibleOut(BaseModel):
    id: int
    codigo_barras: str
    nombre: str
    descripcion: Optional[str] = None
    categoria_id: int
    categoria_nombre: str
    proveedor_nombre: Optional[str] = None
    stock_actual: int
    stock_minimo: int
    estado_stock: str  # OPTIMO | BAJO | AGOTADO
    porcentaje_nivel: int
    precio_compra: Decimal
    precio_venta: Decimal
    valor_stock_venta: Decimal
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None
    activo: bool
    fecha_actualizacion: datetime


class ResumenStockDisponibleOut(BaseModel):
    total_productos: int
    total_unidades_disponibles: int
    productos_optimos: int
    productos_stock_bajo: int
    productos_agotados: int
    valor_total_costo: Decimal
    valor_total_venta: Decimal
    items: List[ItemStockDisponibleOut]


# =============================================================================
# CU11: ALERTAS DE STOCK MÍNIMO Y PRODUCTOS PRÓXIMOS A VENCER (ADM)
# =============================================================================
class AlertaStockItemOut(BaseModel):
    producto_id: int
    codigo_barras: str
    nombre: str
    categoria_nombre: str
    proveedor_nombre: Optional[str] = None
    stock_actual: int
    stock_minimo: int
    deficit_unidades: int
    cantidad_compra_sugerida: int
    nivel_alerta: str  # AGOTADO | CRITICO
    mensaje_alerta: str
    precio_compra: Decimal
    costo_reposicion_estimado: Decimal


class AlertaVencimientoItemOut(BaseModel):
    producto_id: int
    codigo_barras: str
    nombre: str
    categoria_nombre: str
    lote: Optional[str] = None
    stock_actual: int
    fecha_vencimiento: date
    dias_restantes: int
    estado_vencimiento: str  # VENCIDO | URGENTE | PREVENTIVO | VIGENTE
    accion_sugerida: str
    valor_riesgo_venta: Decimal


class ResumenAlertasInventarioOut(BaseModel):
    fecha_generacion: datetime
    dias_umbral_vencimiento: int
    total_alertas_activas: int
    total_agotados: int
    total_stock_critico: int
    total_vencidos: int
    total_proximos_vencer: int
    costo_total_reposicion: Decimal
    valor_total_riesgo_vencimiento: Decimal
    alertas_stock: List[AlertaStockItemOut]
    alertas_vencimiento: List[AlertaVencimientoItemOut]


class ActualizarVencimientoProducto(BaseModel):
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None
    stock_minimo: Optional[int] = Field(default=None, ge=0)
