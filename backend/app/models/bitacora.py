from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from app.db.database import Base


class BitacoraActividad(Base):
    __tablename__ = "bitacora_actividades"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    modulo = Column(String(50), nullable=False, index=True)  # AUTENTICACION, USUARIOS, VENTAS, CAJA, INVENTARIO, CATALOGO
    accion = Column(String(60), nullable=False, index=True)  # INICIO_SESION, CREAR_USUARIO, REGISTRAR_VENTA, etc.
    descripcion = Column(String(400), nullable=False)
    ip_origen = Column(String(60), nullable=True, default="127.0.0.1")
    nivel = Column(String(20), nullable=False, default="INFO")  # INFO, SUCCESS, WARNING, CRITICAL
    fecha_registro = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    usuario = relationship("Usuario")
