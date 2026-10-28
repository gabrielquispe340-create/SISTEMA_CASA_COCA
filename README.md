# Sistema de Gestión y Punto de Venta (POS) para Tienda

Sistema comercial para administración de tienda y punto de venta (POS) con control de acceso basado en roles (**Administrador** y **Empleado**).

## Estructura del Proyecto

El proyecto mantiene una arquitectura limpia dividida únicamente en dos capas principales:

```text
SISTEMA PARA TIENDA/
├── backend/                # API REST en Python (FastAPI + SQLAlchemy + PostgreSQL/Supabase)
│   ├── app/
│   │   ├── api/            # Rutas de la API separadas por módulo y rol
│   │   ├── core/           # Configuración (.env), seguridad JWT y permisos por rol
│   │   ├── db/             # Conexión a Base de Datos y datos semilla (seed.py)
│   │   ├── models/         # Modelos de Base de Datos (SQLAlchemy ORM)
│   │   └── schemas/        # Esquemas de validación (Pydantic)
│   ├── sql/                # Script SQL nativo listo para PostgreSQL / Supabase
│   ├── .env.example        # Plantilla de variables de entorno
│   ├── requirements.txt    # Dependencias de Python
│   └── main.py             # Punto de entrada de la API
├── frontend/               # Interfaz de usuario (Panel Administrador y POS Empleado)
├── .gitignore
├── README.md
└── ROADMAP.md
```

## Roles del Sistema

1. **Empleado (`EMPLEADO`)**:
   - Apertura y cierre de turno de caja (arqueo).
   - Punto de Venta (POS): búsqueda por código de barras o nombre, carrito, cobro y emisión de comprobante.
   - Registro y búsqueda de clientes en mostrador.
   - Consulta de stock y precios en tiempo real.
2. **Administrador (`ADMIN`)**:
   - Dashboard financiero y reportes (ventas por fecha, ganancias netas reales, productos más vendidos, rendimiento por empleado, alertas de stock mínimo).
   - Gestión completa de inventario, categorías, productos, proveedores y compras.
   - Kardex de movimientos de inventario y auditoría de cajas.
   - Administración de usuarios y empleados.
