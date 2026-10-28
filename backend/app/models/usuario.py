from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.db.database import Base


class Rol(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(30), unique=True, nullable=False, index=True)  # 'ADMIN', 'EMPLEADO'
    descripcion = Column(String(150), nullable=True)

    usuarios = relationship("Usuario", back_populates="rol")


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    rol_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    nombre_completo = Column(String(120), nullable=False)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    fecha_creacion = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    rol = relationship("Rol", back_populates="usuarios")
    sesiones_caja = relationship("SesionCaja", back_populates="usuario")
    ventas = relationship("Venta", back_populates="usuario")
    compras = relationship("Compra", back_populates="usuario")
    movimientos_inventario = relationship("MovimientoInventario", back_populates="usuario")
