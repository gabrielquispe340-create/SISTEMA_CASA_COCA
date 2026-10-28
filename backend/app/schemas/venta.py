from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# CLIENTES
# =============================================================================
class ClienteBase(BaseModel):
    documento_identidad: str
    nombre_completo: str
    telefono: Optional[str] = None
    email: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteOut(ClienteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha_registro: datetime


# =============================================================================
# SESIONES DE CAJA (EMPLEADO)
# =============================================================================
class SesionCajaAbrir(BaseModel):
    monto_inicial: Decimal = Field(default=Decimal("0.00"), ge=0)
    observaciones: Optional[str] = None


class SesionCajaCerrar(BaseModel):
    monto_final_real: Decimal = Field(..., ge=0)
    observaciones: Optional[str] = None


class SesionCajaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_id: int
    usuario_nombre: Optional[str] = None
    fecha_apertura: datetime
    fecha_cierre: Optional[datetime] = None
    monto_inicial: Decimal
    total_ventas_efectivo: Decimal
    total_ventas_otros: Decimal
    total_ingresos: Decimal = Decimal("0.00")
    total_egresos: Decimal = Decimal("0.00")
    monto_final_esperado: Decimal
    monto_final_real: Optional[Decimal] = None
    diferencia: Optional[Decimal] = None
    estado: str
    observaciones: Optional[str] = None


# =============================================================================
# MOVIMIENTOS DE CAJA (INGRESOS Y EGRESOS DE EFECTIVO)
# =============================================================================
class MovimientoCajaCreate(BaseModel):
    tipo: str = Field(..., description="INGRESO o EGRESO")
    monto: Decimal = Field(..., gt=0, description="Monto del movimiento en Bs.")
    motivo: str = Field(..., min_length=3, max_length=250, description="Motivo o concepto")
    numero_comprobante: Optional[str] = Field(None, max_length=50)
    sesion_caja_id: Optional[int] = None


class MovimientoCajaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sesion_caja_id: int
    usuario_id: int
    usuario_nombre: Optional[str] = None
    tipo: str
    monto: Decimal
    motivo: str
    numero_comprobante: Optional[str] = None
    fecha: datetime


# =============================================================================
# VENTAS (PUNTO DE VENTA - POS)
# =============================================================================
class ItemVentaCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)
    descuento_linea: Decimal = Field(default=Decimal("0.00"), ge=0)


class VentaCreate(BaseModel):
    cliente_id: Optional[int] = None
    metodo_pago: str = Field(default="EFECTIVO")  # EFECTIVO, TARJETA, QR, MIXTO
    descuento_global: Decimal = Field(default=Decimal("0.00"), ge=0)
    impuestos: Decimal = Field(default=Decimal("0.00"), ge=0)
    items: List[ItemVentaCreate]


class DetalleVentaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    producto_id: int
    cantidad: int
    precio_unitario: Decimal
    descuento_linea: Decimal
    subtotal_linea: Decimal
    producto_nombre: Optional[str] = None
    producto_codigo: Optional[str] = None


class VentaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    numero_comprobante: str
    sesion_caja_id: Optional[int] = None
    usuario_id: int
    usuario_nombre: Optional[str] = None
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None
    cliente_documento: Optional[str] = None
    fecha_venta: datetime
    subtotal: Decimal
    descuento: Decimal
    impuestos: Decimal
    total: Decimal
    metodo_pago: str
    estado: str
    detalles: List[DetalleVentaOut] = []
