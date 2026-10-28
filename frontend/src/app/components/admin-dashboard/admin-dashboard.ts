import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit {
  usuario: any = null;
  cargando = true;

  resumen = {
    cantidad_ventas: 0,
    ingresos_totales: '0.00',
    costo_mercaderia_vendida: '0.00',
    ganancia_neta_estimada: '0.00',
    ticket_promedio: '0.00',
    productos_con_stock_bajo: 0,
  };

  productosStockCritico: any[] = [];
  ultimasVentas: any[] = [];
  topProductos: any[] = [];

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
    this.cargarDatosDashboard();
  }

  cargarDatosDashboard(): void {
    this.cargando = true;

    this.apiService.getReporteDashboard().subscribe({
      next: (data) => {
        if (data?.resumen) {
          this.resumen = data.resumen;
        }
        this.topProductos = data?.top_productos || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });

    this.apiService.getStockCritico().subscribe({
      next: (productos) => {
        this.productosStockCritico = productos || [];
        this.cdr.detectChanges();
      },
    });

    this.apiService.getVentas().subscribe({
      next: (ventas) => {
        this.ultimasVentas = (ventas || []).slice(0, 6);
        this.cdr.detectChanges();
      },
    });
  }

  obtenerIniciales(): string {
    if (!this.usuario?.nombre_completo) return 'A';
    return this.usuario.nombre_completo.charAt(0).toUpperCase();
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
