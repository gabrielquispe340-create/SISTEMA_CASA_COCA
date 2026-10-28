from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.bitacora_helper import registrar_evento_bitacora
from app.core.security import get_password_hash, require_admin
from app.db.database import get_db
from app.models.usuario import Rol, Usuario
from app.schemas.usuario import RolOut, UsuarioCreate, UsuarioOut, UsuarioUpdate

router = APIRouter(prefix="/api/usuarios", tags=["CU04 - Gestión de Empleados y Usuarios (Admin)"])


@router.get("/roles", response_model=List[RolOut])
def listar_roles(
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """Lista los roles disponibles en el sistema (ADMIN, EMPLEADO)."""
    return db.query(Rol).order_by(Rol.id).all()


@router.get("/", response_model=List[UsuarioOut])
def listar_usuarios(
    buscar: Optional[str] = Query(default=None, description="Filtrar por nombre, usuario o correo"),
    rol_nombre: Optional[str] = Query(default=None, description="Filtrar por ADMIN o EMPLEADO"),
    estado_activo: Optional[bool] = Query(default=None, description="Filtrar por activo/inactivo"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """Lista todos los empleados y administradores con filtros opcionales (Solo ADMIN)."""
    query = db.query(Usuario).options(joinedload(Usuario.rol)).join(Rol)

    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                Usuario.nombre_completo.ilike(patron),
                Usuario.username.ilike(patron),
                Usuario.email.ilike(patron),
            )
        )

    if rol_nombre and rol_nombre.strip():
        query = query.filter(Rol.nombre == rol_nombre.strip().upper())

    if estado_activo is not None:
        query = query.filter(Usuario.activo.is_(estado_activo))

    return query.order_by(Usuario.id.asc()).all()


@router.post("/", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    datos: UsuarioCreate,
    request: Request = None,
    db: Session = Depends(get_db),
    current_admin: Usuario = Depends(require_admin),
):
    """CU04: Registra un nuevo Empleado o Administrador en el sistema (Solo ADMIN)."""
    username_clean = datos.username.strip()
    nombre_clean = datos.nombre_completo.strip()
    email_clean = datos.email.strip() if datos.email and datos.email.strip() else None

    if not username_clean or not nombre_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre completo y el nombre de usuario son obligatorios.",
        )

    if len(datos.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener al menos 6 caracteres.",
        )

    existente = db.query(Usuario).filter(Usuario.username == username_clean).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El nombre de usuario '{username_clean}' ya está en uso.",
        )

    if email_clean:
        email_existente = db.query(Usuario).filter(Usuario.email == email_clean).first()
        if email_existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El correo '{email_clean}' ya está registrado por otro usuario.",
            )

    rol = db.query(Rol).filter(Rol.id == datos.rol_id).first()
    if not rol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El rol seleccionado no existe.",
        )

    nuevo = Usuario(
        nombre_completo=nombre_clean,
        username=username_clean,
        email=email_clean,
        rol_id=datos.rol_id,
        password_hash=get_password_hash(datos.password),
        activo=datos.activo,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    registrar_evento_bitacora(
        db=db,
        modulo="USUARIOS",
        accion="REGISTRAR_EMPLEADO",
        descripcion=f"Se registró la cuenta de '{nombre_clean}' (@{username_clean}) con rol {rol.nombre}.",
        usuario_id=current_admin.id,
        nivel="SUCCESS",
        request=request,
    )

    return (
        db.query(Usuario)
        .options(joinedload(Usuario.rol))
        .filter(Usuario.id == nuevo.id)
        .first()
    )


@router.put("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioUpdate,
    request: Request = None,
    db: Session = Depends(get_db),
    current_admin: Usuario = Depends(require_admin),
):
    """CU04: Edita los datos, rol, contraseña o estado activo/inactivo de un Empleado (Solo ADMIN)."""
    usuario = (
        db.query(Usuario)
        .options(joinedload(Usuario.rol))
        .filter(Usuario.id == usuario_id)
        .first()
    )
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    if datos.activo is False and usuario.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propia cuenta de Administrador mientras estás en sesión.",
        )

    if datos.nombre_completo is not None:
        nombre_clean = datos.nombre_completo.strip()
        if not nombre_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre completo no puede quedar vacío.",
            )
        usuario.nombre_completo = nombre_clean

    if datos.username is not None:
        username_clean = datos.username.strip()
        if not username_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre de usuario no puede quedar vacío.",
            )
        dup_user = (
            db.query(Usuario)
            .filter(Usuario.username == username_clean, Usuario.id != usuario_id)
            .first()
        )
        if dup_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El usuario '{username_clean}' ya pertenece a otra cuenta.",
            )
        usuario.username = username_clean

    if datos.email is not None:
        email_clean = datos.email.strip() if datos.email.strip() else None
        if email_clean:
            dup_email = (
                db.query(Usuario)
                .filter(Usuario.email == email_clean, Usuario.id != usuario_id)
                .first()
            )
            if dup_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"El correo '{email_clean}' ya pertenece a otra cuenta.",
                )
        usuario.email = email_clean

    if datos.rol_id is not None:
        rol = db.query(Rol).filter(Rol.id == datos.rol_id).first()
        if not rol:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El rol seleccionado no existe.",
            )
        usuario.rol_id = datos.rol_id

    if datos.activo is not None:
        usuario.activo = datos.activo

    cambio_pwd = False
    if datos.password and datos.password.strip():
        if len(datos.password.strip()) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La nueva contraseña debe tener al menos 6 caracteres.",
            )
        usuario.password_hash = get_password_hash(datos.password.strip())
        cambio_pwd = True

    db.commit()
    db.refresh(usuario)

    detalle_extra = " (incluyendo restablecimiento de contraseña)" if cambio_pwd else ""
    registrar_evento_bitacora(
        db=db,
        modulo="USUARIOS",
        accion="EDITAR_EMPLEADO",
        descripcion=f"Se actualizaron los datos del usuario '{usuario.nombre_completo}' (@{usuario.username}){detalle_extra}.",
        usuario_id=current_admin.id,
        nivel="INFO",
        request=request,
    )

    return (
        db.query(Usuario)
        .options(joinedload(Usuario.rol))
        .filter(Usuario.id == usuario.id)
        .first()
    )


@router.patch("/{usuario_id}/estado", response_model=UsuarioOut)
def cambiar_estado_usuario(
    usuario_id: int,
    request: Request = None,
    db: Session = Depends(get_db),
    current_admin: Usuario = Depends(require_admin),
):
    """CU04: Activa o desactiva rápidamente la cuenta de un Empleado (Solo ADMIN)."""
    usuario = (
        db.query(Usuario)
        .options(joinedload(Usuario.rol))
        .filter(Usuario.id == usuario_id)
        .first()
    )
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    if usuario.id == current_admin.id and usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propia cuenta de Administrador en sesión.",
        )

    usuario.activo = not usuario.activo
    db.commit()
    db.refresh(usuario)

    accion_txt = "ACTIVAR_EMPLEADO" if usuario.activo else "DESACTIVAR_EMPLEADO"
    estado_txt = "activó" if usuario.activo else "suspendió/desactivó"
    nivel_log = "SUCCESS" if usuario.activo else "WARNING"

    registrar_evento_bitacora(
        db=db,
        modulo="USUARIOS",
        accion=accion_txt,
        descripcion=f"Se {estado_txt} el acceso al sistema para '{usuario.nombre_completo}' (@{usuario.username}).",
        usuario_id=current_admin.id,
        nivel=nivel_log,
        request=request,
    )

    return usuario
