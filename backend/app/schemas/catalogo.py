from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class CategoriaBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True


class CategoriaCreate(CategoriaBase):
    pass


class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class CategoriaOut(CategoriaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cantidad_productos: int = 0


class ProveedorBase(BaseModel):
    nombre_empresa: str
    contacto_nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    activo: bool = True


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    nombre_empresa: Optional[str] = None
    contacto_nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    activo: Optional[bool] = None


class ProveedorOut(ProveedorBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cantidad_productos: int = 0
    cantidad_compras: int = 0


class ProductoBase(BaseModel):
    categoria_id: int
    proveedor_id: Optional[int] = None
    codigo_barras: str
    nombre: str
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    precio_compra: Decimal = Field(default=Decimal("0.00"), ge=0)
    precio_venta: Decimal = Field(..., ge=0)
    stock_actual: int = Field(default=0, ge=0)
    stock_minimo: int = Field(default=5, ge=0)
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None
    activo: bool = True


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    categoria_id: Optional[int] = None
    proveedor_id: Optional[int] = None
    codigo_barras: Optional[str] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    imagen_url: Optional[str] = None
    precio_compra: Optional[Decimal] = Field(default=None, ge=0)
    precio_venta: Optional[Decimal] = Field(default=None, ge=0)
    stock_actual: Optional[int] = Field(default=None, ge=0)
    stock_minimo: Optional[int] = Field(default=None, ge=0)
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None
    activo: Optional[bool] = None


class ProductoPrecioUpdate(BaseModel):
    precio_compra: Decimal = Field(..., ge=0)
    precio_venta: Decimal = Field(..., ge=0)


class ProductoOut(ProductoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha_actualizacion: datetime
    categoria: Optional[CategoriaOut] = None
    proveedor: Optional[ProveedorOut] = None
