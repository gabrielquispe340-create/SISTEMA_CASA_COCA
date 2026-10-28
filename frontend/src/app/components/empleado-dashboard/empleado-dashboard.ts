import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-empleado-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './empleado-dashboard.html',
  styleUrl: './empleado-dashboard.css',
})
export class EmpleadoDashboard implements OnInit {
  usuario: any = null;
  cajaActual: any = null;
  misVentas: any[] = [];
  productosCatalogo: any[] = [];

  totalRecaudadoTurno = '0.00';
  totalProductosActivos = 0;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.obtenerUsuario();
    if (!this.usuario) {
      this.router.navigate(['/login']);
      return;
    }
    this.cargarDatosOperativos();
  }

  cargarDatosOperativos(): void {
    this.apiService.getCajaActual().subscribe({
      next: (sesion) => {
        this.cajaActual = sesion;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cajaActual = null;
        this.cdr.detectChanges();
      },
    });

    this.apiService.getVentas().subscribe({
      next: (ventas) => {
        this.misVentas = (ventas || []).slice(0, 6);
        const suma = (ventas || [])
          .filter((v: any) => v.estado === 'COMPLETADA')
          .reduce((acc: number, item: any) => acc + parseFloat(item.total || '0'), 0);
        this.totalRecaudadoTurno = suma.toFixed(2);
        this.cdr.detectChanges();
      },
    });

    this.apiService.getProductos().subscribe({
      next: (productos) => {
        this.productosCatalogo = (productos || []).slice(0, 6);
        this.totalProductosActivos = (productos || []).length;
        this.cdr.detectChanges();
      },
    });
  }

  obtenerIniciales(): string {
    if (!this.usuario?.nombre_completo) return 'E';
    return this.usuario.nombre_completo.charAt(0).toUpperCase();
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
