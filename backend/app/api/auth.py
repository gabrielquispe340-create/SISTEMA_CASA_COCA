from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload

from app.core.bitacora_helper import registrar_evento_bitacora
from app.core.security import (
    create_access_token,
    get_current_user,
    verify_password,
)
from app.db.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import TokenOut, UsuarioOut

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenOut)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Inicia sesión para Empleado o Administrador, registra el evento en la Bitácora (CU05) y devuelve el JWT."""
    usuario = (
        db.query(Usuario)
        .options(joinedload(Usuario.rol))
        .filter(Usuario.username == form_data.username)
        .first()
    )
    if not usuario or not verify_password(form_data.password, usuario.password_hash):
        registrar_evento_bitacora(
            db=db,
            modulo="AUTENTICACION",
            accion="INTENTO_LOGIN_FALLIDO",
            descripcion=f"Intento fallido de inicio de sesión con el usuario '{form_data.username}'.",
            usuario_id=usuario.id if usuario else None,
            nivel="WARNING",
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario.activo:
        registrar_evento_bitacora(
            db=db,
            modulo="AUTENTICACION",
            accion="INTENTO_CUENTA_INACTIVA",
            descripcion=f"El usuario '{usuario.username}' ({usuario.nombre_completo}) intentó ingresar con cuenta desactivada.",
            usuario_id=usuario.id,
            nivel="CRITICAL",
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta de usuario se encuentra desactivada",
        )

    registrar_evento_bitacora(
        db=db,
        modulo="AUTENTICACION",
        accion="INICIO_SESION",
        descripcion=f"Inicio de sesión exitoso de '{usuario.nombre_completo}' (@{usuario.username}) con rol {usuario.rol.nombre}.",
        usuario_id=usuario.id,
        nivel="SUCCESS",
        request=request,
    )

    access_token = create_access_token(
        data={"sub": usuario.username, "rol": usuario.rol.nombre}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "usuario": usuario,
    }


@router.get("/me", response_model=UsuarioOut)
def obtener_perfil_actual(current_user: Usuario = Depends(get_current_user)):
    """Devuelve los datos y rol del usuario autenticado actualmente."""
    return current_user
