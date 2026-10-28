from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship
from app.db.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    documento_identidad = Column(String(40), unique=True, nullable=False, index=True)
    nombre_completo = Column(String(150), nullable=False)
    telefono = Column(String(30), nullable=True)
    email = Column(String(120), nullable=True)
    fecha_registro = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    ventas = relationship("Venta", back_populates="cliente")


class SesionCaja(Base):
    __tablename__ = "sesiones_caja"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha_apertura = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    fecha_cierre = Column(DateTime(timezone=True), nullable=True)
    monto_inicial = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_ventas_efectivo = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_ventas_otros = Column(Numeric(12, 2), default=0.00, nullable=False)
    monto_final_esperado = Column(Numeric(12, 2), default=0.00, nullable=False)
    monto_final_real = Column(Numeric(12, 2), nullable=True)
    diferencia = Column(Numeric(12, 2), nullable=True)
    estado = Column(String(20), default="ABIERTA", nullable=False)  # 'ABIERTA', 'CERRADA'
    observaciones = Column(String(300), nullable=True)

    usuario = relationship("Usuario", back_populates="sesiones_caja")
    ventas = relationship("Venta", back_populates="sesion_caja")
    movimientos = relationship(
        "MovimientoCaja",
        back_populates="sesion_caja",
        cascade="all, delete-orphan",
        order_by="MovimientoCaja.fecha.desc()",
    )

    @property
    def total_ingresos(self):
        from decimal import Decimal
        return sum(
            (Decimal(str(m.monto)) for m in self.movimientos if m.tipo == "INGRESO"),
            Decimal("0.00"),
        )

    @property
    def total_egresos(self):
        from decimal import Decimal
        return sum(
            (Decimal(str(m.monto)) for m in self.movimientos if m.tipo == "EGRESO"),
            Decimal("0.00"),
        )

    @property
    def usuario_nombre(self):
        return self.usuario.nombre_completo if self.usuario else None


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)
    numero_comprobante = Column(String(40), unique=True, nullable=False, index=True)
    sesion_caja_id = Column(Integer, ForeignKey("sesiones_caja.id"), nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    fecha_venta = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    subtotal = Column(Numeric(12, 2), default=0.00, nullable=False)
    descuento = Column(Numeric(12, 2), default=0.00, nullable=False)
    impuestos = Column(Numeric(12, 2), default=0.00, nullable=False)
    total = Column(Numeric(12, 2), default=0.00, nullable=False)
    metodo_pago = Column(String(30), default="EFECTIVO", nullable=False)  # 'EFECTIVO', 'TARJETA', 'QR', 'MIXTO'
    estado = Column(String(20), default="COMPLETADA", nullable=False)  # 'COMPLETADA', 'ANULADA'

    sesion_caja = relationship("SesionCaja", back_populates="ventas")
    usuario = relationship("Usuario", back_populates="ventas")
    cliente = relationship("Cliente", back_populates="ventas")
    detalles = relationship("DetalleVenta", back_populates="venta", cascade="all, delete-orphan")

    @property
    def usuario_nombre(self):
        return self.usuario.nombre_completo if self.usuario else None

    @property
    def cliente_nombre(self):
        return self.cliente.nombre_completo if self.cliente else "Cliente Mostrador"

    @property
    def cliente_documento(self):
        return self.cliente.documento_identidad if self.cliente else "S/N"


class DetalleVenta(Base):
    __tablename__ = "detalle_ventas"

    id = Column(Integer, primary_key=True, index=True)
    venta_id = Column(Integer, ForeignKey("ventas.id", ondelete="CASCADE"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    precio_unitario = Column(Numeric(12, 2), nullable=False)
    costo_unitario = Column(Numeric(12, 2), default=0.00, nullable=False)
    descuento_linea = Column(Numeric(12, 2), default=0.00, nullable=False)
    subtotal_linea = Column(Numeric(12, 2), nullable=False)

    venta = relationship("Venta", back_populates="detalles")
    producto = relationship("Producto", back_populates="detalles_venta")

    @property
    def producto_nombre(self):
        return self.producto.nombre if self.producto else None

    @property
    def producto_codigo(self):
        return self.producto.codigo_barras if self.producto else None


class MovimientoCaja(Base):
    __tablename__ = "movimientos_caja"

    id = Column(Integer, primary_key=True, index=True)
    sesion_caja_id = Column(
        Integer,
        ForeignKey("sesiones_caja.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo = Column(String(20), nullable=False)  # 'INGRESO', 'EGRESO'
    monto = Column(Numeric(12, 2), nullable=False)
    motivo = Column(String(250), nullable=False)
    numero_comprobante = Column(String(50), nullable=True)
    fecha = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    sesion_caja = relationship("SesionCaja", back_populates="movimientos")
    usuario = relationship("Usuario")

    @property
    def usuario_nombre(self):
        return self.usuario.nombre_completo if self.usuario else None
