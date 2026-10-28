-- =============================================================================
-- SISTEMA PARA TIENDA - ESQUEMA DE BASE DE DATOS (PostgreSQL / Supabase)
-- =============================================================================
-- Puedes ejecutar este script directamente en el "SQL Editor" de Supabase
-- o en pgAdmin para PostgreSQL local.
-- =============================================================================

-- 1. TABLA DE ROLES
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE, -- 'ADMIN', 'EMPLEADO'
    descripcion VARCHAR(150)
);

-- 2. TABLA DE USUARIOS (EMPLEADOS Y ADMINISTRADORES)
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    nombre_completo VARCHAR(120) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(120) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA DE CATEGORÍAS DE PRODUCTOS
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE,
    descripcion VARCHAR(250),
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. TABLA DE PROVEEDORES
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nombre_empresa VARCHAR(120) NOT NULL,
    contacto_nombre VARCHAR(100),
    telefono VARCHAR(30),
    email VARCHAR(120),
    direccion VARCHAR(250),
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. TABLA DE PRODUCTOS (CATÁLOGO E INVENTARIO)
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    codigo_barras VARCHAR(60) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(300),
    precio_compra NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (precio_compra >= 0),
    precio_venta NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (precio_venta >= 0),
    stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INTEGER NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABLA DE CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    documento_identidad VARCHAR(40) NOT NULL UNIQUE, -- NIT / CI / DNI
    nombre_completo VARCHAR(150) NOT NULL,
    telefono VARCHAR(30),
    email VARCHAR(120),
    fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABLA DE SESIONES DE CAJA (APERTURA Y CIERRE POR TURNO DE EMPLEADO)
CREATE TABLE IF NOT EXISTS sesiones_caja (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    fecha_apertura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    monto_inicial NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (monto_inicial >= 0),
    total_ventas_efectivo NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_ventas_otros NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_final_esperado NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    monto_final_real NUMERIC(12, 2),
    diferencia NUMERIC(12, 2),
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
    observaciones VARCHAR(300)
);

-- 8. TABLA DE VENTAS (CABECERA)
CREATE TABLE IF NOT EXISTS ventas (
    id SERIAL PRIMARY KEY,
    numero_comprobante VARCHAR(40) NOT NULL UNIQUE,
    sesion_caja_id INTEGER REFERENCES sesiones_caja(id) ON DELETE SET NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    fecha_venta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    descuento NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    impuestos NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    metodo_pago VARCHAR(30) NOT NULL DEFAULT 'EFECTIVO' CHECK (metodo_pago IN ('EFECTIVO', 'TARJETA', 'QR', 'MIXTO')),
    estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('COMPLETADA', 'ANULADA'))
);

-- 9. TABLA DE DETALLE DE VENTAS (PRODUCTOS VENDIDOS Y COSTO HISTÓRICO)
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
    costo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (costo_unitario >= 0),
    descuento_linea NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal_linea NUMERIC(12, 2) NOT NULL CHECK (subtotal_linea >= 0)
);

-- 10. TABLA DE COMPRAS A PROVEEDORES (ADMINISTRADOR)
CREATE TABLE IF NOT EXISTS compras (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    numero_factura_proveedor VARCHAR(60),
    fecha_compra TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_compra NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    estado VARCHAR(20) NOT NULL DEFAULT 'RECIBIDA' CHECK (estado IN ('RECIBIDA', 'ANULADA'))
);

-- 11. TABLA DE DETALLE DE COMPRAS
CREATE TABLE IF NOT EXISTS detalle_compras (
    id SERIAL PRIMARY KEY,
    compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    costo_unitario_compra NUMERIC(12, 2) NOT NULL CHECK (costo_unitario_compra >= 0),
    subtotal_linea NUMERIC(12, 2) NOT NULL CHECK (subtotal_linea >= 0)
);

-- 12. TABLA DE KARDEX / MOVIMIENTOS DE INVENTARIO
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    tipo_movimiento VARCHAR(30) NOT NULL CHECK (tipo_movimiento IN ('VENTA', 'COMPRA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'ANULACION')),
    cantidad INTEGER NOT NULL,
    stock_anterior INTEGER NOT NULL,
    stock_resultante INTEGER NOT NULL,
    referencia VARCHAR(150),
    fecha_movimiento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. TABLA DE BITÁCORA DE ACTIVIDADES DEL SISTEMA (CU05 - AUDITORÍA)
CREATE TABLE IF NOT EXISTS bitacora_actividades (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    modulo VARCHAR(50) NOT NULL,
    accion VARCHAR(60) NOT NULL,
    descripcion VARCHAR(400) NOT NULL,
    ip_origen VARCHAR(60) DEFAULT '127.0.0.1',
    nivel VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK (nivel IN ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL')),
    fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- ÍNDICES PARA OPTIMIZACIÓN DE BÚSQUEDAS POS Y REPORTES DEL ADMINISTRADOR
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_usuario ON ventas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto ON detalle_ventas(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto_fecha ON movimientos_inventario(producto_id, fecha_movimiento);

-- =============================================================================
-- DATOS SEMILLA INICIALES (ROLES Y CLIENTE POR DEFECTO)
-- =============================================================================
INSERT INTO roles (nombre, descripcion) VALUES
    ('ADMIN', 'Administrador general con acceso a reportes, inventario, compras y usuarios'),
    ('EMPLEADO', 'Cajero / Vendedor con acceso a punto de venta, clientes y turno de caja')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO clientes (documento_identidad, nombre_completo, telefono) VALUES
    ('0', 'Consumidor Final', '-')
ON CONFLICT (documento_identidad) DO NOTHING;

-- =============================================================================
-- SEGURIDAD SUPABASE: ACTIVAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
-- =============================================================================
-- Esto quita el aviso "UNRESTRICTED" en el panel de Supabase y bloquea el acceso
-- público directo a la Data API, permitiendo acceso únicamente a tu Backend en Python.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_actividades ENABLE ROW LEVEL SECURITY;

