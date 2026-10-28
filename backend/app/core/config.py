import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar siempre el archivo .env ubicado en la carpeta backend/
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)


class Settings:
    PROJECT_NAME: str = "CASA COCA - Sistema de Gestión y POS API"
    VERSION: str = "1.0.0"

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tienda_local.db")
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY", "clave_secreta_super_segura_sistema_tienda_2026"
    )
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")
    )

    @property
    def sqlalchemy_database_url(self) -> str:
        # Compatibilidad automática si Supabase entrega 'postgres://' en lugar de 'postgresql://'
        if self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return self.DATABASE_URL


settings = Settings()
