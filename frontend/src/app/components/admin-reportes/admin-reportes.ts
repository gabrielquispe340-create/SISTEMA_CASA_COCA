import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-admin-reportes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-reportes.html',
  styleUrl: './admin-reportes.css',
})
export class AdminReportes implements OnInit, OnDestroy {
  usuario: any = null;
  cargando: boolean = false;

  // Pestaña activa: 'ventas' (CU28) | 'inventario' (CU29) | 'top_productos' (CU29)
  pestanaActiva: 'ventas' | 'inventario' | 'top_productos' = 'ventas';

  // Sub-vista de ventas: 'tabla' | 'empleados' | 'categorias' | 'metodos'
  subvistaVentas: 'tabla' | 'empleados' | 'categorias' | 'metodos' = 'tabla';

  // Catálogos para filtros
  usuarios: any[] = [];
  categorias: any[] = [];
  proveedores: any[] = [];
  productosCatalogo: any[] = [];

  // Suscripciones activas para evitar peticiones concurrentes colgadas
  private subVentas?: Subscription;
  private subInventario?: Subscription;
  private subTop?: Subscription;

  // ---------------------------------------------------------------------------
  // 1. REPORTE DE VENTAS (FILTRADO POR FECHA, EMPLEADO, PRODUCTO, CATEGORÍA)
  // ---------------------------------------------------------------------------
  filtroVentas = {
    fechaInicio: '',
    fechaFin: '',
    usuarioId: 0,
    categoriaId: 0,
    productoId: 0,
    metodoPago: 'TODOS',
  };
  rangoFechaSeleccionado: string = 'mes';
  reporteVentas: any = null;
  cargandoVentas: boolean = false;

  // ---------------------------------------------------------------------------
  // 2. REPORTE DE INVENTARIO VALORIZADO
  // ---------------------------------------------------------------------------
  filtroInventario = {
    categoriaId: 0,
    proveedorId: 0,
    estadoStock: 'TODOS',
    busqueda: '',
  };
  reporteInventario: any = null;
  cargandoInventario: boolean = false;

  // ---------------------------------------------------------------------------
  // 3. REPORTE DE PRODUCTOS MÁS VENDIDOS
  // ---------------------------------------------------------------------------
  filtroTop = {
    fechaInicio: '',
    fechaFin: '',
    categoriaId: 0,
    limit: 15,
  };
  topProductos: any[] = [];
  cargandoTop: boolean = false;
  maxUnidadesTop: number = 1;

  // Modal de Detalle de Venta
  modalDetalleVenta: boolean = false;
  ventaSeleccionada: any = null;

  // Toast / Feedback
  toast = {
    visible: false,
    mensaje: '',
    tipo: 'info' as 'success' | 'error' | 'info' | 'warning',
  };
  private toastTimeout: any;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.obtenerUsuario();
    if (!this.usuario || this.usuario.rol?.nombre !== 'ADMIN') {
      this.router.navigate(['/login']);
      return;
    }

    // Inicializar rango de fechas para el mes actual
    this.establecerRangoFecha('mes', false);

    // Cargar catálogos para filtros
    this.cargarCatalogos();

    // Cargar datos de la pestaña inicial (Ventas)
    this.consultarReporteVentas();
  }

  ngOnDestroy(): void {
    if (this.subVentas) {
      this.subVentas.unsubscribe();
    }
    if (this.subInventario) {
      this.subInventario.unsubscribe();
    }
    if (this.subTop) {
      this.subTop.unsubscribe();
    }
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  cargarCatalogos(): void {
    this.apiService.getUsuarios().subscribe({
      next: (data) => (this.usuarios = data || []),
      error: () => (this.usuarios = []),
    });

    this.apiService.getCategorias('', true).subscribe({
      next: (data) => (this.categorias = data || []),
      error: () => (this.categorias = []),
    });

    this.apiService.getProveedores('', true).subscribe({
      next: (data) => (this.proveedores = data || []),
      error: () => (this.proveedores = []),
    });

    this.apiService.getProductos('', undefined, true).subscribe({
      next: (data) => (this.productosCatalogo = data || []),
      error: () => (this.productosCatalogo = []),
    });
  }

  cambiarPestana(pestana: 'ventas' | 'inventario' | 'top_productos'): void {
    this.pestanaActiva = pestana;
    if (pestana === 'ventas' && !this.reporteVentas) {
      this.consultarReporteVentas();
    } else if (pestana === 'inventario' && !this.reporteInventario) {
      this.consultarReporteInventario();
    } else if (pestana === 'top_productos' && this.topProductos.length === 0) {
      this.consultarTopProductos();
    }
    this.cdr.detectChanges();
  }

  // =========================================================================
  // CONTROL DE FECHAS RÁPIDAS
  // =========================================================================
  establecerRangoFecha(tipo: string, autoConsultar: boolean = true): void {
    this.rangoFechaSeleccionado = tipo;
    const ahora = new Date();
    const formato = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (tipo === 'hoy') {
      const hoyStr = formato(ahora);
      this.filtroVentas.fechaInicio = hoyStr;
      this.filtroVentas.fechaFin = hoyStr;
      this.filtroTop.fechaInicio = hoyStr;
      this.filtroTop.fechaFin = hoyStr;
    } else if (tipo === 'ayer') {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const ayerStr = formato(ayer);
      this.filtroVentas.fechaInicio = ayerStr;
      this.filtroVentas.fechaFin = ayerStr;
      this.filtroTop.fechaInicio = ayerStr;
      this.filtroTop.fechaFin = ayerStr;
    } else if (tipo === 'semana') {
      const hace7Dias = new Date();
      hace7Dias.setDate(hace7Dias.getDate() - 7);
      this.filtroVentas.fechaInicio = formato(hace7Dias);
      this.filtroVentas.fechaFin = formato(ahora);
      this.filtroTop.fechaInicio = formato(hace7Dias);
      this.filtroTop.fechaFin = formato(ahora);
    } else if (tipo === 'mes') {
      const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      this.filtroVentas.fechaInicio = formato(primerDia);
      this.filtroVentas.fechaFin = formato(ahora);
      this.filtroTop.fechaInicio = formato(primerDia);
      this.filtroTop.fechaFin = formato(ahora);
    } else if (tipo === 'mes_anterior') {
      const primerDiaMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const ultimoDiaMesAnt = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      this.filtroVentas.fechaInicio = formato(primerDiaMesAnt);
      this.filtroVentas.fechaFin = formato(ultimoDiaMesAnt);
      this.filtroTop.fechaInicio = formato(primerDiaMesAnt);
      this.filtroTop.fechaFin = formato(ultimoDiaMesAnt);
    } else if (tipo === 'todo') {
      this.filtroVentas.fechaInicio = '';
      this.filtroVentas.fechaFin = '';
      this.filtroTop.fechaInicio = '';
      this.filtroTop.fechaFin = '';
    }

    if (autoConsultar) {
      if (this.pestanaActiva === 'ventas') this.consultarReporteVentas();
      if (this.pestanaActiva === 'top_productos') this.consultarTopProductos();
    }
  }

  // =========================================================================
  // 1. CONSULTA REPORTE DE VENTAS FILTRADAS
  // =========================================================================
  consultarReporteVentas(): void {
    if (this.subVentas) {
      this.subVentas.unsubscribe();
    }
    this.cargandoVentas = true;
    this.cdr.detectChanges();

    this.subVentas = this.apiService.getReporteVentasFiltradas(this.filtroVentas)
      .pipe(timeout(12000))
      .subscribe({
        next: (data) => {
          this.reporteVentas = data;
          this.cargandoVentas = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.cargandoVentas = false;
          const msg = err.name === 'TimeoutError'
            ? 'La consulta demoró más de lo esperado. Por favor verifica tus filtros y reintenta.'
            : (err.error?.detail || 'Error al obtener reporte de ventas.');
          this.mostrarToast(msg, 'error');
          this.cdr.detectChanges();
        },
      });
  }

  limpiarFiltrosVentas(): void {
    this.filtroVentas = {
      fechaInicio: '',
      fechaFin: '',
      usuarioId: 0,
      categoriaId: 0,
      productoId: 0,
      metodoPago: 'TODOS',
    };
    this.rangoFechaSeleccionado = 'todo';
    this.consultarReporteVentas();
  }

  verDetalleVenta(v: any): void {
    this.apiService.getVentaPorId(v.id).subscribe({
      next: (ventaCompleta) => {
        this.ventaSeleccionada = ventaCompleta;
        this.modalDetalleVenta = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.ventaSeleccionada = v;
        this.modalDetalleVenta = true;
        this.cdr.detectChanges();
      },
    });
  }

  cerrarModalDetalleVenta(): void {
    this.modalDetalleVenta = false;
    this.ventaSeleccionada = null;
    this.cdr.detectChanges();
  }

  // =========================================================================
  // 2. CONSULTA REPORTE DE INVENTARIO VALORIZADO
  // =========================================================================
  consultarReporteInventario(): void {
    if (this.subInventario) {
      this.subInventario.unsubscribe();
    }
    this.cargandoInventario = true;
    this.cdr.detectChanges();

    this.subInventario = this.apiService.getReporteInventarioValorizado(this.filtroInventario)
      .pipe(timeout(12000))
      .subscribe({
        next: (data) => {
          this.reporteInventario = data;
          this.cargandoInventario = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.cargandoInventario = false;
          const msg = err.name === 'TimeoutError'
            ? 'La consulta de inventario demoró más de lo esperado. Por favor reintenta.'
            : (err.error?.detail || 'Error al obtener reporte de inventario.');
          this.mostrarToast(msg, 'error');
          this.cdr.detectChanges();
        },
      });
  }

  limpiarFiltrosInventario(): void {
    this.filtroInventario = {
      categoriaId: 0,
      proveedorId: 0,
      estadoStock: 'TODOS',
      busqueda: '',
    };
    this.consultarReporteInventario();
  }

  // =========================================================================
  // 3. CONSULTA REPORTE DE PRODUCTOS MÁS VENDIDOS
  // =========================================================================
  consultarTopProductos(): void {
    if (this.subTop) {
      this.subTop.unsubscribe();
    }
    this.cargandoTop = true;
    this.cdr.detectChanges();

    this.subTop = this.apiService.getReporteProductosMasVendidos(this.filtroTop)
      .pipe(timeout(12000))
      .subscribe({
        next: (data) => {
          this.topProductos = data || [];
          this.maxUnidadesTop = this.topProductos.length > 0
            ? Math.max(...this.topProductos.map((p) => p.unidades_vendidas || 0), 1)
            : 1;
          this.cargandoTop = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.cargandoTop = false;
          const msg = err.name === 'TimeoutError'
            ? 'La consulta de productos líderes demoró más de lo esperado. Por favor reintenta.'
            : (err.error?.detail || 'Error al obtener productos más vendidos.');
          this.mostrarToast(msg, 'error');
          this.cdr.detectChanges();
        },
      });
  }

  limpiarFiltrosTop(): void {
    this.establecerRangoFecha('mes', false);
    this.filtroTop.categoriaId = 0;
    this.filtroTop.limit = 15;
    this.consultarTopProductos();
  }

  // =========================================================================
  // EXPORTACIÓN A CSV Y DESCARGA
  // =========================================================================
  exportarCSV(): void {
    let contenidoCSV = '';
    let nombreArchivo = '';
    const fechaHoy = new Date().toISOString().slice(0, 10);

    if (this.pestanaActiva === 'ventas') {
      if (!this.reporteVentas || !this.reporteVentas.ventas.length) {
        this.mostrarToast('No hay datos de ventas para exportar con los filtros actuales.', 'warning');
        return;
      }
      nombreArchivo = `reporte_ventas_casa_coca_${fechaHoy}.csv`;
      contenidoCSV = 'N° Comprobante,Fecha y Hora,Cajero / Empleado,Cliente,Metodo Pago,Articulos,Productos Resumen,Costo Total (Bs.),Total Recaudado (Bs.),Ganancia Neta (Bs.)\r\n';
      for (const v of this.reporteVentas.ventas) {
        const fila = [
          `"${v.numero_comprobante}"`,
          `"${v.fecha_venta}"`,
          `"${v.cajero_nombre}"`,
          `"${v.cliente_nombre}"`,
          `"${v.metodo_pago}"`,
          v.cantidad_articulos,
          `"${(v.items_resumen || '').replace(/"/g, '""')}"`,
          Number(v.costo_total).toFixed(2),
          Number(v.total).toFixed(2),
          Number(v.ganancia).toFixed(2),
        ].join(',');
        contenidoCSV += fila + '\r\n';
      }
    } else if (this.pestanaActiva === 'inventario') {
      if (!this.reporteInventario || !this.reporteInventario.items.length) {
        this.mostrarToast('No hay datos de inventario para exportar.', 'warning');
        return;
      }
      nombreArchivo = `reporte_inventario_valorizado_casa_coca_${fechaHoy}.csv`;
      contenidoCSV = 'Código,Producto,Categoría,Proveedor,Stock Actual,Stock Mínimo,Precio Costo (Bs.),Precio Venta (Bs.),Valor en Costo (Bs.),Valor en Venta (Bs.),Estado Stock\r\n';
      for (const item of this.reporteInventario.items) {
        const fila = [
          `"${item.codigo_barras}"`,
          `"${(item.nombre || '').replace(/"/g, '""')}"`,
          `"${item.categoria_nombre}"`,
          `"${item.proveedor_nombre}"`,
          item.stock_actual,
          item.stock_minimo,
          Number(item.precio_compra).toFixed(2),
          Number(item.precio_venta).toFixed(2),
          Number(item.valor_costo_linea).toFixed(2),
          Number(item.valor_venta_linea).toFixed(2),
          `"${item.estado_stock}"`,
        ].join(',');
        contenidoCSV += fila + '\r\n';
      }
    } else if (this.pestanaActiva === 'top_productos') {
      if (!this.topProductos.length) {
        this.mostrarToast('No hay datos de productos más vendidos para exportar.', 'warning');
        return;
      }
      nombreArchivo = `reporte_productos_mas_vendidos_casa_coca_${fechaHoy}.csv`;
      contenidoCSV = 'Ranking,Código,Producto,Categoría,Unidades Vendidas,Ingresos Generados (Bs.),Ganancia Generada (Bs.),Stock Restante\r\n';
      for (const p of this.topProductos) {
        const fila = [
          p.ranking,
          `"${p.codigo_barras}"`,
          `"${(p.nombre || '').replace(/"/g, '""')}"`,
          `"${p.categoria_nombre}"`,
          p.unidades_vendidas,
          Number(p.ingresos_generados).toFixed(2),
          Number(p.ganancia_generada).toFixed(2),
          p.stock_actual,
        ].join(',');
        contenidoCSV += fila + '\r\n';
      }
    }

    // Descarga automática con BOM UTF-8 para soporte con tildes y caracteres especiales en Excel
    const blob = new Blob(['\uFEFF' + contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', nombreArchivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.mostrarToast(`¡Archivo ${nombreArchivo} exportado exitosamente!`, 'success');
  }

  imprimirReporte(): void {
    window.print();
  }

  // =========================================================================
  // AUXILIARES
  // =========================================================================
  obtenerIniciales(): string {
    if (!this.usuario || !this.usuario.nombre_completo) return 'AD';
    const partes = this.usuario.nombre_completo.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }

  mostrarToast(
    mensaje: string,
    tipo: 'success' | 'error' | 'info' | 'warning' = 'info'
  ): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toast = { visible: true, mensaje, tipo };
    this.cdr.detectChanges();
    this.toastTimeout = setTimeout(() => {
      this.toast.visible = false;
      this.cdr.detectChanges();
    }, 3800);
  }

  cerrarToast(): void {
    this.toast.visible = false;
    this.cdr.detectChanges();
  }
}
