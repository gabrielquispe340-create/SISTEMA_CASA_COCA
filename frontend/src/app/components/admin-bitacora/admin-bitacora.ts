import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-bitacora',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-bitacora.html',
  styleUrl: './admin-bitacora.css',
})
export class AdminBitacora implements OnInit {
  usuarioSesion: any = null;
  eventos: any[] = [];
  cargando = false;

  resumen = {
    total_eventos: 0,
    eventos_hoy: 0,
    accesos_exitosos: 0,
    alertas_criticas: 0,
  };

  // Filtros de búsqueda CU05
  filtroBuscar = '';
  filtroModulo = 'TODOS';
  filtroNivel = 'TODOS';
  filtroFechaInicio = '';
  filtroFechaFin = '';

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
    this.cargarTodo();
  }

  cargarTodo(): void {
    this.cargarResumen();
    this.consultarBitacora();
  }

  cargarResumen(): void {
    this.apiService.getResumenBitacora().subscribe({
      next: (data) => {
        if (data) {
          this.resumen = data;
          this.cdr.detectChanges();
        }
      },
    });
  }

  consultarBitacora(): void {
    this.cargando = true;
    this.apiService
      .getBitacora({
        buscar: this.filtroBuscar.trim(),
        modulo: this.filtroModulo,
        nivel: this.filtroNivel,
        fecha_inicio: this.filtroFechaInicio,
        fecha_fin: this.filtroFechaFin,
      })
      .subscribe({
        next: (lista) => {
          this.eventos = lista || [];
          this.cargando = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.cargando = false;
          this.cdr.detectChanges();
        },
      });
  }

  limpiarFiltros(): void {
    this.filtroBuscar = '';
    this.filtroModulo = 'TODOS';
    this.filtroNivel = 'TODOS';
    this.filtroFechaInicio = '';
    this.filtroFechaFin = '';
    this.consultarBitacora();
  }

  exportarCSV(): void {
    if (!this.eventos.length) return;

    const cabeceras = [
      'ID',
      'Fecha_Hora',
      'Usuario',
      'Username',
      'Rol',
      'Modulo',
      'Accion',
      'Nivel',
      'IP_Origen',
      'Descripcion',
    ];

    const filas = this.eventos.map((ev) => [
      ev.id,
      new Date(ev.fecha_registro).toLocaleString('es-ES'),
      `"${(ev.usuario?.nombre_completo || 'Sistema').replace(/"/g, '""')}"`,
      ev.usuario?.username || '-',
      ev.usuario?.rol?.nombre || '-',
      ev.modulo,
      ev.accion,
      ev.nivel,
      ev.ip_origen || '127.0.0.1',
      `"${(ev.descripcion || '').replace(/"/g, '""')}"`,
    ]);

    const contenidoCSV =
      '\uFEFF' + [cabeceras.join(','), ...filas.map((f) => f.join(','))].join('\n');

    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bitacora_actividades_tienda_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  obtenerIniciales(nombre: string): string {
    if (!nombre) return 'S';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.charAt(0).toUpperCase();
  }

  etiquetaNivel(nivel: string): string {
    switch ((nivel || '').toUpperCase()) {
      case 'SUCCESS':
        return 'ÉXITO';
      case 'WARNING':
        return 'ALERTA';
      case 'CRITICAL':
        return 'CRÍTICO';
      default:
        return 'INFO';
    }
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
