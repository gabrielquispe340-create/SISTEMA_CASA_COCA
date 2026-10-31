import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-productos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-productos.html',
  styleUrl: './admin-productos.css',
})
export class AdminProductos implements OnInit {
  usuarioSesion: any = null;
  productos: any[] = [];
  categorias: any[] = [];
  proveedores: any[] = [];

  cargando = false;
  guardando = false;

  // Filtros en tiempo real
  filtroTexto = '';
  filtroCategoriaId = 0;
  filtroEstado: 'TODOS' | 'ACTIVOS' | 'BAJA' | 'STOCK_BAJO' = 'TODOS';
  modoVista: 'TABLA' | 'TARJETAS' = 'TABLA';

  // Verificador rápido por Código de Barras / SKU (CU08)
  codigoVerificador = '';
  productoVerificado: any = null;
  errorVerificador = '';

  // Notificación visual (Toast)
  mensajeNotificacion = '';
  tipoNotificacion: 'success' | 'error' | '' = '';

  // Modal Principal: Registrar / Editar Producto
  modalProductoAbierto = false;
  modoEdicion = false;
  errorModal = '';

  formulario = {
    id: 0,
    codigo_barras: '',
    nombre: '',
    descripcion: '',
    categoria_id: 0,
    proveedor_id: 0 as number | null,
    precio_compra: 0,
    precio_venta: 0,
    stock_actual: 0,
    stock_minimo: 5,
    fecha_vencimiento: '',
    lote: '',
    tiene_paquete: false,
    nombre_paquete: 'Paquete',
    unidades_por_paquete: 1,
    precio_paquete_venta: null as number | null,
    precio_paquete_compra: null as number | null,
    codigo_barra_paquete: '',
    activo: true,
    imagen_url: '' as string | null,
  };

  // Asistente de cálculo para stock dual inicial (Paquetes + Unidades sueltas)
  stock_paquetes_input = 0;
  stock_unidades_input = 0;

  archivoImagenSeleccionado: File | null = null;
  previewImagen: string | null = null;

  // Modal Rápido: Actualizar Precio (CU07)
  modalPrecioAbierto = false;
  errorModalPrecio = '';
  formularioPrecio = {
    id: 0,
    nombre: '',
    codigo_barras: '',
    precio_compra: 0,
    precio_venta: 0,
  };

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.usuarioSesion = this.authService.obtenerUsuario();
    if (!this.usuarioSesion) {
      this.router.navigate(['/login']);
      return;
    }
    this.cargarCatalogosAuxiliares();
    this.cargarProductos();
  }

  cargarCatalogosAuxiliares(): void {
    this.apiService.getCategorias().subscribe({
      next: (cats) => {
        this.categorias = cats || [];
        this.cdr.detectChanges();
      },
    });

    this.apiService.getProveedores().subscribe({
      next: (provs) => {
        this.proveedores = provs || [];
        this.cdr.detectChanges();
      },
    });
  }

  cargarProductos(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.apiService.getProductos().subscribe({
      next: (lista) => {
        this.productos = lista || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.mostrarToast('No se pudo cargar el catálogo de productos.', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // Lista filtrada en tiempo real
  get productosFiltrados(): any[] {
    return this.productos.filter((p) => {
      const texto = this.filtroTexto.trim().toLowerCase();
      const coincideTexto =
        !texto ||
        (p.nombre && p.nombre.toLowerCase().includes(texto)) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase().includes(texto)) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(texto)) ||
        (p.categoria?.nombre && p.categoria.nombre.toLowerCase().includes(texto));

      const coincideCategoria =
        Number(this.filtroCategoriaId) === 0 ||
        Number(p.categoria_id) === Number(this.filtroCategoriaId);

      let coincideEstado = true;
      if (this.filtroEstado === 'ACTIVOS') {
        coincideEstado = p.activo === true;
      } else if (this.filtroEstado === 'BAJA') {
        coincideEstado = p.activo === false;
      } else if (this.filtroEstado === 'STOCK_BAJO') {
        coincideEstado = Number(p.stock_actual) <= Number(p.stock_minimo);
      }

      return coincideTexto && coincideCategoria && coincideEstado;
    });
  }

  // KPIs en tiempo real
  get totalProductos(): number {
    return this.productos.length;
  }

  get totalActivos(): number {
    return this.productos.filter((p) => p.activo).length;
  }

  get totalDadosDeBaja(): number {
    return this.productos.filter((p) => !p.activo).length;
  }

  get totalStockCritico(): number {
    return this.productos.filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo)).length;
  }

  calcularMargenPorcentaje(compra: any, venta: any): number {
    const c = Number(compra) || 0;
    const v = Number(venta) || 0;
    if (v <= 0) return 0;
    if (c <= 0) return 100;
    return Math.round(((v - c) / c) * 100);
  }

  calcularGananciaUnitaria(compra: any, venta: any): number {
    const c = Number(compra) || 0;
    const v = Number(venta) || 0;
    return v - c;
  }

  generarCodigoSKU(): void {
    const aleatorio = Math.floor(10000 + Math.random() * 90000);
    this.formulario.codigo_barras = `777${aleatorio}`;
    this.cdr.detectChanges();
  }

  abrirModalNuevo(): void {
    this.modoEdicion = false;
    this.errorModal = '';
    const primeraCat = this.categorias.find((c) => c.activo) || this.categorias[0];
    const primerProv = this.proveedores.find((p) => p.activo) || this.proveedores[0];

    this.formulario = {
      id: 0,
      codigo_barras: `777${Math.floor(10000 + Math.random() * 90000)}`,
      nombre: '',
      descripcion: '',
      categoria_id: primeraCat ? primeraCat.id : 1,
      proveedor_id: primerProv ? primerProv.id : null,
      precio_compra: 0,
      precio_venta: 0,
      stock_actual: 10,
      stock_minimo: 5,
      fecha_vencimiento: '',
      lote: 'LT-2026-01',
      tiene_paquete: false,
      nombre_paquete: 'Paquete',
      unidades_por_paquete: 1,
      precio_paquete_venta: null,
      precio_paquete_compra: null,
      codigo_barra_paquete: '',
      activo: true,
      imagen_url: null,
    };
    this.stock_paquetes_input = 0;
    this.stock_unidades_input = 10;
    this.archivoImagenSeleccionado = null;
    this.previewImagen = null;
    this.modalProductoAbierto = true;
    this.cdr.detectChanges();
  }

  abrirModalEditar(producto: any): void {
    this.modoEdicion = true;
    this.errorModal = '';
    const uPack = Number(producto.unidades_por_paquete) || 1;
    const stockTotal = Number(producto.stock_actual) || 0;

    this.formulario = {
      id: producto.id,
      codigo_barras: producto.codigo_barras || '',
      nombre: producto.nombre || '',
      descripcion: producto.descripcion || '',
      categoria_id: producto.categoria_id || producto.categoria?.id || 1,
      proveedor_id: producto.proveedor_id || producto.proveedor?.id || null,
      precio_compra: Number(producto.precio_compra) || 0,
      precio_venta: Number(producto.precio_venta) || 0,
      stock_actual: stockTotal,
      stock_minimo: Number(producto.stock_minimo) || 5,
      fecha_vencimiento: producto.fecha_vencimiento || '',
      lote: producto.lote || '',
      tiene_paquete: !!producto.tiene_paquete,
      nombre_paquete: producto.nombre_paquete || 'Paquete',
      unidades_por_paquete: uPack,
      precio_paquete_venta: producto.precio_paquete_venta ? Number(producto.precio_paquete_venta) : null,
      precio_paquete_compra: producto.precio_paquete_compra ? Number(producto.precio_paquete_compra) : null,
      codigo_barra_paquete: producto.codigo_barra_paquete || '',
      activo: producto.activo !== false,
      imagen_url: producto.imagen_url || null,
    };

    if (this.formulario.tiene_paquete && uPack > 1) {
      this.stock_paquetes_input = Math.floor(stockTotal / uPack);
      this.stock_unidades_input = stockTotal % uPack;
    } else {
      this.stock_paquetes_input = 0;
      this.stock_unidades_input = stockTotal;
    }

    this.archivoImagenSeleccionado = null;
    this.previewImagen = producto.imagen_url ? this.obtenerUrlImagen(producto.imagen_url) : null;
    this.modalProductoAbierto = true;
    this.cdr.detectChanges();
  }

  onToggleTienePaquete(): void {
    if (this.formulario.tiene_paquete) {
      if (!this.formulario.unidades_por_paquete || this.formulario.unidades_por_paquete <= 1) {
        this.formulario.unidades_por_paquete = 6;
      }
      if (!this.formulario.nombre_paquete) {
        this.formulario.nombre_paquete = 'Paquete';
      }
      this.recalcularStockDesdeDual();
    } else {
      this.stock_paquetes_input = 0;
      this.stock_unidades_input = this.formulario.stock_actual;
    }
    this.cdr.detectChanges();
  }

  recalcularStockDesdeDual(): void {
    if (this.formulario.tiene_paquete && Number(this.formulario.unidades_por_paquete) > 1) {
      const paqs = Math.max(0, Number(this.stock_paquetes_input) || 0);
      const uds = Math.max(0, Number(this.stock_unidades_input) || 0);
      const uPack = Number(this.formulario.unidades_por_paquete) || 1;
      this.formulario.stock_actual = (paqs * uPack) + uds;
    }
  }

  formatearStockDual(p: any): { paquetes: number; sueltas: number; total: number; tienePack: boolean; texto: string } {
    const stock = Number(p.stock_actual) || 0;
    const uPack = Number(p.unidades_por_paquete) || 1;
    const tienePack = !!p.tiene_paquete && uPack > 1;
    if (!tienePack) {
      return { paquetes: 0, sueltas: stock, total: stock, tienePack: false, texto: `${stock} uds.` };
    }
    const paq = Math.floor(stock / uPack);
    const sueltas = stock % uPack;
    const nomPack = p.nombre_paquete || 'Paquete';
    return {
      paquetes: paq,
      sueltas: sueltas,
      total: stock,
      tienePack: true,
      texto: `${paq} ${nomPack}(s) y ${sueltas} uds. (Total: ${stock} uds.)`,
    };
  }

  onArchivoSeleccionado(event: any): void {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.errorModal = 'Por favor selecciona un archivo de imagen válido (.jpg, .jpeg, .png, .webp).';
      this.cdr.detectChanges();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.errorModal = 'La imagen es demasiado pesada. El tamaño máximo permitido es 5 MB.';
      this.cdr.detectChanges();
      return;
    }

    this.archivoImagenSeleccionado = file;
    this.errorModal = '';

    const reader = new FileReader();
    reader.onload = () => {
      this.previewImagen = reader.result as string;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  eliminarImagen(): void {
    this.archivoImagenSeleccionado = null;
    this.previewImagen = null;
    this.formulario.imagen_url = null;
    this.cdr.detectChanges();
  }

  obtenerUrlImagen(url: string | null | undefined): string {
    return this.apiService.obtenerUrlImagen(url);
  }

  cerrarModalProducto(): void {
    if (this.guardando) return;
    this.modalProductoAbierto = false;
    this.errorModal = '';
    this.archivoImagenSeleccionado = null;
    this.previewImagen = null;
    this.cdr.detectChanges();
  }

  private finalizarGuardadoProducto(mensaje: string): void {
    this.guardando = false;
    this.modalProductoAbierto = false;
    this.archivoImagenSeleccionado = null;
    this.previewImagen = null;
    this.cargarProductos();
    this.cargarCatalogosAuxiliares();
    this.mostrarToast(mensaje, 'success');
    this.cdr.detectChanges();
  }

  guardarProducto(): void {
    this.errorModal = '';
    const codigo = (this.formulario.codigo_barras || '').trim();
    const nombre = (this.formulario.nombre || '').trim();
    const precioCompra = Number(this.formulario.precio_compra);
    const precioVenta = Number(this.formulario.precio_venta);

    if (!codigo || !nombre) {
      this.errorModal = 'El código de barras / SKU y el nombre del producto son obligatorios.';
      this.cdr.detectChanges();
      return;
    }

    if (isNaN(precioVenta) || precioVenta <= 0) {
      this.errorModal = 'El precio de venta debe ser mayor a Bs. 0.00.';
      this.cdr.detectChanges();
      return;
    }

    if (isNaN(precioCompra) || precioCompra < 0) {
      this.errorModal = 'El precio de compra no puede ser negativo.';
      this.cdr.detectChanges();
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    const payload: any = {
      codigo_barras: codigo,
      nombre: nombre,
      descripcion: this.formulario.descripcion ? this.formulario.descripcion.trim() : null,
      categoria_id: Number(this.formulario.categoria_id),
      proveedor_id: this.formulario.proveedor_id ? Number(this.formulario.proveedor_id) : null,
      precio_compra: precioCompra,
      precio_venta: precioVenta,
      stock_actual: Math.max(0, Number(this.formulario.stock_actual) || 0),
      stock_minimo: Math.max(0, Number(this.formulario.stock_minimo) || 0),
      fecha_vencimiento: this.formulario.fecha_vencimiento || null,
      lote: this.formulario.lote ? this.formulario.lote.trim() : null,
      tiene_paquete: !!this.formulario.tiene_paquete,
      nombre_paquete: this.formulario.tiene_paquete ? (this.formulario.nombre_paquete?.trim() || 'Paquete') : 'Paquete',
      unidades_por_paquete: this.formulario.tiene_paquete ? Math.max(1, Number(this.formulario.unidades_por_paquete) || 1) : 1,
      precio_paquete_venta: (this.formulario.tiene_paquete && this.formulario.precio_paquete_venta) ? Number(this.formulario.precio_paquete_venta) : null,
      precio_paquete_compra: (this.formulario.tiene_paquete && this.formulario.precio_paquete_compra) ? Number(this.formulario.precio_paquete_compra) : null,
      codigo_barra_paquete: this.formulario.tiene_paquete ? (this.formulario.codigo_barra_paquete?.trim() || null) : null,
      activo: this.formulario.activo,
      imagen_url: this.formulario.imagen_url,
    };

    if (!this.modoEdicion) {
      this.apiService.createProducto(payload).subscribe({
        next: (creado) => {
          if (this.archivoImagenSeleccionado) {
            this.apiService.subirImagenProducto(creado.id, this.archivoImagenSeleccionado).subscribe({
              next: () => {
                this.finalizarGuardadoProducto(`Producto "${creado.nombre}" registrado exitosamente con foto.`);
              },
              error: () => {
                this.finalizarGuardadoProducto(`Producto "${creado.nombre}" registrado, pero no se pudo subir la foto.`);
              },
            });
          } else {
            this.finalizarGuardadoProducto(`Producto "${creado.nombre}" registrado exitosamente en el catálogo.`);
          }
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo registrar el producto.';
          this.cdr.detectChanges();
        },
      });
    } else {
      this.apiService.updateProducto(this.formulario.id, payload).subscribe({
        next: (actualizado) => {
          if (this.archivoImagenSeleccionado) {
            this.apiService.subirImagenProducto(actualizado.id, this.archivoImagenSeleccionado).subscribe({
              next: () => {
                this.finalizarGuardadoProducto(`Producto "${actualizado.nombre}" actualizado correctamente con nueva foto.`);
              },
              error: () => {
                this.finalizarGuardadoProducto(`Producto "${actualizado.nombre}" actualizado, pero no se pudo subir la foto.`);
              },
            });
          } else {
            this.finalizarGuardadoProducto(`Producto "${actualizado.nombre}" actualizado correctamente.`);
          }
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo actualizar el producto.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  // Modal Rápido para Actualizar Precio (CU07)
  abrirModalPrecio(producto: any): void {
    this.errorModalPrecio = '';
    this.formularioPrecio = {
      id: producto.id,
      nombre: producto.nombre,
      codigo_barras: producto.codigo_barras,
      precio_compra: Number(producto.precio_compra) || 0,
      precio_venta: Number(producto.precio_venta) || 0,
    };
    this.modalPrecioAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModalPrecio(): void {
    if (this.guardando) return;
    this.modalPrecioAbierto = false;
    this.errorModalPrecio = '';
    this.cdr.detectChanges();
  }

  guardarNuevoPrecio(): void {
    this.errorModalPrecio = '';
    const compra = Number(this.formularioPrecio.precio_compra);
    const venta = Number(this.formularioPrecio.precio_venta);

    if (isNaN(venta) || venta <= 0) {
      this.errorModalPrecio = 'El precio de venta debe ser mayor a Bs. 0.00.';
      this.cdr.detectChanges();
      return;
    }

    if (isNaN(compra) || compra < 0) {
      this.errorModalPrecio = 'El precio de compra no puede ser negativo.';
      this.cdr.detectChanges();
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    this.apiService
      .updatePrecioProducto(this.formularioPrecio.id, {
        precio_compra: compra,
        precio_venta: venta,
      })
      .subscribe({
        next: (actualizado) => {
          this.guardando = false;
          this.modalPrecioAbierto = false;
          this.cargarProductos();
          this.mostrarToast(
            `Precio de "${actualizado.nombre}" actualizado a Bs. ${Number(actualizado.precio_venta).toFixed(2)}.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModalPrecio = err.error?.detail || 'No se pudo actualizar el precio.';
          this.cdr.detectChanges();
        },
      });
  }

  // Dar de baja / Reactivar producto (CU07)
  cambiarEstadoProducto(producto: any): void {
    this.apiService.toggleEstadoProducto(producto.id).subscribe({
      next: (actualizado) => {
        producto.activo = actualizado.activo;
        const accionTxt = actualizado.activo
          ? 'reactivado para la venta'
          : 'dado de baja del catálogo POS';
        this.mostrarToast(`Producto "${actualizado.nombre}" ${accionTxt}.`, 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarToast(
          err.error?.detail || 'No se pudo cambiar el estado del producto.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
  }

  limpiarFiltros(): void {
    this.filtroTexto = '';
    this.filtroCategoriaId = 0;
    this.filtroEstado = 'TODOS';
    this.cdr.detectChanges();
  }

  verificarPorCodigo(): void {
    this.errorVerificador = '';
    this.productoVerificado = null;
    const codigo = this.codigoVerificador.trim();
    if (!codigo) return;

    this.apiService.getProductoPorCodigo(codigo).subscribe({
      next: (prod) => {
        this.productoVerificado = prod;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorVerificador =
          err.error?.detail || `No se encontró ningún producto activo con el código "${codigo}".`;
        this.cdr.detectChanges();
      },
    });
  }

  limpiarVerificador(): void {
    this.codigoVerificador = '';
    this.productoVerificado = null;
    this.errorVerificador = '';
    this.cdr.detectChanges();
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error'): void {
    this.mensajeNotificacion = mensaje;
    this.tipoNotificacion = tipo;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.mensajeNotificacion = '';
      this.tipoNotificacion = '';
      this.cdr.detectChanges();
    }, 4500);
  }

  obtenerIniciales(nombre: string): string {
    if (!nombre) return 'AD';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
