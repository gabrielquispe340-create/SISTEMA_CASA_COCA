import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-usuarios.html',
  styleUrl: './admin-usuarios.css',
})
export class AdminUsuarios implements OnInit {
  usuarioSesion: any = null;
  usuarios: any[] = [];
  roles: any[] = [];
  cargando = false;
  guardando = false;

  // Filtros de búsqueda
  filtroTexto = '';
  filtroRol = 'TODOS';
  filtroEstado = 'TODOS';

  // Notificación visual
  mensajeNotificacion = '';
  tipoNotificacion: 'success' | 'error' | '' = '';

  // Estado del Modal (Crear / Editar)
  modalAbierto = false;
  modoEdicion = false;
  mostrarPassword = false;
  errorModal = '';

  formulario = {
    id: 0,
    nombre_completo: '',
    username: '',
    email: '',
    rol_id: 0,
    password: '',
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
    this.cargarRoles();
    this.cargarUsuarios();
  }

  cargarRoles(): void {
    this.apiService.getRoles().subscribe({
      next: (lista) => {
        this.roles = lista || [];
        this.cdr.detectChanges();
      },
    });
  }

  cargarUsuarios(): void {
    this.cargando = true;
    this.apiService.getUsuarios().subscribe({
      next: (lista) => {
        this.usuarios = lista || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.mostrarToast('No se pudo cargar la lista de empleados.', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // Lista filtrada en tiempo real para la tabla
  get usuariosFiltrados(): any[] {
    return this.usuarios.filter((u) => {
      const texto = this.filtroTexto.trim().toLowerCase();
      const coincideTexto =
        !texto ||
        (u.nombre_completo && u.nombre_completo.toLowerCase().includes(texto)) ||
        (u.username && u.username.toLowerCase().includes(texto)) ||
        (u.email && u.email.toLowerCase().includes(texto));

      const coincideRol =
        this.filtroRol === 'TODOS' || u.rol?.nombre?.toUpperCase() === this.filtroRol;

      const coincideEstado =
        this.filtroEstado === 'TODOS' ||
        (this.filtroEstado === 'ACTIVOS' && u.activo === true) ||
        (this.filtroEstado === 'INACTIVOS' && u.activo === false);

      return coincideTexto && coincideRol && coincideEstado;
    });
  }

  // KPIs calculados
  get totalActivos(): number {
    return this.usuarios.filter((u) => u.activo).length;
  }

  get totalInactivos(): number {
    return this.usuarios.filter((u) => !u.activo).length;
  }

  get totalEmpleados(): number {
    return this.usuarios.filter((u) => u.rol?.nombre === 'EMPLEADO').length;
  }

  get totalAdmins(): number {
    return this.usuarios.filter((u) => u.rol?.nombre === 'ADMIN').length;
  }

  abrirModalNuevo(): void {
    this.modoEdicion = false;
    this.errorModal = '';
    this.mostrarPassword = false;

    const rolEmpleado = this.roles.find((r) => r.nombre === 'EMPLEADO') || this.roles[0];

    this.formulario = {
      id: 0,
      nombre_completo: '',
      username: '',
      email: '',
      rol_id: rolEmpleado ? rolEmpleado.id : 2,
      password: '',
      activo: true,
    };
    this.modalAbierto = true;
  }

  abrirModalEditar(usuario: any): void {
    this.modoEdicion = true;
    this.errorModal = '';
    this.mostrarPassword = false;

    this.formulario = {
      id: usuario.id,
      nombre_completo: usuario.nombre_completo || '',
      username: usuario.username || '',
      email: usuario.email || '',
      rol_id: usuario.rol?.id || usuario.rol_id,
      password: '',
      activo: usuario.activo,
    };
    this.modalAbierto = true;
  }

  cerrarModal(): void {
    if (this.guardando) return;
    this.modalAbierto = false;
    this.errorModal = '';
  }

  guardarUsuario(): void {
    this.errorModal = '';

    const nombre = this.formulario.nombre_completo.trim();
    const username = this.formulario.username.trim();
    const email = this.formulario.email ? this.formulario.email.trim() : '';

    if (!nombre || !username) {
      this.errorModal = 'Por favor completa el nombre completo y el usuario de acceso.';
      return;
    }

    if (!this.modoEdicion && this.formulario.password.trim().length < 6) {
      this.errorModal = 'La contraseña inicial debe tener al menos 6 caracteres.';
      return;
    }

    if (
      this.modoEdicion &&
      this.formulario.password.trim().length > 0 &&
      this.formulario.password.trim().length < 6
    ) {
      this.errorModal = 'Si deseas cambiar la contraseña, debe tener al menos 6 caracteres.';
      return;
    }

    this.guardando = true;

    if (!this.modoEdicion) {
      const payload = {
        nombre_completo: nombre,
        username: username,
        email: email || null,
        rol_id: Number(this.formulario.rol_id),
        password: this.formulario.password.trim(),
        activo: this.formulario.activo,
      };

      this.apiService.createUsuario(payload).subscribe({
        next: (creado) => {
          this.guardando = false;
          this.modalAbierto = false;
          this.cargarUsuarios();
          this.mostrarToast(
            `Empleado "${creado.nombre_completo}" registrado correctamente.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo registrar el usuario.';
          this.cdr.detectChanges();
        },
      });
    } else {
      const payload: any = {
        nombre_completo: nombre,
        username: username,
        email: email || '',
        rol_id: Number(this.formulario.rol_id),
        activo: this.formulario.activo,
      };
      if (this.formulario.password.trim()) {
        payload.password = this.formulario.password.trim();
      }

      this.apiService.updateUsuario(this.formulario.id, payload).subscribe({
        next: (actualizado) => {
          this.guardando = false;
          this.modalAbierto = false;
          this.cargarUsuarios();
          this.mostrarToast(
            `Datos de "${actualizado.nombre_completo}" actualizados con éxito.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo actualizar el usuario.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  cambiarEstadoActivo(usuario: any): void {
    if (usuario.id === this.usuarioSesion?.id && usuario.activo) {
      this.mostrarToast(
        'Por seguridad no puedes desactivar tu propia cuenta de Administrador en sesión.',
        'error',
      );
      return;
    }

    this.apiService.toggleEstadoUsuario(usuario.id).subscribe({
      next: (actualizado) => {
        usuario.activo = actualizado.activo;
        const accion = actualizado.activo ? 'activada' : 'desactivada';
        this.mostrarToast(
          `Cuenta de "${actualizado.nombre_completo}" ${accion} correctamente.`,
          'success',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarToast(
          err.error?.detail || 'No se pudo cambiar el estado del usuario.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
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
    if (!nombre) return 'U';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.charAt(0).toUpperCase();
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
