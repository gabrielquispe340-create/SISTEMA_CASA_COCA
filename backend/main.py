from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.models  # noqa: F401 - Registra todos los modelos en Base.metadata
from app.api import auth, bitacora, caja, catalogo, inventario, reportes, usuarios, ventas
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine, get_db
from app.db.seed import seed_initial_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Crea las tablas automáticamente en la BD configurada (Supabase, PostgreSQL o SQLite)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "API REST en Python para Sistema de Tienda con dos roles: "
        "EMPLEADO (Punto de Venta, Caja, Clientes) y ADMIN (Reportes, Inventario, Compras, Usuarios)."
    ),
    lifespan=lifespan,
)

# Configuración CORS para permitir la conexión limpia desde el Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro de Routers modulares
app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(bitacora.router)
app.include_router(catalogo.router)
app.include_router(caja.router)
app.include_router(ventas.router)
app.include_router(inventario.router)
app.include_router(reportes.router)


@app.get("/", tags=["Estado del Sistema"])
def raiz():
    return {
        "sistema": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "documentacion_interactiva": "/docs",
        "estado": "en_linea",
    }


@app.get("/api/health", tags=["Estado del Sistema"])
def health_check(db: Session = Depends(get_db)):
    """
    Endpoint de verificación de salud y conexión a la base de datos.
    Útil también para mantener activa la base de datos en Supabase (keep-alive).
    """
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


# Montar carpeta de uploads para imágenes de productos
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
(UPLOADS_DIR / "productos").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Montar el Frontend automáticamente en http://127.0.0.1:8000/app
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

