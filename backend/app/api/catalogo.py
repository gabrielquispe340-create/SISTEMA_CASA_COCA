import shutil
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.bitacora_helper import registrar_evento_bitacora
from app.core.security import require_admin, require_empleado_or_admin
from app.db.database import get_db
from app.db.seed import seed_initial_data
from app.models.catalogo import Categoria, Producto, Proveedor
from app.models.inventario import Compra
from app.models.usuario import Usuario
from app.schemas.catalogo import (
    CategoriaCreate,
    CategoriaOut,
    CategoriaUpdate,
    ProductoCreate,
    ProductoOut,
    ProductoPrecioUpdate,
    ProductoUpdate,
    ProveedorCreate,
    ProveedorOut,
    ProveedorUpdate,
)

router = APIRouter(prefix="/api/catalogo", tags=["Catálogo y Productos"])


def _serializar_categoria_con_conteo(db: Session, categoria: Categoria) -> CategoriaOut:
    conteo = (
        db.query(func.count(Producto.id))
        .filter(Producto.categoria_id == categoria.id)
        .scalar()
        or 0
    )
    return CategoriaOut(
        id=categoria.id,
        nombre=categoria.nombre,
        descripcion=categoria.descripcion,
        activo=categoria.activo,
        cantidad_productos=conteo,
    )


# =============================================================================
# CU06: GESTIONAR CATEGORÍAS DE PRODUCTOS (CERVEZAS, VINOS, LICORES, ETC.)
# =============================================================================
@router.get("/categorias", response_model=List[CategoriaOut])
def listar_categorias(
    buscar: Optional[str] = Query(
        default=None, description="Buscar por nombre o descripción de categoría"
    ),
    solo_activos: Optional[bool] = Query(
        default=None, description="Filtrar solo categorías activas o inactivas"
    ),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """Lista las categorías del catálogo con el conteo de productos asociados."""
    if not db.query(Categoria).filter(Categoria.nombre == "Cervezas").first():
        seed_initial_data(db)

    query = db.query(Categoria)
    if solo_activos is not None:
        query = query.filter(Categoria.activo.is_(solo_activos))
    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                Categoria.nombre.ilike(patron),
                Categoria.descripcion.ilike(patron),
            )
        )

    categorias = query.order_by(Categoria.id.asc()).all()

    # Conteo agrupado en una sola consulta SQL
    conteos_raw = (
        db.query(Producto.categoria_id, func.count(Producto.id))
        .group_by(Producto.categoria_id)
        .all()
    )
    mapa_conteos = {cat_id: total for cat_id, total in conteos_raw}

    return [
        CategoriaOut(
            id=cat.id,
            nombre=cat.nombre,
            descripcion=cat.descripcion,
            activo=cat.activo,
            cantidad_productos=mapa_conteos.get(cat.id, 0),
        )
        for cat in categorias
    ]


@router.post(
    "/categorias", response_model=CategoriaOut, status_code=status.HTTP_201_CREATED
)
def crear_categoria(
    datos: CategoriaCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Crea una nueva categoría de productos (Solo ADMIN) y registra en bitácora."""
    nombre_limpio = datos.nombre.strip()
    if not nombre_limpio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de la categoría es obligatorio.",
        )

    existente = (
        db.query(Categoria)
        .filter(func.lower(Categoria.nombre) == nombre_limpio.lower())
        .first()
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe una categoría registrada con el nombre '{nombre_limpio}'.",
        )

    categoria = Categoria(
        nombre=nombre_limpio,
        descripcion=datos.descripcion.strip() if datos.descripcion else None,
        activo=datos.activo,
    )
    db.add(categoria)
    db.commit()
    db.refresh(categoria)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="CREAR_CATEGORIA",
        descripcion=f"Se creó la categoría '{categoria.nombre}' (ID #{categoria.id}).",
        usuario_id=admin_actual.id,
        nivel="SUCCESS",
        request=request,
    )

    return _serializar_categoria_con_conteo(db, categoria)


@router.put("/categorias/{categoria_id}", response_model=CategoriaOut)
def actualizar_categoria(
    categoria_id: int,
    datos: CategoriaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Edita el nombre, descripción o estado de una categoría de productos (Solo ADMIN)."""
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoría no encontrada.",
        )

    if datos.nombre is not None:
        nuevo_nombre = datos.nombre.strip()
        if not nuevo_nombre:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre de la categoría no puede estar vacío.",
            )
        duplicada = (
            db.query(Categoria)
            .filter(
                func.lower(Categoria.nombre) == nuevo_nombre.lower(),
                Categoria.id != categoria_id,
            )
            .first()
        )
        if duplicada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ya existe otra categoría con el nombre '{nuevo_nombre}'.",
            )
        categoria.nombre = nuevo_nombre

    if datos.descripcion is not None:
        categoria.descripcion = datos.descripcion.strip() or None

    if datos.activo is not None:
        categoria.activo = datos.activo

    db.commit()
    db.refresh(categoria)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="EDITAR_CATEGORIA",
        descripcion=f"Se actualizaron los datos de la categoría '{categoria.nombre}' (ID #{categoria.id}).",
        usuario_id=admin_actual.id,
        nivel="INFO",
        request=request,
    )

    return _serializar_categoria_con_conteo(db, categoria)


@router.patch("/categorias/{categoria_id}/estado", response_model=CategoriaOut)
def cambiar_estado_categoria(
    categoria_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Activa o desactiva una categoría de productos (Solo ADMIN)."""
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoría no encontrada.",
        )

    categoria.activo = not categoria.activo
    db.commit()
    db.refresh(categoria)

    accion = "ACTIVAR_CATEGORIA" if categoria.activo else "DESACTIVAR_CATEGORIA"
    estado_txt = "ACTIVA" if categoria.activo else "INACTIVA"
    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion=accion,
        descripcion=f"La categoría '{categoria.nombre}' (ID #{categoria.id}) cambió a estado {estado_txt}.",
        usuario_id=admin_actual.id,
        nivel="SUCCESS" if categoria.activo else "WARNING",
        request=request,
    )

    return _serializar_categoria_con_conteo(db, categoria)


@router.delete("/categorias/{categoria_id}")
def eliminar_categoria(
    categoria_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Elimina una categoría si no tiene productos asociados (Solo ADMIN)."""
    categoria = db.query(Categoria).filter(Categoria.id == categoria_id).first()
    if not categoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoría no encontrada.",
        )

    total_productos = (
        db.query(func.count(Producto.id))
        .filter(Producto.categoria_id == categoria_id)
        .scalar()
        or 0
    )
    if total_productos > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede eliminar la categoría '{categoria.nombre}' porque tiene {total_productos} producto(s) asociado(s). Puede desactivarla en su lugar.",
        )

    nombre_eliminado = categoria.nombre
    db.delete(categoria)
    db.commit()

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="ELIMINAR_CATEGORIA",
        descripcion=f"Se eliminó la categoría '{nombre_eliminado}' (ID #{categoria_id}).",
        usuario_id=admin_actual.id,
        nivel="WARNING",
        request=request,
    )

    return {"mensaje": f"Categoría '{nombre_eliminado}' eliminada correctamente."}


# =============================================================================
# CU12: GESTIONAR PROVEEDORES (ADMINISTRADOR)
# =============================================================================
def _serializar_proveedor_con_conteos(
    db: Session, proveedor: Proveedor
) -> ProveedorOut:
    total_prod = (
        db.query(func.count(Producto.id))
        .filter(Producto.proveedor_id == proveedor.id)
        .scalar()
        or 0
    )
    total_comp = (
        db.query(func.count(Compra.id))
        .filter(Compra.proveedor_id == proveedor.id)
        .scalar()
        or 0
    )
    return ProveedorOut(
        id=proveedor.id,
        nombre_empresa=proveedor.nombre_empresa,
        contacto_nombre=proveedor.contacto_nombre,
        telefono=proveedor.telefono,
        email=proveedor.email,
        direccion=proveedor.direccion,
        activo=proveedor.activo,
        cantidad_productos=total_prod,
        cantidad_compras=total_comp,
    )


@router.get("/proveedores", response_model=List[ProveedorOut])
def listar_proveedores(
    buscar: Optional[str] = Query(
        default=None,
        description="Buscar por empresa, persona de contacto, teléfono, email o dirección",
    ),
    solo_activos: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_admin),
):
    """Lista los proveedores registrados con conteo de productos y compras (Solo ADMIN - CU12)."""
    if (
        not db.query(Proveedor)
        .filter(Proveedor.nombre_empresa == "Cervecería Nacional Distribuidora S.A.")
        .first()
    ):
        seed_initial_data(db)

    query = db.query(Proveedor)
    if solo_activos is not None:
        query = query.filter(Proveedor.activo.is_(solo_activos))
    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                Proveedor.nombre_empresa.ilike(patron),
                Proveedor.contacto_nombre.ilike(patron),
                Proveedor.telefono.ilike(patron),
                Proveedor.email.ilike(patron),
                Proveedor.direccion.ilike(patron),
            )
        )

    proveedores = query.order_by(Proveedor.id.asc()).all()

    conteo_prod_raw = (
        db.query(Producto.proveedor_id, func.count(Producto.id))
        .group_by(Producto.proveedor_id)
        .all()
    )
    mapa_prod = {prov_id: total for prov_id, total in conteo_prod_raw if prov_id}

    conteo_comp_raw = (
        db.query(Compra.proveedor_id, func.count(Compra.id))
        .group_by(Compra.proveedor_id)
        .all()
    )
    mapa_comp = {prov_id: total for prov_id, total in conteo_comp_raw if prov_id}

    return [
        ProveedorOut(
            id=p.id,
            nombre_empresa=p.nombre_empresa,
            contacto_nombre=p.contacto_nombre,
            telefono=p.telefono,
            email=p.email,
            direccion=p.direccion,
            activo=p.activo,
            cantidad_productos=mapa_prod.get(p.id, 0),
            cantidad_compras=mapa_comp.get(p.id, 0),
        )
        for p in proveedores
    ]


@router.post(
    "/proveedores", response_model=ProveedorOut, status_code=status.HTTP_201_CREATED
)
def crear_proveedor(
    datos: ProveedorCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Registra un nuevo proveedor para abastecimiento (Solo ADMIN - CU12)."""
    empresa_limpia = datos.nombre_empresa.strip()
    if not empresa_limpia:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de la empresa proveedora es obligatorio.",
        )

    existente = (
        db.query(Proveedor)
        .filter(func.lower(Proveedor.nombre_empresa) == empresa_limpia.lower())
        .first()
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un proveedor registrado con el nombre '{empresa_limpia}'.",
        )

    proveedor = Proveedor(
        nombre_empresa=empresa_limpia,
        contacto_nombre=datos.contacto_nombre.strip()
        if datos.contacto_nombre
        else None,
        telefono=datos.telefono.strip() if datos.telefono else None,
        email=datos.email.strip() if datos.email else None,
        direccion=datos.direccion.strip() if datos.direccion else None,
        activo=datos.activo,
    )
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="CREAR_PROVEEDOR",
        descripcion=f"Se registró el proveedor '{proveedor.nombre_empresa}' (Contacto: {proveedor.contacto_nombre or 'S/D'}).",
        usuario_id=admin_actual.id,
        nivel="SUCCESS",
        request=request,
    )

    return _serializar_proveedor_con_conteos(db, proveedor)


@router.put("/proveedores/{proveedor_id}", response_model=ProveedorOut)
def actualizar_proveedor(
    proveedor_id: int,
    datos: ProveedorUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Edita los datos comerciales y de contacto de un proveedor (Solo ADMIN - CU12)."""
    proveedor = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not proveedor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado.",
        )

    if datos.nombre_empresa is not None:
        nueva_empresa = datos.nombre_empresa.strip()
        if not nueva_empresa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre de la empresa no puede quedar vacío.",
            )
        duplicado = (
            db.query(Proveedor)
            .filter(
                func.lower(Proveedor.nombre_empresa) == nueva_empresa.lower(),
                Proveedor.id != proveedor_id,
            )
            .first()
        )
        if duplicado:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Otro proveedor ya está registrado con el nombre '{nueva_empresa}'.",
            )
        proveedor.nombre_empresa = nueva_empresa

    if datos.contacto_nombre is not None:
        proveedor.contacto_nombre = datos.contacto_nombre.strip() or None
    if datos.telefono is not None:
        proveedor.telefono = datos.telefono.strip() or None
    if datos.email is not None:
        proveedor.email = datos.email.strip() or None
    if datos.direccion is not None:
        proveedor.direccion = datos.direccion.strip() or None
    if datos.activo is not None:
        proveedor.activo = datos.activo

    db.commit()
    db.refresh(proveedor)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="EDITAR_PROVEEDOR",
        descripcion=f"Se actualizaron los datos del proveedor '{proveedor.nombre_empresa}' (ID #{proveedor.id}).",
        usuario_id=admin_actual.id,
        nivel="INFO",
        request=request,
    )

    return _serializar_proveedor_con_conteos(db, proveedor)


@router.patch("/proveedores/{proveedor_id}/estado", response_model=ProveedorOut)
def cambiar_estado_proveedor(
    proveedor_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Activa o desactiva un proveedor (Solo ADMIN - CU12)."""
    proveedor = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not proveedor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado.",
        )

    proveedor.activo = not proveedor.activo
    db.commit()
    db.refresh(proveedor)

    accion = "ACTIVAR_PROVEEDOR" if proveedor.activo else "DESACTIVAR_PROVEEDOR"
    estado_txt = "ACTIVO" if proveedor.activo else "INACTIVO"

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion=accion,
        descripcion=f"El proveedor '{proveedor.nombre_empresa}' (ID #{proveedor.id}) cambió a estado {estado_txt}.",
        usuario_id=admin_actual.id,
        nivel="SUCCESS" if proveedor.activo else "WARNING",
        request=request,
    )

    return _serializar_proveedor_con_conteos(db, proveedor)


@router.delete("/proveedores/{proveedor_id}")
def eliminar_proveedor(
    proveedor_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Elimina un proveedor si no tiene productos ni compras asociadas (Solo ADMIN - CU12)."""
    proveedor = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not proveedor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado.",
        )

    total_prod = (
        db.query(func.count(Producto.id))
        .filter(Producto.proveedor_id == proveedor_id)
        .scalar()
        or 0
    )
    total_comp = (
        db.query(func.count(Compra.id))
        .filter(Compra.proveedor_id == proveedor_id)
        .scalar()
        or 0
    )
    if total_prod > 0 or total_comp > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No se puede eliminar al proveedor '{proveedor.nombre_empresa}' porque tiene "
                f"{total_prod} producto(s) y {total_comp} compra(s) asociadas. Puede desactivarlo en su lugar."
            ),
        )

    nombre_eliminado = proveedor.nombre_empresa
    db.delete(proveedor)
    db.commit()

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="ELIMINAR_PROVEEDOR",
        descripcion=f"Se eliminó el proveedor '{nombre_eliminado}' (ID #{proveedor_id}).",
        usuario_id=admin_actual.id,
        nivel="WARNING",
        request=request,
    )

    return {"mensaje": f"Proveedor '{nombre_eliminado}' eliminado correctamente."}


# =============================================================================
# CU07: GESTIONAR PRODUCTOS (REGISTRAR, EDITAR, DAR DE BAJA, PRECIO)
# =============================================================================
@router.get("/productos", response_model=List[ProductoOut])
def listar_productos(
    buscar: Optional[str] = Query(
        default=None, description="Buscar por nombre, descripción o código de barras"
    ),
    categoria_id: Optional[int] = Query(default=None),
    solo_activos: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """Lista y filtra productos del catálogo para el POS (Empleado) o Gestión de Productos (Admin)."""
    if not db.query(Producto).filter(Producto.codigo_barras == "7774001").first():
        seed_initial_data(db)

    query = db.query(Producto).options(
        joinedload(Producto.categoria), joinedload(Producto.proveedor)
    )
    if solo_activos is not None:
        query = query.filter(Producto.activo.is_(solo_activos))
    if categoria_id is not None:
        query = query.filter(Producto.categoria_id == categoria_id)
    if buscar and buscar.strip():
        patron = f"%{buscar.strip()}%"
        query = query.filter(
            or_(
                Producto.nombre.ilike(patron),
                Producto.codigo_barras.ilike(patron),
                Producto.descripcion.ilike(patron),
            )
        )
    return query.order_by(Producto.id.desc()).all()


@router.get("/productos/codigo/{codigo_barras}", response_model=ProductoOut)
def buscar_por_codigo_barras(
    codigo_barras: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_empleado_or_admin),
):
    """Búsqueda instantánea por lector de código de barras en el Punto de Venta (POS)."""
    producto = (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.codigo_barras == codigo_barras, Producto.activo.is_(True))
        .first()
    )
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró ningún producto activo con el código '{codigo_barras}'",
        )
    return producto


@router.post(
    "/productos", response_model=ProductoOut, status_code=status.HTTP_201_CREATED
)
def crear_producto(
    datos: ProductoCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Registra un nuevo producto en el catálogo con su precio y stock (Solo ADMIN - CU07)."""
    codigo_limpio = datos.codigo_barras.strip()
    nombre_limpio = datos.nombre.strip()
    if not codigo_limpio or not nombre_limpio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El código de barras/SKU y el nombre del producto son obligatorios.",
        )

    if (
        db.query(Producto)
        .filter(func.lower(Producto.codigo_barras) == codigo_limpio.lower())
        .first()
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un producto registrado con el código de barras / SKU '{codigo_limpio}'.",
        )

    payload = datos.model_dump()
    payload["codigo_barras"] = codigo_limpio
    payload["nombre"] = nombre_limpio
    if payload.get("descripcion"):
        payload["descripcion"] = payload["descripcion"].strip()

    producto = Producto(**payload)
    db.add(producto)
    db.commit()
    db.refresh(producto)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="REGISTRAR_PRODUCTO",
        descripcion=(
            f"Se registró el producto '{producto.nombre}' (SKU: {producto.codigo_barras}) "
            f"con precio de venta Bs. {producto.precio_venta:.2f} y stock inicial de {producto.stock_actual} uds."
        ),
        usuario_id=admin_actual.id,
        nivel="SUCCESS",
        request=request,
    )

    return (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.id == producto.id)
        .first()
    )


@router.put("/productos/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int,
    datos: ProductoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Edita datos, categoría, proveedor, precios o estado de un producto (Solo ADMIN - CU07)."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado.",
        )

    if datos.codigo_barras is not None:
        nuevo_codigo = datos.codigo_barras.strip()
        if not nuevo_codigo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código de barras / SKU no puede quedar vacío.",
            )
        duplicado = (
            db.query(Producto)
            .filter(
                func.lower(Producto.codigo_barras) == nuevo_codigo.lower(),
                Producto.id != producto_id,
            )
            .first()
        )
        if duplicado:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Otro producto ya utiliza el código de barras '{nuevo_codigo}'.",
            )
        producto.codigo_barras = nuevo_codigo

    precio_anterior = producto.precio_venta

    campos_actualizables = datos.model_dump(exclude_unset=True)
    campos_actualizables.pop("codigo_barras", None)

    for campo, valor in campos_actualizables.items():
        if campo == "nombre" and isinstance(valor, str):
            valor = valor.strip()
        elif campo == "descripcion" and isinstance(valor, str):
            valor = valor.strip() or None
        setattr(producto, campo, valor)

    db.commit()
    db.refresh(producto)

    detalle_precio = ""
    if precio_anterior != producto.precio_venta:
        detalle_precio = f" (Precio actualizado: Bs. {precio_anterior:.2f} -> Bs. {producto.precio_venta:.2f})"

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="EDITAR_PRODUCTO",
        descripcion=f"Se actualizaron los datos del producto '{producto.nombre}' (SKU: {producto.codigo_barras}){detalle_precio}.",
        usuario_id=admin_actual.id,
        nivel="INFO",
        request=request,
    )

    return (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.id == producto.id)
        .first()
    )


@router.patch("/productos/{producto_id}/precio", response_model=ProductoOut)
def actualizar_precio_producto(
    producto_id: int,
    datos: ProductoPrecioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Actualiza de forma directa el precio de compra y precio de venta de un producto (Solo ADMIN - CU07)."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado.",
        )

    compra_ant = producto.precio_compra
    venta_ant = producto.precio_venta
    producto.precio_compra = datos.precio_compra
    producto.precio_venta = datos.precio_venta

    db.commit()
    db.refresh(producto)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="ACTUALIZAR_PRECIO",
        descripcion=(
            f"Cambio de precio en '{producto.nombre}' (SKU: {producto.codigo_barras}): "
            f"Compra Bs. {compra_ant:.2f} -> Bs. {producto.precio_compra:.2f} | "
            f"Venta Bs. {venta_ant:.2f} -> Bs. {producto.precio_venta:.2f}."
        ),
        usuario_id=admin_actual.id,
        nivel="INFO",
        request=request,
    )

    return (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.id == producto.id)
        .first()
    )


@router.patch("/productos/{producto_id}/estado", response_model=ProductoOut)
def cambiar_estado_producto(
    producto_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Da de baja (desactiva) o reactiva un producto del catálogo (Solo ADMIN - CU07)."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado.",
        )

    producto.activo = not producto.activo
    db.commit()
    db.refresh(producto)

    accion = "REACTIVAR_PRODUCTO" if producto.activo else "DAR_BAJA_PRODUCTO"
    estado_txt = "ACTIVO (En venta)" if producto.activo else "DADO DE BAJA (Inactivo)"

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion=accion,
        descripcion=f"El producto '{producto.nombre}' (SKU: {producto.codigo_barras}) cambió a estado {estado_txt}.",
        usuario_id=admin_actual.id,
        nivel="SUCCESS" if producto.activo else "WARNING",
        request=request,
    )

    return (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.id == producto.id)
        .first()
    )


@router.post("/productos/{producto_id}/imagen", response_model=ProductoOut)
def subir_imagen_producto(
    producto_id: int,
    archivo: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    admin_actual: Usuario = Depends(require_admin),
):
    """Sube y almacena la fotografía oficial de un producto del catálogo (Solo ADMIN)."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado.",
        )

    extensiones_validas = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    nombre_original = archivo.filename or "producto.png"
    ext = Path(nombre_original).suffix.lower()
    if ext not in extensiones_validas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato no permitido ('{ext}'). Se aceptan: JPG, PNG, WEBP o GIF.",
        )

    carpeta_subida = Path(__file__).resolve().parent.parent.parent / "uploads" / "productos"
    carpeta_subida.mkdir(parents=True, exist_ok=True)

    nombre_archivo = f"prod_{producto.id}_{uuid.uuid4().hex[:8]}{ext}"
    ruta_destino = carpeta_subida / nombre_archivo

    with open(ruta_destino, "wb") as buffer:
        shutil.copyfileobj(archivo.file, buffer)

    producto.imagen_url = f"/uploads/productos/{nombre_archivo}"
    db.commit()
    db.refresh(producto)

    registrar_evento_bitacora(
        db=db,
        modulo="CATALOGO",
        accion="SUBIR_IMAGEN",
        descripcion=f"Se asignó una nueva imagen al producto '{producto.nombre}' (ID #{producto.id}).",
        usuario_id=admin_actual.id,
        nivel="INFO",
        request=request,
    )

    return (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.proveedor))
        .filter(Producto.id == producto.id)
        .first()
    )
