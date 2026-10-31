from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.usuario import Rol, Usuario
from app.models.venta import Cliente


def seed_initial_data(db: Session) -> None:
    """
    Inicializa exclusivamente la estructura base del sistema:
    - Roles esenciales: ADMIN y EMPLEADO
    - Cuentas de acceso base: admin (admin123) y empleado (empleado123)
    - Cliente general para mostrador: Consumidor Final (documento 0)
    - Migraciones ligeras de columnas
    """
    try:
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS lote VARCHAR(60)")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS tiene_paquete BOOLEAN DEFAULT FALSE")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS nombre_paquete VARCHAR(60) DEFAULT 'Paquete'")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidades_por_paquete INTEGER DEFAULT 1")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_paquete_venta NUMERIC(12, 2) DEFAULT NULL")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_paquete_compra NUMERIC(12, 2) DEFAULT NULL")
        )
        db.execute(
            text("ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barra_paquete VARCHAR(60) DEFAULT NULL")
        )
        db.execute(
            text("ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS tipo_empaque VARCHAR(20) DEFAULT 'UNIDAD'")
        )
        db.execute(
            text("ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS unidades_empaque INTEGER DEFAULT 1")
        )
        db.execute(
            text("ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS cantidad_empaque INTEGER DEFAULT 1")
        )
        db.execute(
            text("ALTER TABLE detalle_compras ADD COLUMN IF NOT EXISTS tipo_empaque VARCHAR(20) DEFAULT 'UNIDAD'")
        )
        db.execute(
            text("ALTER TABLE detalle_compras ADD COLUMN IF NOT EXISTS unidades_empaque INTEGER DEFAULT 1")
        )
        db.execute(
            text("ALTER TABLE detalle_compras ADD COLUMN IF NOT EXISTS cantidad_empaque INTEGER DEFAULT 1")
        )
        db.commit()
    except Exception:
        db.rollback()

    # 1. Asegurar Roles
    rol_admin = db.query(Rol).filter(Rol.nombre == "ADMIN").first()
    if not rol_admin:
        rol_admin = Rol(
            nombre="ADMIN",
            descripcion="Administrador general con acceso a reportes, inventario, compras y usuarios",
        )
        db.add(rol_admin)

    rol_empleado = db.query(Rol).filter(Rol.nombre == "EMPLEADO").first()
    if not rol_empleado:
        rol_empleado = Rol(
            nombre="EMPLEADO",
            descripcion="Cajero / Vendedor con acceso al Punto de Venta (POS), clientes y caja",
        )
        db.add(rol_empleado)

    db.commit()
    db.refresh(rol_admin)
    db.refresh(rol_empleado)

    # 2. Asegurar Usuarios Base para Pruebas y Acceso
    if not db.query(Usuario).filter(Usuario.username == "admin").first():
        db.add(
            Usuario(
                rol_id=rol_admin.id,
                nombre_completo="Administrador Principal",
                username="admin",
                email="admin@tienda.com",
                password_hash=get_password_hash("admin123"),
                activo=True,
            )
        )

    if not db.query(Usuario).filter(Usuario.username == "empleado").first():
        db.add(
            Usuario(
                rol_id=rol_empleado.id,
                nombre_completo="Empleado Cajero 1",
                username="empleado",
                email="empleado@tienda.com",
                password_hash=get_password_hash("empleado123"),
                activo=True,
            )
        )

    # 3. Asegurar Cliente Genérico para Ventas de Mostrador
    if not db.query(Cliente).filter(Cliente.documento_identidad == "0").first():
        db.add(
            Cliente(
                documento_identidad="0",
                nombre_completo="Consumidor Final",
                telefono="-",
            )
        )

    db.commit()
