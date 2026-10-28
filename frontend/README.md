# Frontend (Angular) - Sistema para Tienda

Aplicación web construida en **Angular** con arquitectura modular organizada por carpetas para cada apartado del sistema.

## Estructura de Carpetas (`src/app/`)

```text
frontend/
├── public/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── login/                   # Autenticación (Login Profesional)
│   │   │   ├── admin-dashboard/         # Panel principal del Administrador
│   │   │   ├── admin-reportes/          # Reportes financieros y analítica
│   │   │   ├── admin-productos/         # Gestión de catálogo y precios
│   │   │   ├── admin-categorias/        # Gestión de categorías
│   │   │   ├── admin-proveedores/       # Gestión de proveedores
│   │   │   ├── admin-inventario/        # Compras, ajustes de stock y Kardex
│   │   │   ├── admin-ventas/            # Historial y anulación de ventas
│   │   │   ├── admin-usuarios/          # Gestión de Empleados y Administradores
│   │   │   ├── empleado-dashboard/      # Panel principal del Empleado
│   │   │   ├── empleado-pos/            # Punto de Venta (POS) y Carrito
│   │   │   ├── empleado-caja/           # Apertura y Cierre de Caja (Arqueo)
│   │   │   ├── empleado-clientes/       # Gestión de Clientes en Mostrador
│   │   │   └── empleado-catalogo/       # Consulta rápida de stock y precios
│   │   ├── services/
│   │   │   ├── auth.ts                  # Servicio de Autenticación JWT
│   │   │   └── api.service.ts           # Servicio central de llamadas a FastAPI
│   │   ├── app.config.ts
│   │   ├── app.routes.ts
│   │   └── app.ts
│   ├── index.html
│   ├── main.ts
│   └── styles.css
├── angular.json
├── package.json
└── tsconfig.json
```

## Ejecución del Servidor de Desarrollo

```powershell
cd "D:\SISTEMA PARA TIENDA\frontend"
npm start
```

Luego abre en el navegador: `http://localhost:4200/`
