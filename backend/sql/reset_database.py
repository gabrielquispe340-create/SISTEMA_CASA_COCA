import os
import sys
import shutil
from pathlib import Path

# Agregar backend al path
sys.path.insert(0, r"D:\SISTEMA PARA TIENDA\backend")

from app.db.database import engine, SessionLocal
from app.db.seed import seed_initial_data
from sqlalchemy import text

def clean_database():
    print("Iniciando limpieza profunda de la base de datos...")
    
    with engine.connect() as conn:
        # En PostgreSQL / Supabase podemos truncar con CASCADE y RESTART IDENTITY
        truncate_sql = """
        TRUNCATE TABLE 
            detalle_ventas,
            ventas,
            movimientos_caja,
            sesiones_caja,
            detalle_compras,
            compras,
            movimientos_inventario,
            bitacora_actividades,
            productos,
            proveedores,
            categorias
        RESTART IDENTITY CASCADE;
        """
        print("Truncando tablas transaccionales y de catálogo...")
        conn.execute(text(truncate_sql))
        conn.commit()

        # Limpiar clientes secundarios dejando únicamente 'Consumidor Final'
        print("Limpiando clientes de prueba...")
        conn.execute(text("DELETE FROM clientes WHERE documento_identidad != '0';"))
        conn.commit()

        # Limpiar usuarios adicionales si existieran, manteniendo admin y empleado
        print("Limpiando usuarios adicionales...")
        conn.execute(text("DELETE FROM usuarios WHERE username NOT IN ('admin', 'empleado');"))
        conn.commit()

    # Ejecutar seed idempotente para garantizar que Roles, Usuarios y Consumidor Final estén perfectos
    db = SessionLocal()
    try:
        seed_initial_data(db)
        print("Estructura base verificada con éxito.")
    finally:
        db.close()

    # Limpiar archivos de imágenes subidas en backend/uploads/productos
    uploads_dir = Path(r"D:\SISTEMA PARA TIENDA\backend\uploads\productos")
    if uploads_dir.exists():
        for file in uploads_dir.iterdir():
            if file.is_file():
                try:
                    file.unlink()
                    print(f"Eliminada imagen residual: {file.name}")
                except Exception as e:
                    print(f"Error al eliminar {file.name}: {e}")

    # Verificar conteo final de cada tabla
    print("\n--- ESTADO FINAL DE LAS TABLAS ---")
    tables = [
        "roles",
        "usuarios",
        "clientes",
        "categorias",
        "proveedores",
        "productos",
        "sesiones_caja",
        "movimientos_caja",
        "compras",
        "detalle_compras",
        "ventas",
        "detalle_ventas",
        "movimientos_inventario",
        "bitacora_actividades",
    ]
    with engine.connect() as conn:
        for t in tables:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
            print(f"  * {t}: {count} registro(s)")

if __name__ == "__main__":
    clean_database()
