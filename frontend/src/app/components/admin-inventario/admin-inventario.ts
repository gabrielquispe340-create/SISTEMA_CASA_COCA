import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

interface LineaCompraForm {
  categoria_id: number;
  producto_id: number;
  producto_nombre: string;
  codigo_barras: string;
  stock_actual: number;

  // Empaque y unidades por paquete / bulto
  modo_empaque: 'UNIDAD' | 'PACK_6' | 'CAJA_12' | 'FARDO_24' | 'PERSONALIZADO';
  cantidad_paquetes: number;
  unidades_por_paquete: number;
  cantidad: number; // Total unidades = cantidad_paquetes * unidades_por_paquete

  costo_paquete: number;
  costo_unitario_compra: number;
  subtotal: number;

  nuevo_precio_venta: number | null;
  fecha_vencimiento: string;
  lote: string;
}

@Component({
  selector: 'app-admin-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-inventario.html',
  styleUrl: './admin-inventario.css',
})
export class AdminInventario implements OnInit {
  usuarioSesion: any = null;

  // CU13: Compras de Mercadería (Ingreso a Inventario)
  compras: any[] = [];
  proveedores: any[] = [];
  cargandoCompras = false;
  filtroComprasTexto = '';
  filtroComprasEstado: 'TODOS' | 'RECIBIDA' | 'ANULADA' = 'TODOS';
  filtroComprasProveedor: number | 'TODOS' = 'TODOS';
  filtroComprasFechaDesde = '';
  filtroComprasFechaHasta = '';

  // Modal Registrar Compra (CU13)
  modalCompraAbierto = false;
  errorModalCompra = '';
  formularioCompra = {
    proveedor_id: null as number | null,
    numero_factura_proveedor: '',
    observaciones: '',
    fecha_compra: '',
    items: [] as LineaCompraForm[],
  };

  // Modal Ver Detalle / Comprobante de Compra
  modalDetalleCompraAbierto = false;
  compraSeleccionada: any = null;

  // Datos de Stock Disponible (CU09)
  resumenStock: any = {
    total_productos: 0,
    total_unidades_disponibles: 0,
    productos_optimos: 0,
    productos_stock_bajo: 0,
    productos_agotados: 0,
    valor_total_costo: 0,
    valor_total_venta: 0,
    items: [],
  };

  // Datos de Alertas de Stock Mínimo y Vencimiento (CU11)
  resumenAlertas: any = {
    fecha_generacion: null,
    dias_umbral_vencimiento: 30,
    total_alertas_activas: 0,
    total_agotados: 0,
    total_stock_critico: 0,
    total_vencidos: 0,
    total_proximos_vencer: 0,
    costo_total_reposicion: 0,
    valor_total_riesgo_vencimiento: 0,
    alertas_stock: [],
    alertas_vencimiento: [],
  };

  diasUmbralVencimiento = 30;
  incluirVigentes = true;

  categorias: any[] = [];
  movimientosKardex: any[] = [];

  cargando = false;
  cargandoAlertas = false;
  guardando = false;

  // Pestaña activa: 'COMPRAS' (CU13) | 'ALERTAS' (CU11) | 'STOCK' (CU09) | 'KARDEX'
  pestanaActiva: 'COMPRAS' | 'ALERTAS' | 'STOCK' | 'KARDEX' = 'COMPRAS';

  // Filtros en tiempo real (CU09)
  filtroTexto = '';
  filtroCategoriaId = 0;
  filtroNivel: 'TODOS' | 'OPTIMO' | 'BAJO' | 'AGOTADO' = 'TODOS';
  productoKardexFiltroId = 0;

  // Toast
  mensajeNotificacion = '';
  tipoNotificacion: 'success' | 'error' | '' = '';

  // Modal de Ajuste de Stock
  modalAjusteAbierto = false;
  errorModalAjuste = '';
  formularioAjuste = {
    producto_id: 0,
    producto_nombre: '',
    stock_actual: 0,
    tipo_movimiento: 'AJUSTE_ENTRADA' as 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA',
    cantidad: 1,
    referencia: '',
  };

  // Modal de Configuración de Vencimiento, Lote y Stock Mínimo (CU11)
  modalVencimientoAbierto = false;
  errorModalVencimiento = '';
  formularioVencimiento = {
    producto_id: 0,
    producto_nombre: '',
    codigo_barras: '',
    fecha_vencimiento: '',
    lote: '',
    stock_minimo: 5,
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
    this.cargarCategorias();
    this.cargarCompras();
    this.cargarAlertas();
    this.cargarStockDisponible();
    this.cargarKardex();
  }

  cargarProveedores(): void {
    this.apiService.getProveedores().subscribe({
      next: (lista) => {
        this.proveedores = lista || [];
        this.cdr.detectChanges();
      },
    });
  }

  cargarCategorias(): void {
    this.apiService.getCategorias().subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.cdr.detectChanges();
      },
    });
  }

  cargarCompras(buscar?: string): void {
    this.cargandoCompras = true;
    this.cdr.detectChanges();

    this.apiService.getCompras(buscar).subscribe({
      next: (lista) => {
        this.compras = lista || [];
        this.cargandoCompras = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoCompras = false;
        this.mostrarToast('No se pudo cargar el historial de compras.', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  get comprasFiltradas(): any[] {
    return (this.compras || []).filter((c) => {
      const texto = this.filtroComprasTexto.trim().toLowerCase();
      const coincideTexto =
        !texto ||
        (c.numero_factura_proveedor &&
          c.numero_factura_proveedor.toLowerCase().includes(texto)) ||
        (c.proveedor_nombre && c.proveedor_nombre.toLowerCase().includes(texto)) ||
        (c.id && c.id.toString().includes(texto));

      const coincideEstado =
        this.filtroComprasEstado === 'TODOS' || c.estado === this.filtroComprasEstado;

      const coincideProveedor =
        this.filtroComprasProveedor === 'TODOS' ||
        Number(c.proveedor_id) === Number(this.filtroComprasProveedor);

      let coincideFecha = true;
      if (this.filtroComprasFechaDesde && c.fecha_compra) {
        const fCompra = new Date(c.fecha_compra).toISOString().substring(0, 10);
        coincideFecha = coincideFecha && fCompra >= this.filtroComprasFechaDesde;
      }
      if (this.filtroComprasFechaHasta && c.fecha_compra) {
        const fCompra = new Date(c.fecha_compra).toISOString().substring(0, 10);
        coincideFecha = coincideFecha && fCompra <= this.filtroComprasFechaHasta;
      }

      return coincideTexto && coincideEstado && coincideProveedor && coincideFecha;
    });
  }

  get totalComprasMonto(): number {
    return (this.comprasFiltradas || [])
      .filter((c) => c.estado !== 'ANULADA')
      .reduce((acc, c) => acc + (Number(c.total_compra) || 0), 0);
  }

  get totalComprasUnidades(): number {
    return (this.comprasFiltradas || [])
      .filter((c) => c.estado !== 'ANULADA')
      .reduce((acc, c) => acc + (Number(c.total_unidades) || 0), 0);
  }

  get totalComprasRecibidas(): number {
    return (this.comprasFiltradas || []).filter((c) => c.estado === 'RECIBIDA').length;
  }

  get totalComprasAnuladas(): number {
    return (this.comprasFiltradas || []).filter((c) => c.estado === 'ANULADA').length;
  }

  limpiarFiltrosCompras(): void {
    this.filtroComprasTexto = '';
    this.filtroComprasEstado = 'TODOS';
    this.filtroComprasProveedor = 'TODOS';
    this.filtroComprasFechaDesde = '';
    this.filtroComprasFechaHasta = '';
  }

  exportarComprasCSV(): void {
    const listado = this.comprasFiltradas;
    if (!listado || listado.length === 0) {
      this.mostrarToast('No hay compras para exportar con los filtros actuales.', 'error');
      return;
    }

    const cabeceras = [
      'ID_Compra',
      'Nro_Factura',
      'Fecha_Registro',
      'Proveedor',
      'Registrado_Por',
      'Total_Productos',
      'Total_Unidades',
      'Monto_Total_Bs',
      'Estado',
    ];

    const filas = listado.map((c) => [
      c.id,
      `"${(c.numero_factura_proveedor || 'S/N').replace(/"/g, '""')}"`,
      new Date(c.fecha_compra).toLocaleString('es-ES'),
      `"${(c.proveedor_nombre || 'Proveedor Mayorista').replace(/"/g, '""')}"`,
      `"${(c.usuario_nombre || 'Administrador').replace(/"/g, '""')}"`,
      c.total_items || (c.detalles?.length || 0),
      c.total_unidades || 0,
      Number(c.total_compra || 0).toFixed(2),
      c.estado || 'RECIBIDA',
    ]);

    const csvContent =
      '\uFEFF' + [cabeceras.join(';'), ...filas.map((f) => f.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `historial_compras_${new Date().toISOString().substring(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.mostrarToast('Historial de compras exportado a CSV exitosamente.', 'success');
  }

  imprimirComprobante(): void {
    window.print();
  }

  // =========================================================================
  // CU13: MODAL DE REGISTRO DE COMPRA (INGRESO A INVENTARIO)
  // =========================================================================
  productosPorCategoria(categoriaId: number): any[] {
    const items = this.resumenStock?.items || [];
    if (!categoriaId || Number(categoriaId) === 0) {
      return items;
    }
    return items.filter((p: any) => Number(p.categoria_id) === Number(categoriaId));
  }

  abrirModalNuevaCompra(productoInicial?: any, cantidadSugerida?: number): void {
    this.errorModalCompra = '';
    const hoyIso = new Date().toISOString().substring(0, 10);

    const primerProv = (this.proveedores || []).find((p) => p.activo) || this.proveedores[0];
    this.formularioCompra = {
      proveedor_id: primerProv ? primerProv.id : null,
      numero_factura_proveedor: '',
      observaciones: '',
      fecha_compra: hoyIso,
      items: [],
    };

    if (productoInicial) {
      this.agregarLineaCompra(productoInicial, cantidadSugerida);
    } else {
      this.agregarLineaCompra();
    }

    this.modalCompraAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModalCompra(): void {
    if (this.guardando) return;
    this.modalCompraAbierto = false;
    this.errorModalCompra = '';
    this.cdr.detectChanges();
  }

  agregarLineaCompra(productoPredeterminado?: any, cantidadSugerida?: number): void {
    const productos = this.resumenStock?.items || [];
    let p = productoPredeterminado;

    if (!p && productos.length > 0) {
      p = productos[0];
    }

    const hoy = new Date();
    hoy.setMonth(hoy.getMonth() + 6);
    const vencimientoDefault = hoy.toISOString().substring(0, 10);

    // Detección automática inteligente del modo de empaque
    let modoAuto: 'UNIDAD' | 'PACK_6' | 'CAJA_12' | 'FARDO_24' | 'PERSONALIZADO' = 'UNIDAD';
    let uAuto = 1;
    let cantPaqAuto = cantidadSugerida && cantidadSugerida > 0 ? cantidadSugerida : 1;

    if (p) {
      const n = (p.nombre || '').toLowerCase();
      const cat = (p.categoria_nombre || '').toLowerCase();

      if (
        n.includes('coca') ||
        n.includes('gaseosa') ||
        n.includes('pepsi') ||
        n.includes('jugo') ||
        n.includes('agua') ||
        cat.includes('gaseosa')
      ) {
        modoAuto = 'PACK_6';
        uAuto = 6;
        cantPaqAuto = cantidadSugerida && cantidadSugerida > 0 ? Math.ceil(cantidadSugerida / 6) : 2;
      } else if (n.includes('malta') || n.includes('lata') || n.includes('energetica')) {
        modoAuto = 'FARDO_24';
        uAuto = 24;
        cantPaqAuto = cantidadSugerida && cantidadSugerida > 0 ? Math.ceil(cantidadSugerida / 24) : 1;
      } else if (
        n.includes('cerveza') ||
        n.includes('vino') ||
        cat.includes('cerveza') ||
        cat.includes('vino')
      ) {
        modoAuto = 'CAJA_12';
        uAuto = 12;
        cantPaqAuto = cantidadSugerida && cantidadSugerida > 0 ? Math.ceil(cantidadSugerida / 12) : 2;
      }
    }

    const costoUnit = p ? Number(p.precio_compra || 0) : 0;
    const costoPaq = Number((costoUnit * uAuto).toFixed(2));
    const totalUds = cantPaqAuto * uAuto;
    const subtotal = Number((cantPaqAuto * costoPaq).toFixed(2));

    const nuevaLinea: LineaCompraForm = {
      categoria_id: p ? Number(p.categoria_id || 0) : 0,
      producto_id: p ? p.id || p.producto_id : 0,
      producto_nombre: p ? p.nombre : '',
      codigo_barras: p ? p.codigo_barras : '',
      stock_actual: p ? p.stock_actual : 0,

      modo_empaque: modoAuto,
      cantidad_paquetes: cantPaqAuto,
      unidades_por_paquete: uAuto,
      cantidad: totalUds,

      costo_paquete: costoPaq,
      costo_unitario_compra: costoUnit,
      subtotal: subtotal,

      nuevo_precio_venta: p ? Number(p.precio_venta || 0) : null,
      fecha_vencimiento: p?.fecha_vencimiento || vencimientoDefault,
      lote: p?.lote || `LT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    };

    this.formularioCompra.items.push(nuevaLinea);
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  eliminarLineaCompra(index: number): void {
    if (this.formularioCompra.items.length <= 1) {
      this.mostrarToast('La compra debe contener al menos un producto.', 'error');
      return;
    }
    this.formularioCompra.items.splice(index, 1);
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  alCambiarCategoriaLinea(index: number): void {
    const linea = this.formularioCompra.items[index];
    if (!linea) return;

    const prods = this.productosPorCategoria(linea.categoria_id);
    if (prods.length > 0) {
      linea.producto_id = prods[0].id;
      this.alCambiarProductoLinea(index);
    } else {
      linea.producto_id = 0;
      linea.producto_nombre = '';
      linea.codigo_barras = '';
      linea.stock_actual = 0;
      linea.costo_unitario_compra = 0;
      linea.costo_paquete = 0;
      linea.subtotal = 0;
    }
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  alCambiarProductoLinea(index: number): void {
    const linea = this.formularioCompra.items[index];
    if (!linea) return;

    const prod = (this.resumenStock?.items || []).find(
      (p: any) => Number(p.id) === Number(linea.producto_id),
    );

    if (prod) {
      linea.producto_nombre = prod.nombre;
      linea.codigo_barras = prod.codigo_barras;
      linea.stock_actual = prod.stock_actual;
      linea.categoria_id = prod.categoria_id;
      linea.costo_unitario_compra = Number(prod.precio_compra || 0);
      linea.nuevo_precio_venta = Number(prod.precio_venta || 0);
      if (prod.fecha_vencimiento) {
        linea.fecha_vencimiento = prod.fecha_vencimiento;
      }
      if (prod.lote) {
        linea.lote = prod.lote;
      }
      const u = Math.max(1, Number(linea.unidades_por_paquete) || 1);
      linea.costo_paquete = Number((linea.costo_unitario_compra * u).toFixed(2));
      linea.cantidad = (Number(linea.cantidad_paquetes) || 1) * u;
      linea.subtotal = Number(
        ((Number(linea.cantidad_paquetes) || 1) * linea.costo_paquete).toFixed(2),
      );
    }
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  cambiarModoEmpaque(
    index: number,
    modo: 'UNIDAD' | 'PACK_6' | 'CAJA_12' | 'FARDO_24' | 'PERSONALIZADO',
  ): void {
    const item = this.formularioCompra.items[index];
    if (!item) return;

    item.modo_empaque = modo;
    if (modo === 'UNIDAD') {
      item.unidades_por_paquete = 1;
    } else if (modo === 'PACK_6') {
      item.unidades_por_paquete = 6;
    } else if (modo === 'CAJA_12') {
      item.unidades_por_paquete = 12;
    } else if (modo === 'FARDO_24') {
      item.unidades_por_paquete = 24;
    } else if (modo === 'PERSONALIZADO') {
      if (item.unidades_por_paquete <= 1) {
        item.unidades_por_paquete = 6;
      }
    }

    const u = Math.max(1, Number(item.unidades_por_paquete) || 1);
    item.cantidad = (Number(item.cantidad_paquetes) || 1) * u;
    item.costo_paquete = Number((item.costo_unitario_compra * u).toFixed(2));
    item.subtotal = Number(
      ((Number(item.cantidad_paquetes) || 1) * item.costo_paquete).toFixed(2),
    );
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  alCambiarCantidadPaquetes(index: number): void {
    const item = this.formularioCompra.items[index];
    if (!item) return;

    const cp = Math.max(1, Number(item.cantidad_paquetes) || 1);
    const u = Math.max(1, Number(item.unidades_por_paquete) || 1);
    item.cantidad = cp * u;
    item.subtotal = Number((cp * (Number(item.costo_paquete) || 0)).toFixed(2));
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  alCambiarUnidadesPorPaquete(index: number): void {
    const item = this.formularioCompra.items[index];
    if (!item) return;

    const u = Math.max(1, Number(item.unidades_por_paquete) || 1);
    item.unidades_por_paquete = u;
    const cp = Math.max(1, Number(item.cantidad_paquetes) || 1);
    item.cantidad = cp * u;

    if (Number(item.costo_paquete) > 0) {
      item.costo_unitario_compra = Number((Number(item.costo_paquete) / u).toFixed(2));
    }
    item.subtotal = Number((cp * (Number(item.costo_paquete) || 0)).toFixed(2));
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  alCambiarCostoPaquete(index: number): void {
    const item = this.formularioCompra.items[index];
    if (!item) return;

    const u = Math.max(1, Number(item.unidades_por_paquete) || 1);
    const cp = Math.max(1, Number(item.cantidad_paquetes) || 1);
    const costoPaq = Math.max(0, Number(item.costo_paquete) || 0);

    item.costo_unitario_compra = Number((costoPaq / u).toFixed(2));
    item.subtotal = Number((cp * costoPaq).toFixed(2));
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  alCambiarCostoUnitario(index: number): void {
    const item = this.formularioCompra.items[index];
    if (!item) return;

    const u = Math.max(1, Number(item.unidades_por_paquete) || 1);
    const cp = Math.max(1, Number(item.cantidad_paquetes) || 1);
    const costoUnit = Math.max(0, Number(item.costo_unitario_compra) || 0);

    item.costo_paquete = Number((costoUnit * u).toFixed(2));
    item.subtotal = Number((cp * item.costo_paquete).toFixed(2));
    this.recalcularTotalesGenerales();
    this.cdr.detectChanges();
  }

  recalcularTotalesGenerales(): void {
    for (const item of this.formularioCompra.items) {
      const u = Math.max(1, Number(item.unidades_por_paquete) || 1);
      const cp = Math.max(1, Number(item.cantidad_paquetes) || 1);
      item.cantidad = cp * u;
      item.subtotal = Number((cp * (Number(item.costo_paquete) || 0)).toFixed(2));
    }
  }

  get totalCompraCalculado(): number {
    return this.formularioCompra.items.reduce(
      (acc, item) => acc + (Number(item.subtotal) || 0),
      0,
    );
  }

  get totalUnidadesCompraCalculado(): number {
    return this.formularioCompra.items.reduce(
      (acc, item) => acc + (Number(item.cantidad) || 0),
      0,
    );
  }

  get totalPaquetesCompraCalculado(): number {
    return this.formularioCompra.items.reduce(
      (acc, item) => acc + (Number(item.cantidad_paquetes) || 0),
      0,
    );
  }

  guardarCompra(): void {
    this.errorModalCompra = '';

    if (!this.formularioCompra.items || this.formularioCompra.items.length === 0) {
      this.errorModalCompra = 'Agrega al menos un producto a la compra.';
      this.cdr.detectChanges();
      return;
    }

    for (let i = 0; i < this.formularioCompra.items.length; i++) {
      const it = this.formularioCompra.items[i];
      if (!it.producto_id || Number(it.producto_id) === 0) {
        this.errorModalCompra = `La línea #${i + 1} no tiene un producto seleccionado.`;
        this.cdr.detectChanges();
        return;
      }
      if (Number(it.cantidad) <= 0) {
        this.errorModalCompra = `La cantidad en la línea #${i + 1} debe ser mayor a 0 unidades.`;
        this.cdr.detectChanges();
        return;
      }
      if (Number(it.costo_unitario_compra) < 0) {
        this.errorModalCompra = `El costo en la línea #${i + 1} no puede ser negativo.`;
        this.cdr.detectChanges();
        return;
      }
    }

    this.guardando = true;
    this.cdr.detectChanges();

    const payload = {
      proveedor_id:
        this.formularioCompra.proveedor_id && Number(this.formularioCompra.proveedor_id) > 0
          ? Number(this.formularioCompra.proveedor_id)
          : null,
      numero_factura_proveedor: this.formularioCompra.numero_factura_proveedor?.trim() || null,
      observaciones: this.formularioCompra.observaciones.trim() || null,
      items: this.formularioCompra.items.map((it) => ({
        producto_id: Number(it.producto_id),
        cantidad: Number(it.cantidad),
        costo_unitario_compra: Number(it.costo_unitario_compra),
        nuevo_precio_venta: it.nuevo_precio_venta ? Number(it.nuevo_precio_venta) : null,
        fecha_vencimiento: it.fecha_vencimiento || null,
        lote: it.lote ? it.lote.trim() : null,
        cantidad_paquetes: Number(it.cantidad_paquetes) || null,
        unidades_por_paquete: Number(it.unidades_por_paquete) || null,
      })),
    };

    this.apiService.registrarCompra(payload).subscribe({
      next: (compraCreada) => {
        this.guardando = false;
        this.modalCompraAbierto = false;
        this.cargarCompras();
        this.cargarStockDisponible();
        this.cargarAlertas();
        this.cargarKardex();
        this.pestanaActiva = 'COMPRAS';
        this.mostrarToast(
          `Compra #${compraCreada.id} registrada con éxito (+${compraCreada.total_unidades || this.totalUnidadesCompraCalculado} unidades ingresadas). Total: Bs. ${Number(compraCreada.total_compra).toFixed(2)}.`,
          'success',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.errorModalCompra =
          err.error?.detail || 'No se pudo registrar el ingreso de compra al inventario.';
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // DETALLE DE COMPRA Y ANULACIÓN
  // =========================================================================
  abrirModalDetalleCompra(compra: any): void {
    this.compraSeleccionada = compra;
    this.modalDetalleCompraAbierto = true;
    this.cdr.detectChanges();

    this.apiService.getDetalleCompra(compra.id).subscribe({
      next: (det) => {
        this.compraSeleccionada = det;
        this.cdr.detectChanges();
      },
    });
  }

  cerrarModalDetalleCompra(): void {
    this.modalDetalleCompraAbierto = false;
    this.compraSeleccionada = null;
    this.cdr.detectChanges();
  }

  anularCompra(compra: any): void {
    if (compra.estado === 'ANULADA') {
      this.mostrarToast(`La compra #${compra.id} ya se encuentra anulada.`, 'error');
      return;
    }

    const conf = confirm(
      `¿Está seguro de anular la Compra #${compra.id} (${compra.numero_factura_proveedor ? 'Factura: ' + compra.numero_factura_proveedor : 'S/N'}) por Bs. ${Number(compra.total_compra).toFixed(2)}?\n\nEsta acción descontará del inventario las unidades ingresadas y asentará la reversión en el Kardex y en la Bitácora.`,
    );
    if (!conf) return;

    this.cargandoCompras = true;
    this.cdr.detectChanges();

    this.apiService.anularCompra(compra.id).subscribe({
      next: (actualizada) => {
        this.cargandoCompras = false;
        this.cargarCompras();
        this.cargarStockDisponible();
        this.cargarAlertas();
        this.cargarKardex();
        this.mostrarToast(
          `Compra #${actualizada.id} anulada exitosamente. Se revirtieron los ingresos de mercadería.`,
          'success',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoCompras = false;
        this.mostrarToast(
          err.error?.detail || 'No se pudo anular la compra seleccionada.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // CU11: ALERTAS DE STOCK MÍNIMO Y VENCIMIENTO
  // =========================================================================
  cargarAlertas(): void {
    this.cargandoAlertas = true;
    this.cdr.detectChanges();

    this.apiService
      .getAlertasInventario(this.diasUmbralVencimiento, this.incluirVigentes)
      .subscribe({
        next: (data) => {
          this.resumenAlertas = data || this.resumenAlertas;
          this.cargandoAlertas = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.cargandoAlertas = false;
          this.cdr.detectChanges();
        },
      });
  }

  ejecutarBarridoAlertas(): void {
    this.cargandoAlertas = true;
    this.cdr.detectChanges();

    this.apiService
      .generarAlertasInventario(this.diasUmbralVencimiento, this.incluirVigentes)
      .subscribe({
        next: (data) => {
          this.resumenAlertas = data || this.resumenAlertas;
          this.cargandoAlertas = false;
          this.mostrarToast(
            `Auditoría de inventario completada: ${this.resumenAlertas.total_alertas_activas} alerta(s) activa(s) detectadas.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: () => {
          this.cargandoAlertas = false;
          this.mostrarToast('No se pudo generar el reporte de alertas.', 'error');
          this.cdr.detectChanges();
        },
      });
  }

  cargarStockDisponible(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.apiService.getStockDisponible({ solo_activos: false }).subscribe({
      next: (data) => {
        this.resumenStock = data || this.resumenStock;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.mostrarToast('No se pudo consultar el stock disponible.', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  cargarKardex(productoId?: number): void {
    const id = productoId && productoId > 0 ? productoId : undefined;
    this.apiService.getKardex(id).subscribe({
      next: (lista) => {
        this.movimientosKardex = lista || [];
        this.cdr.detectChanges();
      },
    });
  }

  get itemsStockFiltrados(): any[] {
    const items = this.resumenStock?.items || [];
    return items.filter((item: any) => {
      const texto = this.filtroTexto.trim().toLowerCase();
      const coincideTexto =
        !texto ||
        (item.nombre && item.nombre.toLowerCase().includes(texto)) ||
        (item.codigo_barras && item.codigo_barras.toLowerCase().includes(texto)) ||
        (item.categoria_nombre && item.categoria_nombre.toLowerCase().includes(texto));

      const coincideCat =
        Number(this.filtroCategoriaId) === 0 ||
        Number(item.categoria_id) === Number(this.filtroCategoriaId);

      const coincideNivel =
        this.filtroNivel === 'TODOS' || item.estado_stock === this.filtroNivel;

      return coincideTexto && coincideCat && coincideNivel;
    });
  }

  filtrarPorCardNivel(nivel: 'TODOS' | 'OPTIMO' | 'BAJO' | 'AGOTADO'): void {
    this.pestanaActiva = 'STOCK';
    this.filtroNivel = nivel;
    this.cdr.detectChanges();
  }

  limpiarFiltros(): void {
    this.filtroTexto = '';
    this.filtroCategoriaId = 0;
    this.filtroNivel = 'TODOS';
    this.cdr.detectChanges();
  }

  verKardexProducto(item: any): void {
    this.productoKardexFiltroId = item.id || item.producto_id;
    this.pestanaActiva = 'KARDEX';
    this.cargarKardex(this.productoKardexFiltroId);
    this.cdr.detectChanges();
  }

  mostrarTodoKardex(): void {
    this.productoKardexFiltroId = 0;
    this.cargarKardex();
    this.cdr.detectChanges();
  }

  abrirModalAjuste(item?: any, cantidadSugerida?: number): void {
    this.errorModalAjuste = '';
    const prodId = item ? item.id || item.producto_id : (this.resumenStock?.items || [])[0]?.id || 0;
    const prodObj =
      (this.resumenStock?.items || []).find((i: any) => Number(i.id) === Number(prodId)) || item;

    this.formularioAjuste = {
      producto_id: prodId,
      producto_nombre: prodObj ? prodObj.nombre : '',
      stock_actual: prodObj ? prodObj.stock_actual : 0,
      tipo_movimiento: 'AJUSTE_ENTRADA',
      cantidad: cantidadSugerida && cantidadSugerida > 0 ? cantidadSugerida : 10,
      referencia: cantidadSugerida
        ? 'Reposición por alerta de stock crítico'
        : 'Reposición / conteo físico de mostrador',
    };
    this.modalAjusteAbierto = true;
    this.cdr.detectChanges();
  }

  alCambiarProductoAjuste(): void {
    const prod = (this.resumenStock?.items || []).find(
      (i: any) => Number(i.id) === Number(this.formularioAjuste.producto_id),
    );
    if (prod) {
      this.formularioAjuste.producto_nombre = prod.nombre;
      this.formularioAjuste.stock_actual = prod.stock_actual;
    }
    this.cdr.detectChanges();
  }

  cerrarModalAjuste(): void {
    if (this.guardando) return;
    this.modalAjusteAbierto = false;
    this.errorModalAjuste = '';
    this.cdr.detectChanges();
  }

  guardarAjuste(): void {
    this.errorModalAjuste = '';
    const cant = Number(this.formularioAjuste.cantidad);
    const ref = (this.formularioAjuste.referencia || '').trim();

    if (!this.formularioAjuste.producto_id) {
      this.errorModalAjuste = 'Selecciona un producto.';
      this.cdr.detectChanges();
      return;
    }
    if (isNaN(cant) || cant <= 0) {
      this.errorModalAjuste = 'La cantidad debe ser mayor a 0 unidades.';
      this.cdr.detectChanges();
      return;
    }
    if (!ref) {
      this.errorModalAjuste = 'Ingresa el motivo o referencia del ajuste de stock.';
      this.cdr.detectChanges();
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    this.apiService
      .registrarAjusteInventario({
        producto_id: Number(this.formularioAjuste.producto_id),
        tipo_movimiento: this.formularioAjuste.tipo_movimiento,
        cantidad: cant,
        referencia: ref,
      })
      .subscribe({
        next: () => {
          this.guardando = false;
          this.modalAjusteAbierto = false;
          this.cargarAlertas();
          this.cargarStockDisponible();
          this.cargarKardex(this.productoKardexFiltroId || undefined);
          this.mostrarToast('Stock actualizado y alertas recalculadas correctamente.', 'success');
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModalAjuste = err.error?.detail || 'No se pudo aplicar el ajuste de stock.';
          this.cdr.detectChanges();
        },
      });
  }

  // Modal de Configuración de Vencimiento y Lote (CU11)
  abrirModalVencimiento(item: any): void {
    this.errorModalVencimiento = '';
    const prodId = item.id || item.producto_id;
    const prodStock =
      (this.resumenStock?.items || []).find((i: any) => Number(i.id) === Number(prodId)) || item;

    this.formularioVencimiento = {
      producto_id: prodId,
      producto_nombre: item.nombre || prodStock?.nombre || '',
      codigo_barras: item.codigo_barras || prodStock?.codigo_barras || '',
      fecha_vencimiento: item.fecha_vencimiento || prodStock?.fecha_vencimiento || '',
      lote: item.lote || prodStock?.lote || 'LT-GEN-01',
      stock_minimo: Number(item.stock_minimo ?? prodStock?.stock_minimo ?? 5),
    };
    this.modalVencimientoAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModalVencimiento(): void {
    if (this.guardando) return;
    this.modalVencimientoAbierto = false;
    this.errorModalVencimiento = '';
    this.cdr.detectChanges();
  }

  guardarVencimiento(): void {
    this.errorModalVencimiento = '';
    if (!this.formularioVencimiento.producto_id) return;

    this.guardando = true;
    this.cdr.detectChanges();

    this.apiService
      .updateVencimientoProducto(this.formularioVencimiento.producto_id, {
        fecha_vencimiento: this.formularioVencimiento.fecha_vencimiento || null,
        lote: this.formularioVencimiento.lote,
        stock_minimo: Number(this.formularioVencimiento.stock_minimo) || 5,
      })
      .subscribe({
        next: () => {
          this.guardando = false;
          this.modalVencimientoAbierto = false;
          this.cargarAlertas();
          this.cargarStockDisponible();
          this.mostrarToast(
            `Vencimiento, lote y stock mínimo de "${this.formularioVencimiento.producto_nombre}" actualizados.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModalVencimiento =
            err.error?.detail || 'No se pudo actualizar la fecha de vencimiento.';
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
