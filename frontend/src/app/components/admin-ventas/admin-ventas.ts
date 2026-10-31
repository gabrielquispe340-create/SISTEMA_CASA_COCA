import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth';

export interface CartItem {
  producto: any;
  cantidad: number;
  precio_unitario: number;
  descuento_linea: number;
  subtotal_linea: number;
  tipo_empaque?: 'UNIDAD' | 'PAQUETE';
  nombre_presentacion?: string;
  unidades_empaque?: number;
}

@Component({
  selector: 'app-admin-ventas',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-ventas.html',
  styleUrl: './admin-ventas.css',
})
export class AdminVentas implements OnInit {
  usuario: any = null;
  sesionCaja: any = null;

  // Pestaña principal: 'pos' (Punto de Venta), 'historial' (Supervisión) o 'movimientos' (Caja)
  pestanaActiva: 'pos' | 'historial' | 'movimientos' = 'pos';

  // Movimientos de Caja (Ingresos y Egresos - Supervisión Admin)
  movimientosCaja: any[] = [];
  cargandoMovimientos: boolean = false;
  filtroMovimientoTipo: string = 'TODOS'; // 'TODOS' | 'INGRESO' | 'EGRESO'
  filtroMovimientoTexto: string = '';

  // Modal Registro Movimiento (Admin)
  modalMovimientoAdmin: boolean = false;
  tipoMovimientoAdmin: 'INGRESO' | 'EGRESO' = 'INGRESO';
  montoMovimientoAdmin: number = 0;
  motivoMovimientoAdmin: string = '';
  comprobanteMovimientoAdmin: string = '';
  guardandoMovimientoAdmin: boolean = false;

  chipsIngresoAdmin: string[] = [
    'Reposición de cambio / monedas',
    'Aporte de fondo adicional',
    'Ajuste por sobrante o cobro manual',
  ];

  chipsEgresoAdmin: string[] = [
    'Pago de flete / transporte',
    'Compra de insumos de limpieza',
    'Pago menor a proveedor',
    'Retiro de seguridad / sangría de caja',
  ];

  modalComprobanteMovimientoAdmin: boolean = false;
  movimientoImprimirAdmin: any = null;

  // =========================================================================
  // POS: CATÁLOGO Y CARRITO
  // =========================================================================
  productos: any[] = [];
  productosFiltrados: any[] = [];
  categorias: any[] = [];
  categoriaSeleccionadaId: number = 0;
  busquedaTexto: string = '';
  cargando: boolean = true;

  carrito: CartItem[] = [];
  descuentoGlobal: number = 0;
  metodoPago: 'EFECTIVO' | 'QR' = 'EFECTIVO';
  montoRecibido: number = 0;
  montoRecibidoManual: boolean = false;
  vuelto: number = 0;
  denominacionesBs: number[] = [10, 20, 50, 100, 200];

  // Clientes
  clientes: any[] = [];
  clienteSeleccionadoId: number = 0;
  clienteSeleccionado: any = null;
  modalNuevoCliente: boolean = false;
  guardandoCliente: boolean = false;
  nuevoCliente = {
    documento_identidad: '',
    nombre_completo: '',
    telefono: '',
    email: '',
  };

  // Venta y Ticket
  guardandoVenta: boolean = false;
  modalTicket: boolean = false;
  ventaFinalizada: any = null;
  datosTicket: any = null;

  // =========================================================================
  // HISTORIAL Y SUPERVISIÓN DE VENTAS
  // =========================================================================
  ventas: any[] = [];
  ventasFiltradas: any[] = [];
  cargandoHistorial: boolean = false;

  filtroHistorialTexto: string = '';
  filtroHistorialEstado: string = 'TODAS'; // 'TODAS' | 'COMPLETADA' | 'ANULADA'
  filtroHistorialFechaDesde: string = '';
  filtroHistorialFechaHasta: string = '';

  // Anulación de Venta
  modalAnular: boolean = false;
  ventaAAnular: any = null;
  anulandoVenta: boolean = false;

  // Feedback y Toasts
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
    this.cargarDatosPOS();
  }

  obtenerUrlImagen(url: string | null | undefined): string {
    return this.apiService.obtenerUrlImagen(url);
  }

  cambiarPestana(pestana: 'pos' | 'historial' | 'movimientos'): void {
    this.pestanaActiva = pestana;
    this.cdr.detectChanges();
    if (pestana === 'historial') {
      this.cargarHistorialVentas();
    } else if (pestana === 'movimientos') {
      this.cargarMovimientosCaja();
    } else {
      this.cargarDatosPOS();
    }
  }

  cargarDatosPOS(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    // Verificar caja abierta del admin (si tiene)
    this.apiService.getCajaActual().subscribe({
      next: (caja) => {
        this.sesionCaja = caja;
        this.cdr.detectChanges();
      },
      error: () => {
        this.sesionCaja = null;
        this.cdr.detectChanges();
      },
    });

    // Cargar categorías
    this.apiService.getCategorias('', true).subscribe({
      next: (data) => {
        this.categorias = data || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.categorias = [];
        this.cdr.detectChanges();
      },
    });

    // Cargar clientes
    this.apiService.getClientes('').subscribe({
      next: (data) => {
        this.clientes = data || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.clientes = [];
        this.cdr.detectChanges();
      },
    });

    // Cargar productos
    this.apiService.getProductos('', undefined, true).subscribe({
      next: (data) => {
        this.productos = (data || []).map((p) => ({
          ...p,
          precio_venta: Number(p.precio_venta) || 0,
          precio_compra: Number(p.precio_compra) || 0,
          stock_actual: Number(p.stock_actual) || 0,
        }));
        this.filtrarProductos();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargando = false;
        this.mostrarToast(
          err.error?.detail || 'Error al cargar productos.',
          'error'
        );
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // POS: FILTROS Y ESCANEO
  // =========================================================================
  filtrarProductos(): void {
    const term = this.busquedaTexto.trim().toLowerCase();
    this.productosFiltrados = this.productos.filter((p) => {
      const coincideCat =
        this.categoriaSeleccionadaId === 0 ||
        p.categoria_id === this.categoriaSeleccionadaId;
      if (!coincideCat) return false;

      if (!term) return true;
      const coincideNombre = p.nombre && p.nombre.toLowerCase().includes(term);
      const coincideCodigo =
        p.codigo_barras && p.codigo_barras.toLowerCase().includes(term);
      const coincideDesc =
        p.descripcion && p.descripcion.toLowerCase().includes(term);
      return coincideNombre || coincideCodigo || coincideDesc;
    });
    this.cdr.detectChanges();
  }

  seleccionarCategoria(catId: number): void {
    this.categoriaSeleccionadaId = catId;
    this.filtrarProductos();
  }

  getUnidadesRealesEnCarrito(productoId: number): number {
    return this.carrito
      .filter((it) => it.producto.id === productoId)
      .reduce((acc, it) => acc + (it.cantidad * (it.unidades_empaque || 1)), 0);
  }

  formatearStockDual(p: any): { paquetes: number; sueltas: number; total: number; tienePack: boolean; texto: string; corto: string } {
    const stock = Number(p.stock_actual) || 0;
    const uPack = Number(p.unidades_por_paquete) || 1;
    const tienePack = !!p.tiene_paquete && uPack > 1;
    if (!tienePack) {
      return { paquetes: 0, sueltas: stock, total: stock, tienePack: false, texto: `${stock} uds.`, corto: `${stock} uds` };
    }
    const paq = Math.floor(stock / uPack);
    const sueltas = stock % uPack;
    const nomPack = p.nombre_paquete || 'Paq';
    return {
      paquetes: paq,
      sueltas: sueltas,
      total: stock,
      tienePack: true,
      texto: `${paq} ${nomPack}(s) + ${sueltas} uds.`,
      corto: `${paq} ${nomPack} + ${sueltas} u`,
    };
  }

  onEscanearEnter(): void {
    const term = this.busquedaTexto.trim();
    if (!term) return;

    // 1. Coincidencia por código de paquete
    const prodPaquete = this.productos.find(
      (p) => p.codigo_barra_paquete && p.codigo_barra_paquete.toLowerCase() === term.toLowerCase()
    );
    if (prodPaquete) {
      this.agregarAlCarrito(prodPaquete, 'PAQUETE');
      this.busquedaTexto = '';
      this.filtrarProductos();
      return;
    }

    // 2. Coincidencia por código individual
    const productoExacto = this.productos.find(
      (p) => p.codigo_barras && p.codigo_barras.toLowerCase() === term.toLowerCase()
    );

    if (productoExacto) {
      this.agregarAlCarrito(productoExacto, 'UNIDAD');
      this.busquedaTexto = '';
      this.filtrarProductos();
      return;
    }

    if (this.productosFiltrados.length === 1) {
      this.agregarAlCarrito(this.productosFiltrados[0], 'UNIDAD');
      this.busquedaTexto = '';
      this.filtrarProductos();
      return;
    }

    this.filtrarProductos();
  }

  // =========================================================================
  // POS: OPERACIONES DEL CARRITO
  // =========================================================================
  agregarAlCarrito(producto: any, tipoEmpaque: 'UNIDAD' | 'PAQUETE' = 'UNIDAD', cantidad: number = 1): void {
    const isPaquete = tipoEmpaque === 'PAQUETE' && !!producto.tiene_paquete && (Number(producto.unidades_por_paquete) || 1) > 1;
    const factor = isPaquete ? Math.max(1, Number(producto.unidades_por_paquete) || 1) : 1;
    const unidadesRequeridas = cantidad * factor;

    if (producto.stock_actual < unidadesRequeridas) {
      const descPack = isPaquete ? `${cantidad} ${producto.nombre_paquete || 'paquete(s)'} (${unidadesRequeridas} uds)` : `${cantidad} uds`;
      this.mostrarToast(`Stock insuficiente para "${producto.nombre}". Requiere: ${descPack}, Disponible: ${producto.stock_actual} uds.`, 'warning');
      return;
    }

    const unidadesYaEnCarrito = this.getUnidadesRealesEnCarrito(producto.id);
    if ((unidadesYaEnCarrito + unidadesRequeridas) > producto.stock_actual) {
      this.mostrarToast(
        `Stock máximo alcanzado para "${producto.nombre}". En stock: ${producto.stock_actual} uds. (ya tienes ${unidadesYaEnCarrito} uds en carrito).`,
        'warning'
      );
      return;
    }

    const precioUnit = isPaquete && producto.precio_paquete_venta && Number(producto.precio_paquete_venta) > 0
      ? Number(producto.precio_paquete_venta)
      : Number(producto.precio_venta);

    const nomPresentacion = isPaquete
      ? `${producto.nombre} (${producto.nombre_paquete || 'Paquete'} x${factor})`
      : producto.nombre;

    const tipoActual = isPaquete ? 'PAQUETE' : 'UNIDAD';
    const itemExistente = this.carrito.find(
      (item) => item.producto.id === producto.id && (item.tipo_empaque || 'UNIDAD') === tipoActual
    );

    if (itemExistente) {
      itemExistente.cantidad += cantidad;
      this.actualizarSubtotalItem(itemExistente);
      this.mostrarToast(`Cantidad actualizada: ${nomPresentacion} (${itemExistente.cantidad})`, 'info');
    } else {
      const nuevoItem: CartItem = {
        producto,
        cantidad,
        precio_unitario: precioUnit,
        descuento_linea: 0,
        subtotal_linea: precioUnit * cantidad,
        tipo_empaque: tipoActual,
        nombre_presentacion: nomPresentacion,
        unidades_empaque: factor,
      };
      this.carrito.push(nuevoItem);
      this.mostrarToast(`Agregado al carrito: ${nomPresentacion}`, 'success');
    }

    this.recalcularTotales();
  }

  modificarCantidad(item: CartItem, delta: number): void {
    const factor = item.unidades_empaque || 1;
    const nuevaCantidad = item.cantidad + delta;
    if (nuevaCantidad <= 0) {
      this.eliminarDelCarrito(item);
      return;
    }

    const unidadesOtras = this.carrito
      .filter((it) => it !== item && it.producto.id === item.producto.id)
      .reduce((acc, it) => acc + (it.cantidad * (it.unidades_empaque || 1)), 0);

    if ((unidadesOtras + (nuevaCantidad * factor)) > item.producto.stock_actual) {
      this.mostrarToast(
        `No hay más existencias para "${item.nombre_presentacion || item.producto.nombre}". Stock: ${item.producto.stock_actual}`,
        'warning'
      );
      return;
    }

    item.cantidad = nuevaCantidad;
    this.actualizarSubtotalItem(item);
    this.recalcularTotales();
  }

  onCantidadManualChange(item: CartItem, valorRaw: any): void {
    let cant = parseInt(valorRaw, 10);
    if (isNaN(cant) || cant < 1) cant = 1;
    const factor = item.unidades_empaque || 1;
    const unidadesOtras = this.carrito
      .filter((it) => it !== item && it.producto.id === item.producto.id)
      .reduce((acc, it) => acc + (it.cantidad * (it.unidades_empaque || 1)), 0);

    const maxPermitido = Math.floor((item.producto.stock_actual - unidadesOtras) / factor);
    if (cant > maxPermitido) {
      cant = Math.max(1, maxPermitido);
      this.mostrarToast(
        `Stock insuficiente para "${item.nombre_presentacion || item.producto.nombre}". Ajustado a ${cant}.`,
        'warning'
      );
    }
    item.cantidad = cant;
    this.actualizarSubtotalItem(item);
    this.recalcularTotales();
  }

  onDescuentoLineaChange(item: CartItem, valorRaw: any): void {
    let desc = parseFloat(valorRaw) || 0;
    if (desc < 0) desc = 0;
    const maxDesc = item.precio_unitario * item.cantidad;
    if (desc > maxDesc) {
      desc = maxDesc;
      this.mostrarToast('El descuento de línea no puede exceder el total del ítem.', 'warning');
    }
    item.descuento_linea = desc;
    this.actualizarSubtotalItem(item);
    this.recalcularTotales();
  }

  actualizarSubtotalItem(item: CartItem): void {
    const base = item.precio_unitario * item.cantidad;
    const sub = base - (item.descuento_linea || 0);
    item.subtotal_linea = Math.max(0, sub);
  }

  eliminarDelCarrito(item: CartItem): void {
    this.carrito = this.carrito.filter((i) => i.producto.id !== item.producto.id);
    this.mostrarToast(`Eliminado: ${item.producto.nombre}`, 'info');
    this.recalcularTotales();
  }

  vaciarCarrito(): void {
    if (this.carrito.length === 0) return;
    this.carrito = [];
    this.descuentoGlobal = 0;
    this.montoRecibido = 0;
    this.montoRecibidoManual = false;
    this.vuelto = 0;
    this.mostrarToast('El carrito ha sido vaciado.', 'info');
    this.cdr.detectChanges();
  }

  getCantidadEnCarrito(productoId: number): number {
    const item = this.carrito.find((i) => i.producto.id === productoId);
    return item ? item.cantidad : 0;
  }

  // =========================================================================
  // POS: FINANZAS Y FORMAS DE PAGO
  // =========================================================================
  getSubtotal(): number {
    return this.carrito.reduce((acc, item) => acc + item.subtotal_linea, 0);
  }

  getTotalUnidades(): number {
    return this.carrito.reduce((acc, item) => acc + item.cantidad, 0);
  }

  getTotal(): number {
    const subtotal = this.getSubtotal();
    const desc = Math.max(0, Number(this.descuentoGlobal) || 0);
    return Math.max(0, subtotal - desc);
  }

  hacerScrollAlCarrito(): void {
    const el = document.getElementById('admin-pos-cart-column');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  onDescuentoGlobalChange(valorRaw: any): void {
    let val = parseFloat(valorRaw) || 0;
    if (val < 0) val = 0;
    const sub = this.getSubtotal();
    if (val > sub) {
      val = sub;
      this.mostrarToast('El descuento global no puede superar el subtotal.', 'warning');
    }
    this.descuentoGlobal = val;
    this.recalcularTotales();
  }

  seleccionarMetodoPago(metodo: 'EFECTIVO' | 'QR'): void {
    this.metodoPago = metodo;
    if (metodo !== 'EFECTIVO') {
      this.montoRecibido = this.getTotal();
      this.vuelto = 0;
    } else {
      if (!this.montoRecibidoManual || this.montoRecibido <= 0) {
        this.montoRecibido = this.getTotal();
      }
      this.calcularVuelto();
    }
    this.cdr.detectChanges();
  }

  setMontoRecibido(monto: number): void {
    this.montoRecibidoManual = true;
    this.montoRecibido = monto;
    this.calcularVuelto();
    this.cdr.detectChanges();
  }

  sumarDenominacion(monto: number): void {
    this.montoRecibidoManual = true;
    this.montoRecibido = (Number(this.montoRecibido) || 0) + monto;
    this.calcularVuelto();
    this.cdr.detectChanges();
  }

  establecerMontoExacto(): void {
    this.montoRecibidoManual = false;
    this.montoRecibido = this.getTotal();
    this.calcularVuelto();
    this.cdr.detectChanges();
  }

  onMontoRecibidoChange(valorRaw: any): void {
    this.montoRecibidoManual = true;
    this.montoRecibido = parseFloat(valorRaw) || 0;
    this.calcularVuelto();
    this.cdr.detectChanges();
  }

  calcularVuelto(): void {
    const total = this.getTotal();
    const recibido = Number(this.montoRecibido) || 0;
    this.vuelto = Math.max(0, recibido - total);
  }

  get faltaPorPagar(): number {
    const total = this.getTotal();
    const recibido = Number(this.montoRecibido) || 0;
    return Math.max(0, total - recibido);
  }

  recalcularTotales(): void {
    const total = this.getTotal();
    if (this.metodoPago !== 'EFECTIVO') {
      this.montoRecibido = total;
      this.vuelto = 0;
    } else {
      if (!this.montoRecibidoManual || this.montoRecibido <= 0) {
        this.montoRecibido = total;
      }
      this.calcularVuelto();
    }
    this.cdr.detectChanges();
  }

  // =========================================================================
  // CLIENTES
  // =========================================================================
  onClienteChange(): void {
    if (this.clienteSeleccionadoId === 0) {
      this.clienteSeleccionado = null;
    } else {
      this.clienteSeleccionado =
        this.clientes.find((c) => c.id === this.clienteSeleccionadoId) || null;
    }
  }

  abrirModalNuevoCliente(): void {
    this.nuevoCliente = {
      documento_identidad: '',
      nombre_completo: '',
      telefono: '',
      email: '',
    };
    this.modalNuevoCliente = true;
  }

  cerrarModalNuevoCliente(): void {
    this.modalNuevoCliente = false;
  }

  guardarNuevoCliente(): void {
    if (
      !this.nuevoCliente.documento_identidad.trim() ||
      !this.nuevoCliente.nombre_completo.trim()
    ) {
      this.mostrarToast(
        'El documento (NIT/CI) y el nombre completo son obligatorios.',
        'warning'
      );
      return;
    }

    this.guardandoCliente = true;
    this.cdr.detectChanges();
    this.apiService.createCliente(this.nuevoCliente).subscribe({
      next: (clienteCreado) => {
        this.guardandoCliente = false;
        this.mostrarToast('Cliente registrado exitosamente.', 'success');
        this.clientes.unshift(clienteCreado);
        this.clienteSeleccionadoId = clienteCreado.id;
        this.clienteSeleccionado = clienteCreado;
        this.cerrarModalNuevoCliente();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardandoCliente = false;
        this.mostrarToast(
          err.error?.detail || 'Error al registrar nuevo cliente.',
          'error'
        );
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // FINALIZAR VENTA (POS)
  // =========================================================================
  get puedeFinalizarVenta(): boolean {
    if (this.carrito.length === 0) return false;
    if (this.guardandoVenta) return false;
    return true;
  }

  finalizarVenta(): void {
    if (!this.puedeFinalizarVenta) return;

    if (this.metodoPago === 'EFECTIVO') {
      const total = this.getTotal();
      if ((Number(this.montoRecibido) || 0) < total) {
        this.montoRecibido = total;
        this.vuelto = 0;
      }
    }

    this.guardandoVenta = true;
    this.cdr.detectChanges();

    const payload = {
      cliente_id: this.clienteSeleccionado ? this.clienteSeleccionado.id : null,
      metodo_pago: this.metodoPago,
      descuento_global: Number(this.descuentoGlobal) || 0,
      impuestos: 0,
      items: this.carrito.map((item) => ({
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        descuento_linea: Number(item.descuento_linea) || 0,
        tipo_empaque: item.tipo_empaque || 'UNIDAD',
        precio_unitario: item.precio_unitario,
      })),
    };

    const snapshotCarrito: CartItem[] = this.carrito.map((it) => ({
      ...it,
      producto: { ...it.producto },
    }));
    const snapshotSubtotal = this.getSubtotal();
    const snapshotDescuento = Number(this.descuentoGlobal) || 0;
    const snapshotTotal = this.getTotal();
    const snapshotRecibido =
      this.metodoPago === 'EFECTIVO' ? Number(this.montoRecibido) || 0 : snapshotTotal;
    const snapshotVuelto =
      this.metodoPago === 'EFECTIVO' ? Number(this.vuelto) || 0 : 0;
    const snapshotCliente = this.clienteSeleccionado
      ? { ...this.clienteSeleccionado }
      : { nombre_completo: 'Cliente Mostrador', documento_identidad: 'S/N' };

    this.apiService.registrarVenta(payload).subscribe({
      next: (venta) => {
        this.guardandoVenta = false;
        this.ventaFinalizada = venta;

        this.datosTicket = {
          comprobante: venta.numero_comprobante,
          fecha: venta.fecha_venta || new Date().toISOString(),
          cajero: this.usuario?.nombre_completo || 'Administrador',
          cliente: snapshotCliente,
          metodo_pago: this.metodoPago,
          items: snapshotCarrito,
          subtotal: snapshotSubtotal,
          descuento: snapshotDescuento,
          total: snapshotTotal,
          recibido: snapshotRecibido,
          vuelto: snapshotVuelto,
        };

        this.mostrarToast(
          `¡Venta ${venta.numero_comprobante} completada exitosamente!`,
          'success'
        );

        snapshotCarrito.forEach((item) => {
          const prod = this.productos.find((p) => p.id === item.producto.id);
          if (prod) {
            const factor = item.unidades_empaque || 1;
            prod.stock_actual = Math.max(0, prod.stock_actual - (item.cantidad * factor));
          }
        });
        this.filtrarProductos();
        this.vaciarCarrito();
        this.modalTicket = true;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardandoVenta = false;
        this.mostrarToast(
          err.error?.detail || 'Error al procesar la venta.',
          'error'
        );
        this.cdr.detectChanges();
      },
    });
  }

  imprimirTicket(): void {
    window.print();
  }

  cerrarTicket(): void {
    this.modalTicket = false;
    this.ventaFinalizada = null;
    this.datosTicket = null;
    this.cdr.detectChanges();
  }

  // =========================================================================
  // HISTORIAL Y SUPERVISIÓN DE VENTAS
  // =========================================================================
  cargarHistorialVentas(): void {
    this.cargandoHistorial = true;
    this.cdr.detectChanges();
    this.apiService.getVentas().subscribe({
      next: (data) => {
        this.ventas = (data || []).map((v) => ({
          ...v,
          total: Number(v.total) || 0,
          subtotal: Number(v.subtotal) || 0,
          descuento: Number(v.descuento) || 0,
        }));
        this.filtrarHistorial();
        this.cargandoHistorial = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoHistorial = false;
        this.mostrarToast(
          err.error?.detail || 'Error al cargar el historial de ventas.',
          'error'
        );
        this.cdr.detectChanges();
      },
    });
  }

  filtrarHistorial(): void {
    const term = this.filtroHistorialTexto.trim().toLowerCase();
    this.ventasFiltradas = this.ventas.filter((v) => {
      // Filtro de estado
      if (
        this.filtroHistorialEstado !== 'TODAS' &&
        v.estado !== this.filtroHistorialEstado
      ) {
        return false;
      }

      // Filtro de fecha desde
      if (this.filtroHistorialFechaDesde) {
        const fechaVenta = new Date(v.fecha_venta).toISOString().slice(0, 10);
        if (fechaVenta < this.filtroHistorialFechaDesde) return false;
      }

      // Filtro de fecha hasta
      if (this.filtroHistorialFechaHasta) {
        const fechaVenta = new Date(v.fecha_venta).toISOString().slice(0, 10);
        if (fechaVenta > this.filtroHistorialFechaHasta) return false;
      }

      // Filtro de texto libre
      if (!term) return true;
      const coincideComp =
        v.numero_comprobante && v.numero_comprobante.toLowerCase().includes(term);
      const coincideCli =
        v.cliente_nombre && v.cliente_nombre.toLowerCase().includes(term);
      const coincideDoc =
        v.cliente_documento && v.cliente_documento.toLowerCase().includes(term);
      const coincideCajero =
        v.usuario_nombre && v.usuario_nombre.toLowerCase().includes(term);

      return coincideComp || coincideCli || coincideDoc || coincideCajero;
    });
    this.cdr.detectChanges();
  }

  limpiarFiltrosHistorial(): void {
    this.filtroHistorialTexto = '';
    this.filtroHistorialEstado = 'TODAS';
    this.filtroHistorialFechaDesde = '';
    this.filtroHistorialFechaHasta = '';
    this.filtrarHistorial();
    this.cdr.detectChanges();
  }

  // KPIs de Historial
  get totalVentasCount(): number {
    return this.ventasFiltradas.length;
  }

  get totalFacturadoBs(): number {
    return this.ventasFiltradas
      .filter((v) => v.estado === 'COMPLETADA')
      .reduce((acc, v) => acc + v.total, 0);
  }

  get totalEfectivoBs(): number {
    return this.ventasFiltradas
      .filter((v) => v.estado === 'COMPLETADA' && v.metodo_pago === 'EFECTIVO')
      .reduce((acc, v) => acc + v.total, 0);
  }

  get totalOtrosMetodosBs(): number {
    return this.ventasFiltradas
      .filter((v) => v.estado === 'COMPLETADA' && v.metodo_pago !== 'EFECTIVO')
      .reduce((acc, v) => acc + v.total, 0);
  }

  // Ver ticket de una venta histórica
  verTicketHistorico(venta: any): void {
    this.datosTicket = {
      comprobante: venta.numero_comprobante,
      fecha: venta.fecha_venta,
      cajero: venta.usuario_nombre || 'Cajero de Turno',
      cliente: {
        nombre_completo: venta.cliente_nombre || 'Cliente Mostrador',
        documento_identidad: venta.cliente_documento || 'S/N',
      },
      metodo_pago: venta.metodo_pago,
      items: (venta.detalles || []).map((d: any) => ({
        producto: {
          nombre: d.producto_nombre || `Producto #${d.producto_id}`,
          codigo_barras: d.producto_codigo || 'S/C',
        },
        cantidad: d.cantidad,
        precio_unitario: Number(d.precio_unitario) || 0,
        descuento_linea: Number(d.descuento_linea) || 0,
        subtotal_linea: Number(d.subtotal_linea) || 0,
      })),
      subtotal: venta.subtotal,
      descuento: venta.descuento,
      total: venta.total,
      recibido: venta.total,
      vuelto: 0,
    };
    this.modalTicket = true;
    this.cdr.detectChanges();
  }

  // Anulación de Venta (Solo Admin)
  solicitarAnulacion(venta: any): void {
    if (venta.estado === 'ANULADA') {
      this.mostrarToast('Esta venta ya fue anulada previamente.', 'warning');
      return;
    }
    this.ventaAAnular = venta;
    this.modalAnular = true;
    this.cdr.detectChanges();
  }

  cerrarModalAnular(): void {
    this.modalAnular = false;
    this.ventaAAnular = null;
    this.cdr.detectChanges();
  }

  confirmarAnulacion(): void {
    if (!this.ventaAAnular) return;

    this.anulandoVenta = true;
    this.cdr.detectChanges();
    this.apiService.anularVenta(this.ventaAAnular.id).subscribe({
      next: (ventaAnulada) => {
        this.anulandoVenta = false;
        this.mostrarToast(
          `Venta ${this.ventaAAnular.numero_comprobante} anulada con éxito. El stock ha sido reintegrado.`,
          'success'
        );
        this.cerrarModalAnular();
        this.cargarHistorialVentas();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.anulandoVenta = false;
        this.mostrarToast(
          err.error?.detail || 'Error al anular la venta.',
          'error'
        );
        this.cdr.detectChanges();
      },
    });
  }

  exportarCSV(): void {
    if (this.ventasFiltradas.length === 0) {
      this.mostrarToast('No hay ventas para exportar con los filtros actuales.', 'warning');
      return;
    }

    const headers = [
      'N° Comprobante',
      'Fecha y Hora',
      'Cajero',
      'Cliente',
      'NIT / CI',
      'Método de Pago',
      'Subtotal (Bs.)',
      'Descuento (Bs.)',
      'Total (Bs.)',
      'Estado',
    ];

    const rows = this.ventasFiltradas.map((v) => [
      `"${v.numero_comprobante}"`,
      `"${new Date(v.fecha_venta).toLocaleString('es-BO')}"`,
      `"${v.usuario_nombre || 'N/A'}"`,
      `"${v.cliente_nombre || 'Cliente Mostrador'}"`,
      `"${v.cliente_documento || 'S/N'}"`,
      `"${v.metodo_pago}"`,
      v.subtotal.toFixed(2),
      v.descuento.toFixed(2),
      v.total.toFixed(2),
      `"${v.estado}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `historial_ventas_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.mostrarToast('Reporte de ventas exportado en formato CSV.', 'success');
  }

  // =========================================================================
  // TOASTS Y UTILIDADES
  // =========================================================================
  mostrarToast(
    mensaje: string,
    tipo: 'success' | 'error' | 'info' | 'warning' = 'info'
  ): void {
    this.toast = { visible: true, mensaje, tipo };
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.cdr.detectChanges();
    this.toastTimeout = setTimeout(() => {
      this.toast.visible = false;
      this.cdr.detectChanges();
    }, 3500);
  }

  cerrarToast(): void {
    this.toast.visible = false;
    this.cdr.detectChanges();
  }

  obtenerIniciales(): string {
    if (!this.usuario || !this.usuario.nombre_completo) return 'AD';
    const partes = this.usuario.nombre_completo.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  // =========================================================================
  // MOVIMIENTOS DE CAJA (SUPERVISIÓN ADMIN)
  // =========================================================================
  cargarMovimientosCaja(): void {
    this.cargandoMovimientos = true;
    this.cdr.detectChanges();
    this.apiService.getMovimientosCaja().subscribe({
      next: (movs) => {
        this.movimientosCaja = movs || [];
        this.cargandoMovimientos = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.movimientosCaja = [];
        this.cargandoMovimientos = false;
        this.cdr.detectChanges();
      },
    });
  }

  get movimientosFiltrados(): any[] {
    return this.movimientosCaja.filter((m) => {
      const cumpleTipo =
        this.filtroMovimientoTipo === 'TODOS' ||
        m.tipo === this.filtroMovimientoTipo;
      const texto = this.filtroMovimientoTexto.toLowerCase().trim();
      const cumpleTexto =
        !texto ||
        (m.motivo && m.motivo.toLowerCase().includes(texto)) ||
        (m.numero_comprobante &&
          m.numero_comprobante.toLowerCase().includes(texto)) ||
        (m.usuario_nombre && m.usuario_nombre.toLowerCase().includes(texto));
      return cumpleTipo && cumpleTexto;
    });
  }

  abrirModalMovimientoAdmin(tipo: 'INGRESO' | 'EGRESO'): void {
    this.tipoMovimientoAdmin = tipo;
    this.montoMovimientoAdmin = 0;
    this.motivoMovimientoAdmin = '';
    this.comprobanteMovimientoAdmin = '';
    this.modalMovimientoAdmin = true;
    this.cdr.detectChanges();
  }

  cerrarModalMovimientoAdmin(): void {
    this.modalMovimientoAdmin = false;
    this.cdr.detectChanges();
  }

  seleccionarChipMotivoAdmin(motivo: string): void {
    this.motivoMovimientoAdmin = motivo;
    this.cdr.detectChanges();
  }

  guardarMovimientoAdmin(): void {
    const monto = Number(this.montoMovimientoAdmin);
    if (isNaN(monto) || monto <= 0) {
      this.mostrarToast(
        'El monto debe ser estrictamente mayor a Bs. 0.00.',
        'warning'
      );
      return;
    }

    const motivo = this.motivoMovimientoAdmin.trim();
    if (motivo.length < 3) {
      this.mostrarToast(
        'Debes ingresar un motivo explicativo (mínimo 3 caracteres).',
        'warning'
      );
      return;
    }

    this.guardandoMovimientoAdmin = true;
    this.cdr.detectChanges();

    const payload = {
      tipo: this.tipoMovimientoAdmin,
      monto: monto,
      motivo: motivo,
      numero_comprobante: this.comprobanteMovimientoAdmin.trim() || undefined,
    };

    this.apiService.registrarMovimientoCaja(payload).subscribe({
      next: (movCreado) => {
        this.guardandoMovimientoAdmin = false;
        this.modalMovimientoAdmin = false;
        const texto =
          this.tipoMovimientoAdmin === 'INGRESO' ? 'Ingreso' : 'Egreso';
        this.mostrarToast(
          `¡${texto} de Bs. ${monto.toFixed(2)} registrado correctamente!`,
          'success'
        );
        this.cargarMovimientosCaja();
        this.abrirComprobanteMovimientoAdmin(movCreado);
      },
      error: (err) => {
        this.guardandoMovimientoAdmin = false;
        const msg =
          err.error?.detail || 'Error al registrar movimiento de caja.';
        this.mostrarToast(msg, 'error');
        this.cdr.detectChanges();
      },
    });
  }

  abrirComprobanteMovimientoAdmin(mov: any): void {
    this.movimientoImprimirAdmin = {
      ...mov,
      turnoId: mov.sesion_caja_id,
      cajero:
        mov.usuario_nombre ||
        this.usuario?.nombre_completo ||
        'Administrador',
    };
    this.modalComprobanteMovimientoAdmin = true;
    this.cdr.detectChanges();
  }

  cerrarComprobanteMovimientoAdmin(): void {
    this.modalComprobanteMovimientoAdmin = false;
    this.movimientoImprimirAdmin = null;
    this.cdr.detectChanges();
  }

  imprimirTicketMovimientoAdmin(): void {
    window.print();
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
