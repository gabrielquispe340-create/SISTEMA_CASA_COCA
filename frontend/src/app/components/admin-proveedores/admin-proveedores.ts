import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-proveedores.html',
  styleUrl: './admin-proveedores.css',
})
export class AdminProveedores implements OnInit {
  usuarioSesion: any = null;
  proveedores: any[] = [];
  cargando = false;
  guardando = false;

  // Filtros en tiempo real
  filtroTexto = '';
  filtroEstado: 'TODOS' | 'ACTIVOS' | 'INACTIVOS' = 'TODOS';

  // Notificación visual (Toast)
  mensajeNotificacion = '';
  tipoNotificacion: 'success' | 'error' | '' = '';

  // Modal Registrar / Editar Proveedor
  modalAbierto = false;
  modoEdicion = false;
  errorModal = '';

  formulario = {
    id: 0,
    nombre_empresa: '',
    contacto_nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    activo: true,
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
    this.cargarProveedores();
  }

  cargarProveedores(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.apiService.getProveedores().subscribe({
      next: (lista) => {
        this.proveedores = lista || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.mostrarToast('No se pudo cargar el directorio de proveedores.', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  get proveedoresFiltrados(): any[] {
    return this.proveedores.filter((p) => {
      const texto = this.filtroTexto.trim().toLowerCase();
      const coincideTexto =
        !texto ||
        (p.nombre_empresa && p.nombre_empresa.toLowerCase().includes(texto)) ||
        (p.contacto_nombre && p.contacto_nombre.toLowerCase().includes(texto)) ||
        (p.telefono && p.telefono.toLowerCase().includes(texto)) ||
        (p.email && p.email.toLowerCase().includes(texto)) ||
        (p.direccion && p.direccion.toLowerCase().includes(texto));

      const coincideEstado =
        this.filtroEstado === 'TODOS' ||
        (this.filtroEstado === 'ACTIVOS' && p.activo === true) ||
        (this.filtroEstado === 'INACTIVOS' && p.activo === false);

      return coincideTexto && coincideEstado;
    });
  }

  // KPIs calculados
  get totalProveedores(): number {
    return this.proveedores.length;
  }

  get totalActivos(): number {
    return this.proveedores.filter((p) => p.activo).length;
  }

  get totalInactivos(): number {
    return this.proveedores.filter((p) => !p.activo).length;
  }

  get totalProductosAbastecidos(): number {
    return this.proveedores.reduce(
      (acc, p) => acc + (Number(p.cantidad_productos) || 0),
      0,
    );
  }

  abrirModalNuevo(): void {
    this.modoEdicion = false;
    this.errorModal = '';
    this.formulario = {
      id: 0,
      nombre_empresa: '',
      contacto_nombre: '',
      telefono: '',
      email: '',
      direccion: '',
      activo: true,
    };
    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  abrirModalEditar(proveedor: any): void {
    this.modoEdicion = true;
    this.errorModal = '';
    this.formulario = {
      id: proveedor.id,
      nombre_empresa: proveedor.nombre_empresa || '',
      contacto_nombre: proveedor.contacto_nombre || '',
      telefono: proveedor.telefono || '',
      email: proveedor.email || '',
      direccion: proveedor.direccion || '',
      activo: proveedor.activo !== false,
    };
    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModal(): void {
    if (this.guardando) return;
    this.modalAbierto = false;
    this.errorModal = '';
    this.cdr.detectChanges();
  }

  guardarProveedor(): void {
    this.errorModal = '';
    const empresa = (this.formulario.nombre_empresa || '').trim();
    if (!empresa) {
      this.errorModal = 'El nombre de la empresa proveedora es obligatorio.';
      this.cdr.detectChanges();
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    const payload = {
      nombre_empresa: empresa,
      contacto_nombre: this.formulario.contacto_nombre
        ? this.formulario.contacto_nombre.trim()
        : null,
      telefono: this.formulario.telefono ? this.formulario.telefono.trim() : null,
      email: this.formulario.email ? this.formulario.email.trim() : null,
      direccion: this.formulario.direccion ? this.formulario.direccion.trim() : null,
      activo: this.formulario.activo,
    };

    if (!this.modoEdicion) {
      this.apiService.createProveedor(payload).subscribe({
        next: (creado) => {
          this.guardando = false;
          this.modalAbierto = false;
          this.cargarProveedores();
          this.mostrarToast(
            `Proveedor "${creado.nombre_empresa}" registrado exitosamente.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo registrar el proveedor.';
          this.cdr.detectChanges();
        },
      });
    } else {
      this.apiService.updateProveedor(this.formulario.id, payload).subscribe({
        next: (actualizado) => {
          this.guardando = false;
          this.modalAbierto = false;
          this.cargarProveedores();
          this.mostrarToast(
            `Datos del proveedor "${actualizado.nombre_empresa}" actualizados.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo actualizar el proveedor.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  cambiarEstadoProveedor(proveedor: any): void {
    this.apiService.toggleEstadoProveedor(proveedor.id).subscribe({
      next: (actualizado) => {
        proveedor.activo = actualizado.activo;
        const estadoTxt = actualizado.activo ? 'activado' : 'desactivado';
        this.mostrarToast(
          `Proveedor "${actualizado.nombre_empresa}" ${estadoTxt} correctamente.`,
          'success',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarToast(
          err.error?.detail || 'No se pudo cambiar el estado del proveedor.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
  }

  eliminarProveedor(proveedor: any): void {
    const totalProd = Number(proveedor.cantidad_productos) || 0;
    const totalComp = Number(proveedor.cantidad_compras) || 0;
    if (totalProd > 0 || totalComp > 0) {
      this.mostrarToast(
        `El proveedor "${proveedor.nombre_empresa}" tiene ${totalProd} producto(s) y ${totalComp} compra(s) asociadas. Desactívalo en lugar de eliminarlo.`,
        'error',
      );
      return;
    }

    this.apiService.deleteProveedor(proveedor.id).subscribe({
      next: () => {
        this.cargarProveedores();
        this.mostrarToast(
          `Proveedor "${proveedor.nombre_empresa}" eliminado del sistema.`,
          'success',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarToast(
          err.error?.detail || 'No se pudo eliminar el proveedor.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
  }

  limpiarFiltros(): void {
    this.filtroTexto = '';
    this.filtroEstado = 'TODOS';
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
    if (!nombre) return 'PR';
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
