import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit, OnDestroy {
  credenciales = {
    username: 'empleado',
    password: 'empleado123',
  };

  recordarUsuario = true;
  mostrarPassword = false;
  cargando = false;
  mensajeAlerta = '';
  tipoAlerta: 'error' | 'success' | '' = '';
  rolSeleccionadoRapido: 'empleado' | 'admin' | '' = 'empleado';

  estadoServidor: 'online' | 'offline' | 'checking' = 'checking';
  textoEstadoServidor = 'Verificando conexión...';
  relojActual = '--:--:--';

  private relojInterval: any;
  private healthInterval: any;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Al acceder a la pantalla de login se limpia cualquier sesión previa
    this.authService.cerrarSesion();

    const recordado = this.authService.obtenerUsuarioRecordado();
    if (recordado && recordado.toLowerCase() === 'admin') {
      // Si el usuario guardado es admin, solo cargar el nombre, NUNCA la contraseña
      this.credenciales.username = 'admin';
      this.credenciales.password = '';
      this.rolSeleccionadoRapido = 'admin';
      this.recordarUsuario = true;
    } else {
      // Por defecto: Empleado con usuario y contraseña automáticos para atención rápida
      this.seleccionarRol('empleado');
    }

    this.actualizarReloj();
    this.relojInterval = setInterval(() => {
      this.actualizarReloj();
      this.cdr.detectChanges();
    }, 1000);

    this.comprobarConexionAPI();
    this.healthInterval = setInterval(() => this.comprobarConexionAPI(), 15000);
  }

  ngOnDestroy(): void {
    if (this.relojInterval) clearInterval(this.relojInterval);
    if (this.healthInterval) clearInterval(this.healthInterval);
  }

  actualizarReloj(): void {
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const hora = ahora.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.relojActual = `${fecha} • ${hora}`;
  }

  comprobarConexionAPI(): void {
    this.authService.verificarEstadoServidor().subscribe({
      next: () => {
        this.estadoServidor = 'online';
        this.textoEstadoServidor = 'Conectado a Supabase Cloud';
        this.cdr.detectChanges();
      },
      error: () => {
        this.estadoServidor = 'offline';
        this.textoEstadoServidor = 'API Python desconectada (puerto 8000)';
        this.cdr.detectChanges();
      },
    });
  }

  seleccionarRol(rol: 'empleado' | 'admin'): void {
    this.rolSeleccionadoRapido = rol;
    this.mensajeAlerta = '';
    this.tipoAlerta = '';

    if (rol === 'admin') {
      this.credenciales.username = 'admin';
      // SEGURIDAD: Nunca autocompletar la contraseña del Administrador
      this.credenciales.password = '';
    } else {
      // Empleado con credenciales automáticas para agilidad en caja
      this.credenciales.username = 'empleado';
      this.credenciales.password = 'empleado123';
    }
    this.cdr.detectChanges();
  }

  autocompletarRol(rol: 'empleado' | 'admin'): void {
    this.seleccionarRol(rol);
  }

  onUsernameChange(): void {
    const usr = (this.credenciales.username || '').trim().toLowerCase();
    if (usr === 'admin') {
      this.rolSeleccionadoRapido = 'admin';
      // Seguridad: limpiar inmediatamente si venía con la clave del empleado
      if (this.credenciales.password === 'empleado123') {
        this.credenciales.password = '';
      }
    } else if (usr === 'empleado') {
      this.rolSeleccionadoRapido = 'empleado';
      if (!this.credenciales.password) {
        this.credenciales.password = 'empleado123';
      }
    } else {
      this.rolSeleccionadoRapido = '';
    }
  }

  alternarPassword(): void {
    this.mostrarPassword = !this.mostrarPassword;
  }

  iniciarSesion(): void {
    this.mensajeAlerta = '';
    this.tipoAlerta = '';

    const username = this.credenciales.username.trim();
    const password = this.credenciales.password;

    if (!username || !password) {
      this.tipoAlerta = 'error';
      this.mensajeAlerta = 'Por favor ingresa tu nombre de usuario y contraseña.';
      return;
    }

    this.cargando = true;

    this.authService.login(username, password).subscribe({
      next: (respuesta: any) => {
        if (this.recordarUsuario) {
          this.authService.guardarUsuarioRecordado(username);
        } else {
          this.authService.limpiarUsuarioRecordado();
        }

        this.authService.guardarSesion(respuesta.access_token, respuesta.usuario);
        const nombreRol = respuesta.usuario?.rol?.nombre || 'EMPLEADO';

        this.tipoAlerta = 'success';
        this.mensajeAlerta = `¡Bienvenido, ${respuesta.usuario.nombre_completo}! Ingresando como ${nombreRol}...`;
        this.cdr.detectChanges();

        setTimeout(() => {
          this.redirigirPorRol(nombreRol);
        }, 600);
      },
      error: (err) => {
        this.cargando = false;
        this.tipoAlerta = 'error';
        if (err.status === 0) {
          this.mensajeAlerta =
            'No se pudo conectar con la API en http://127.0.0.1:8000. Verifica que el backend de Python esté encendido.';
        } else {
          this.mensajeAlerta = err.error?.detail || 'Usuario o contraseña incorrectos.';
        }
        this.cdr.detectChanges();
      },
    });
  }

  private redirigirPorRol(rol: string): void {
    const r = rol.toUpperCase();
    if (r === 'ADMIN' || r === 'ADMINISTRADOR') {
      this.router.navigate(['/admin/dashboard']);
    } else {
      this.router.navigate(['/empleado/dashboard']);
    }
  }
}
