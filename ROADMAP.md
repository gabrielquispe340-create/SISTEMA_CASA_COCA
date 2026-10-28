# Hoja de Ruta (Roadmap) - Sistema para Tienda

## Fase 1: Base de Datos y Arquitectura Inicial ✅
- [x] Estructura limpia del proyecto (`backend/` y `frontend/`).
- [x] Conexión en la nube a **Supabase Cloud (PostgreSQL)** configurada y operativa.
- [x] Modelos ORM SQLAlchemy 2.0 (`Rol`, `Usuario`, `Categoria`, `Proveedor`, `Producto`, `Cliente`, `SesionCaja`, `Venta`, `DetalleVenta`, `Compra`, `DetalleCompra`, `MovimientoInventario`, `BitacoraActividad`).
- [x] Seeder automático e idempotente (`seed.py`) con migración automática y catálogo realista.

## Fase 2: Seguridad, Sesiones y Bitácora del Sistema ✅
- [x] **CU01**: Autenticación y Login JWT con control de roles (`ADMIN` y `EMPLEADO`).
- [x] **CU02**: Dashboard del Administrador con métricas globales y accesos rápidos.
- [x] **CU03**: Dashboard del Empleado con accesos a POS, caja y catálogo.
- [x] **CU04**: Gestionar empleados (registrar, editar, activar/desactivar) — ADM.
- [x] **CU05**: Consultar bitácora de actividades del sistema con filtros avanzados y auditoría — ADM.

## Fase 3: Catálogo, Inventario y Proveedores ✅
- [x] **CU06**: Gestionar categorías de productos (cervezas, vinos, licores, gaseosas, jugos, snacks, etc.) — ADM.
- [x] **CU07**: Gestionar productos (registrar, editar, dar de baja, precio) — ADM.
- [x] **CU08**: Consultar catálogo de productos y precios — ADM, EMP.
- [x] **CU09**: Consultar stock disponible en tiempo real con semáforo de cobertura y valorización — ADM, EMP.
- [x] **CU11**: Generar alertas de stock mínimo y productos próximos a vencer (FEFO) — ADM.
- [x] **CU12**: Gestionar proveedores (directorio comercial, contacto, abastecimiento) — ADM.
- [x] **CU13**: Registrar compra de mercadería (ingreso a inventario, cálculo de costos, comprobantes, Kardex y anulación) — ADM.

## Fase 4: Operaciones de Venta y Caja (En Progreso / Siguientes Pasos)
- [ ] **CU14**: Apertura y cierre de caja (arqueo de turno) — EMP.
- [ ] **CU15**: Realizar venta en Punto de Venta (POS) — EMP.
- [ ] **CU16**: Emitir ticket / factura de venta — EMP.
- [ ] **CU17**: Anular venta — ADM.
- [ ] **CU18**: Gestionar clientes — ADM, EMP.
- [ ] **CU19**: Generar reportes de ventas y ganancias — ADM.
