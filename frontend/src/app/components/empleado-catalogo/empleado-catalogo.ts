import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-empleado-catalogo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './empleado-catalogo.html',
  styleUrl: './empleado-catalogo.css',
})
export class EmpleadoCatalogo implements OnInit {
  usuario: any = null;
  productos: any[] = [];
  categorias: any[] = [];
  cargando = false;

  // Filtros de consulta de catálogo (CU08) y stock disponible (CU09)
  filtroTexto = '';
  categoriaSeleccionadaId = 0;
  filtroDisponibilidad: 'TODOS' | 'DISPONIBLES' | 'ULTIMAS_UNIDADES' | 'AGOTADOS' = 'TODOS';
  modoVista: 'TARJETAS' | 'TABLA' | 'STOCK' = 'TARJETAS';

  resumenStock: any = {
    total_unidades_disponibles: 0,
    productos_optimos: 0,
    productos_stock_bajo: 0,
    productos_agotados: 0,
    items: [],
  };

  // Verificador rápido por Código de Barras / SKU
  codigoVerificador = '';
  productoVerificado: any = null;
  errorVerificador = '';

  // Modal de detalle de producto
  productoDetalle: any = null;

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
    this.cargarCategorias();
    this.cargarCatalogo();
  }

  cargarCategorias(): void {
    this.apiService.getCategorias('', true).subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.cdr.detectChanges();
      },
    });
  }

  cargarCatalogo(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.apiService.getProductos('', undefined, true).subscribe({
      next: (lista) => {
        this.productos = lista || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });

    this.apiService.getStockDisponible({ solo_activos: true }).subscribe({
      next: (res) => {
        this.resumenStock = res || this.resumenStock;
        this.cdr.detectChanges();
      },
    });
  }

  calcularPorcentajeStock(stockActual: any, stockMinimo: any): number {
    const act = Number(stockActual) || 0;
    const min = Math.max(1, Number(stockMinimo) || 5);
    if (act <= 0) return 0;
    if (act <= min) return Math.min(95, Math.max(15, Math.round((act / (min * 2)) * 100)));
    return Math.min(100, Math.max(55, Math.round((act / (min * 3)) * 100)));
  }

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
        this.categoriaSeleccionadaId === 0 ||
        Number(p.categoria_id) === Number(this.categoriaSeleccionadaId);

      let coincideStock = true;
      const stock = Number(p.stock_actual) || 0;
      const min = Number(p.stock_minimo) || 5;

      if (this.filtroDisponibilidad === 'DISPONIBLES') {
        coincideStock = stock > 0;
      } else if (this.filtroDisponibilidad === 'ULTIMAS_UNIDADES') {
        coincideStock = stock > 0 && stock <= min;
      } else if (this.filtroDisponibilidad === 'AGOTADOS') {
        coincideStock = stock <= 0;
      }

      return coincideTexto && coincideCategoria && coincideStock;
    });
  }

  // KPIs de consulta rápida
  get totalCatalogoActivo(): number {
    return this.productos.length;
  }

  get totalConStock(): number {
    return this.productos.filter((p) => (Number(p.stock_actual) || 0) > 0).length;
  }

  get totalUltimasUnidades(): number {
    return this.productos.filter((p) => {
      const s = Number(p.stock_actual) || 0;
      const m = Number(p.stock_minimo) || 5;
      return s > 0 && s <= m;
    }).length;
  }

  seleccionarCategoria(id: number): void {
    this.categoriaSeleccionadaId = id;
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

  abrirDetalleProducto(prod: any): void {
    this.productoDetalle = prod;
    this.cdr.detectChanges();
  }

  cerrarDetalleProducto(): void {
    this.productoDetalle = null;
    this.cdr.detectChanges();
  }

  limpiarFiltros(): void {
    this.filtroTexto = '';
    this.categoriaSeleccionadaId = 0;
    this.filtroDisponibilidad = 'TODOS';
    this.cdr.detectChanges();
  }

  obtenerColorRubro(nombreCategoria: string): string {
    const n = (nombreCategoria || '').toLowerCase();
    if (n.includes('cerveza')) return 'rubro-amber';
    if (n.includes('vino')) return 'rubro-rose';
    if (n.includes('licor')) return 'rubro-purple';
    if (n.includes('gaseosa')) return 'rubro-blue';
    if (n.includes('jugo') || n.includes('agua')) return 'rubro-emerald';
    if (n.includes('snack')) return 'rubro-orange';
    return 'rubro-slate';
  }

  obtenerIniciales(): string {
    const nombre = this.usuario?.nombre_completo || 'Empleado';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
  }

  obtenerUrlImagen(url: string | null | undefined): string {
    return this.apiService.obtenerUrlImagen(url);
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
