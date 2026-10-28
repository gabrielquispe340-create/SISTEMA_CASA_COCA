from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship
from app.db.database import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(80), unique=True, nullable=False, index=True)
    descripcion = Column(String(250), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)

    productos = relationship("Producto", back_populates="categoria")


class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre_empresa = Column(String(120), nullable=False, index=True)
    contacto_nombre = Column(String(100), nullable=True)
    telefono = Column(String(30), nullable=True)
    email = Column(String(120), nullable=True)
    direccion = Column(String(250), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)

    productos = relationship("Producto", back_populates="proveedor")
    compras = relationship("Compra", back_populates="proveedor")


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True)
    codigo_barras = Column(String(60), unique=True, nullable=False, index=True)
    nombre = Column(String(150), nullable=False, index=True)
    descripcion = Column(String(300), nullable=True)
    imagen_url = Column(String(500), nullable=True)
    precio_compra = Column(Numeric(12, 2), default=0.00, nullable=False)
    precio_venta = Column(Numeric(12, 2), default=0.00, nullable=False)
    stock_actual = Column(Integer, default=0, nullable=False)
    stock_minimo = Column(Integer, default=5, nullable=False)
    fecha_vencimiento = Column(Date, nullable=True)
    lote = Column(String(60), nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    fecha_actualizacion = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    categoria = relationship("Categoria", back_populates="productos")
    proveedor = relationship("Proveedor", back_populates="productos")
    detalles_venta = relationship("DetalleVenta", back_populates="producto")
    detalles_compra = relationship("DetalleCompra", back_populates="producto")
    movimientos = relationship("MovimientoInventario", back_populates="producto")
