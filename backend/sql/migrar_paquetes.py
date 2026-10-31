import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.db.database import engine
from sqlalchemy import text

def migrar():
    queries = [
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS tiene_paquete BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS nombre_paquete VARCHAR(60) DEFAULT 'Paquete';",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidades_por_paquete INTEGER DEFAULT 1;",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_paquete_venta NUMERIC(12, 2) DEFAULT NULL;",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_paquete_compra NUMERIC(12, 2) DEFAULT NULL;",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barra_paquete VARCHAR(60) DEFAULT NULL;",
        "ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS tipo_empaque VARCHAR(20) DEFAULT 'UNIDAD';",
        "ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS unidades_empaque INTEGER DEFAULT 1;",
        "ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS cantidad_empaque INTEGER DEFAULT 1;",
        "ALTER TABLE detalle_compras ADD COLUMN IF NOT EXISTS tipo_empaque VARCHAR(20) DEFAULT 'UNIDAD';",
        "ALTER TABLE detalle_compras ADD COLUMN IF NOT EXISTS unidades_empaque INTEGER DEFAULT 1;",
        "ALTER TABLE detalle_compras ADD COLUMN IF NOT EXISTS cantidad_empaque INTEGER DEFAULT 1;",
    ]
    with engine.connect() as conn:
        for q in queries:
            conn.execute(text(q))
        conn.commit()
    print("MIGRATION_PAQUETES_OK")

if __name__ == "__main__":
    migrar()
