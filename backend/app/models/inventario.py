from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship
from app.db.database import Base


class Compra(Base):
    __tablename__ = "compras"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    numero_factura_proveedor = Column(String(60), nullable=True)
    fecha_compra = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    total_compra = Column(Numeric(12, 2), default=0.00, nullable=False)
    estado = Column(String(20), default="RECIBIDA", nullable=False)  # 'RECIBIDA', 'ANULADA'

    proveedor = relationship("Proveedor", back_populates="compras")
    usuario = relationship("Usuario", back_populates="compras")
    detalles = relationship("DetalleCompra", back_populates="compra", cascade="all, delete-orphan")


class DetalleCompra(Base):
    __tablename__ = "detalle_compras"

    id = Column(Integer, primary_key=True, index=True)
    compra_id = Column(Integer, ForeignKey("compras.id", ondelete="CASCADE"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    costo_unitario_compra = Column(Numeric(12, 2), nullable=False)
    subtotal_linea = Column(Numeric(12, 2), nullable=False)
    tipo_empaque = Column(String(20), default="UNIDAD", nullable=False)
    unidades_empaque = Column(Integer, default=1, nullable=False)
    cantidad_empaque = Column(Integer, default=1, nullable=False)

    compra = relationship("Compra", back_populates="detalles")
    producto = relationship("Producto", back_populates="detalles_compra")

    @property
    def producto_nombre(self):
        if not self.producto:
            return None
        if getattr(self, "tipo_empaque", "UNIDAD") == "PAQUETE":
            pkg = getattr(self.producto, "nombre_paquete", "Paquete") or "Paquete"
            uds = getattr(self, "unidades_empaque", 1) or 1
            return f"{self.producto.nombre} ({pkg} x{uds})"
        return self.producto.nombre

    @property
    def producto_codigo(self):
        return self.producto.codigo_barras if self.producto else None


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo_movimiento = Column(
        String(30), nullable=False
    )  # 'VENTA', 'COMPRA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'ANULACION'
    cantidad = Column(Integer, nullable=False)
    stock_anterior = Column(Integer, nullable=False)
    stock_resultante = Column(Integer, nullable=False)
    referencia = Column(String(150), nullable=True)
    fecha_movimiento = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    producto = relationship("Producto", back_populates="movimientos")
    usuario = relationship("Usuario", back_populates="movimientos_inventario")
