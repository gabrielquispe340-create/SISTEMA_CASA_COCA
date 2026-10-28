import { Component, OnInit, ChangeDetectorRef, NgZone, ApplicationRef } from '@angular/core';
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
}

@Component({
  selector: 'app-empleado-pos',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './empleado-pos.html',
  styleUrl: './empleado-pos.css',
})
export class EmpleadoPos implements OnInit {
  usuario: any = null;
  sesionCaja: any = null;

  // Catálogo y filtros
  productos: any[] = [];
  productosFiltrados: any[] = [];
  categorias: any[] = [];
  categoriaSeleccionadaId: number = 0; // 0 = Todas
  busquedaTexto: string = '';
  cargando: boolean = true;

  // Carrito de compras
  carrito: CartItem[] = [];
  descuentoGlobal: number = 0;
  metodoPago: 'EFECTIVO' | 'QR' = 'EFECTIVO';
  montoRecibido: number = 0;
  montoRecibidoManual: boolean = false;
  vuelto: number = 0;

  // Gestión de Clientes
  clientes: any[] = [];
  clienteSeleccionadoId: number = 0; // 0 = Cliente Mostrador / S/N
  clienteSeleccionado: any = null;
  busquedaClienteTexto: string = '';
  modalNuevoCliente: boolean = false;
  guardandoCliente: boolean = false;
  nuevoCliente = {
    documento_identidad: '',
    nombre_completo: '',
    telefono: '',
    email: '',
  };

  // Finalización y Comprobante / Ticket
  guardandoVenta: boolean = false;
  modalTicket: boolean = false;
  ventaFinalizada: any = null;
  datosTicket: any = null;

  // Flujo de Cobro con Código QR del Dueño
  modalQrCobro: boolean = false;
  qrDuenoUrl: string = '/qr-dueno.png';
  qrReferenciaPago: string = '';
  errorQrModal: string = '';

  // Toast / Feedback
  toast = {
    visible: false,
    mensaje: '',
    tipo: 'info' as 'success' | 'error' | 'info' | 'warning',
  };
  private toastTimeout: any;

  // Denominaciones rápidas en Bolivianos (Bs.)
  denominacionesBs: number[] = [10, 20, 50, 100, 200];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private appRef: ApplicationRef
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.obtenerUsuario();
    const customQr = localStorage.getItem('casa_coca_qr_custom');
    if (customQr) {
      this.qrDuenoUrl = customQr;
    }
    this.cargarDatosIniciales();
  }

  cargarDatosIniciales(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    // Verificar turno de caja activo
    this.verificarSesionCaja();

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
    this.cargarClientes();

    // Cargar productos
    this.cargarProductos();
  }

  cargarProductos(): void {
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
          err.error?.detail || 'Error al cargar los productos del catálogo.',
          'error'
        );
        this.cdr.detectChanges();
      },
    });
  }

  cargarClientes(buscar: string = ''): void {
    this.apiService.getClientes(buscar).subscribe({
      next: (data) => {
        this.clientes = data || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.clientes = [];
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // FILTRADO Y ESCANEO RÁPIDO
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

  onEscanearEnter(): void {
    if (!this.sesionCaja) {
      this.mostrarToast('No puedes escanear ni vender productos: tu caja está cerrada. Debes abrir caja primero.', 'warning');
      return;
    }
    const term = this.busquedaTexto.trim();
    if (!term) return;

    // 1. Buscar coincidencia exacta por código de barras
    const productoExacto = this.productos.find(
      (p) => p.codigo_barras && p.codigo_barras.toLowerCase() === term.toLowerCase()
    );

    if (productoExacto) {
      this.agregarAlCarrito(productoExacto);
      this.busquedaTexto = '';
      this.filtrarProductos();
      return;
    }

    // 2. Si no hay código exacto pero la lista filtrada tiene 1 solo elemento
    if (this.productosFiltrados.length === 1) {
      this.agregarAlCarrito(this.productosFiltrados[0]);
      this.busquedaTexto = '';
      this.filtrarProductos();
      return;
    }

    // 3. Si hay varios resultados o ninguno, solo filtrar
    this.filtrarProductos();
  }

  // =========================================================================
  // GESTIÓN DEL CARRITO REACTIVO
  // =========================================================================
  agregarAlCarrito(producto: any, cantidad: number = 1): void {
    if (!this.sesionCaja) {
      this.mostrarToast('No puedes agregar productos porque tu caja está cerrada. Debes abrir tu turno de caja en "Caja y Movimientos".', 'warning');
      return;
    }

    if (producto.stock_actual <= 0) {
      this.mostrarToast(`El producto "${producto.nombre}" está agotado.`, 'warning');
      return;
    }

    const itemExistente = this.carrito.find(
      (item) => item.producto.id === producto.id
    );

    if (itemExistente) {
      const nuevaCantidad = itemExistente.cantidad + cantidad;
      if (nuevaCantidad > producto.stock_actual) {
        this.mostrarToast(
          `Stock máximo alcanzado para "${producto.nombre}". Disponible: ${producto.stock_actual}.`,
          'warning'
        );
        return;
      }
      itemExistente.cantidad = nuevaCantidad;
      this.actualizarSubtotalItem(itemExistente);
      this.mostrarToast(`Cantidad actualizada: ${producto.nombre} (${itemExistente.cantidad})`, 'info');
    } else {
      if (cantidad > producto.stock_actual) {
        this.mostrarToast(
          `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock_actual}.`,
          'warning'
        );
        return;
      }
      const nuevoItem: CartItem = {
        producto,
        cantidad,
        precio_unitario: producto.precio_venta,
        descuento_linea: 0,
        subtotal_linea: producto.precio_venta * cantidad,
      };
      this.carrito.push(nuevoItem);
      this.mostrarToast(`Agregado al carrito: ${producto.nombre}`, 'success');
    }

    this.recalcularTotales();
  }

  modificarCantidad(item: CartItem, delta: number): void {
    const nuevaCantidad = item.cantidad + delta;
    if (nuevaCantidad <= 0) {
      this.eliminarDelCarrito(item);
      return;
    }

    if (nuevaCantidad > item.producto.stock_actual) {
      this.mostrarToast(
        `No hay más existencias para "${item.producto.nombre}". Stock: ${item.producto.stock_actual}`,
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
    if (isNaN(cant) || cant < 1) {
      cant = 1;
    }
    if (cant > item.producto.stock_actual) {
      this.mostrarToast(
        `Stock insuficiente para "${item.producto.nombre}". Ajustado a ${item.producto.stock_actual}.`,
        'warning'
      );
      cant = item.producto.stock_actual;
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
  // CÁLCULOS FINANCIEROS Y FORMAS DE PAGO
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
  // GESTIÓN DE CLIENTES
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
  // REGISTRAR VENTA Y EMISIÓN DE TICKET
  // =========================================================================
  get puedeFinalizarVenta(): boolean {
    if (!this.sesionCaja) return false;
    if (this.carrito.length === 0) return false;
    if (this.guardandoVenta) return false;
    return true;
  }

  finalizarVenta(): void {
    if (!this.sesionCaja) {
      this.mostrarToast('No puedes completar la venta porque la caja no está abierta. Debes abrir tu turno de caja primero.', 'warning');
      return;
    }

    if (!this.puedeFinalizarVenta) {
      if (this.carrito.length === 0) {
        this.mostrarToast('El carrito no contiene productos.', 'warning');
      }
      return;
    }

    // FLUJO DE PAGO QR: Primero mostrar el QR del dueño para verificación del pago
    if (this.metodoPago === 'QR') {
      this.modalQrCobro = true;
      this.cdr.detectChanges();
      return;
    }

    // FLUJO EFECTIVO: Asegurar monto recibido adecuado
    if (this.metodoPago === 'EFECTIVO') {
      const total = this.getTotal();
      if ((Number(this.montoRecibido) || 0) < total) {
        this.montoRecibido = total;
        this.vuelto = 0;
      }
    }

    this.ejecutarRegistroVenta();
  }

  cerrarModalQrCobro(): void {
    if (this.guardandoVenta) return;
    this.modalQrCobro = false;
    this.cdr.detectChanges();
  }

  onCambiarQrDueno(event: any): void {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.mostrarToast('Por favor selecciona un archivo de imagen válido (.png, .jpg).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.qrDuenoUrl = reader.result as string;
      try {
        localStorage.setItem('casa_coca_qr_custom', this.qrDuenoUrl);
      } catch (e) {
        console.warn('No se pudo guardar QR en almacenamiento local:', e);
      }
      this.mostrarToast('Imagen del QR del dueño actualizada correctamente.', 'success');
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  restablecerQrDueno(): void {
    localStorage.removeItem('casa_coca_qr_custom');
    this.qrDuenoUrl = '/qr-dueno.png';
    this.mostrarToast('Se restableció la imagen del QR por defecto.', 'info');
    this.cdr.detectChanges();
  }

  confirmarPagoQrYFinalizar(): void {
    if (this.guardandoVenta) return;
    this.errorQrModal = '';
    this.ejecutarRegistroVenta();
  }

  private ejecutarRegistroVenta(): void {
    if (this.guardandoVenta) return;

    if (!this.sesionCaja) {
      this.mostrarToast('No puedes completar la venta: la caja está cerrada.', 'warning');
      return;
    }

    if (this.carrito.length === 0) {
      this.mostrarToast('El carrito no contiene productos.', 'warning');
      return;
    }

    this.guardandoVenta = true;
    this.errorQrModal = '';
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
      })),
    };

    // Guardar una copia profunda e inmutable de los datos actuales para el comprobante
    const snapshotCarrito: CartItem[] = this.carrito.map((it) => ({
      ...it,
      producto: { ...it.producto },
    }));
    const snapshotSubtotal = this.getSubtotal();
    const snapshotDescuento = Number(this.descuentoGlobal) || 0;
    const snapshotTotal = this.getTotal();
    const snapshotMetodoPago = this.metodoPago;
    const snapshotRecibido =
      this.metodoPago === 'EFECTIVO' ? Number(this.montoRecibido) || 0 : snapshotTotal;
    const snapshotVuelto =
      this.metodoPago === 'EFECTIVO' ? Number(this.vuelto) || 0 : 0;
    const snapshotCliente = this.clienteSeleccionado
      ? { ...this.clienteSeleccionado }
      : { nombre_completo: 'Cliente Mostrador', documento_identidad: 'S/N' };
    const snapshotReferenciaQr = this.qrReferenciaPago?.trim() || null;

    this.apiService.registrarVenta(payload).subscribe({
      next: (venta) => {
        this.ngZone.run(() => {
          // 1. Cerrar inmediatamente el modal del QR y desactivar estado de carga
          this.guardandoVenta = false;
          this.modalQrCobro = false;
          this.errorQrModal = '';
          this.ventaFinalizada = venta;

          // 2. Construir datos completos e inmutables del comprobante para el ticket
          this.datosTicket = {
            comprobante: venta.numero_comprobante || 'V-TICKET',
            fecha: venta.fecha_venta || new Date().toISOString(),
            cajero: this.usuario?.nombre_completo || 'Cajero de Turno',
            cliente: snapshotCliente,
            metodo_pago: snapshotMetodoPago,
            items: snapshotCarrito,
            subtotal: snapshotSubtotal,
            descuento: snapshotDescuento,
            total: snapshotTotal,
            recibido: snapshotRecibido,
            vuelto: snapshotVuelto,
            referencia_qr: snapshotReferenciaQr,
          };

          // 3. Descontar stock localmente para actualización inmediata
          snapshotCarrito.forEach((item) => {
            const prod = this.productos.find((p) => p.id === item.producto.id);
            if (prod) {
              prod.stock_actual = Math.max(0, prod.stock_actual - item.cantidad);
            }
          });
          this.filtrarProductos();

          // 4. Limpiar carrito en memoria
          this.carrito = [];
          this.descuentoGlobal = 0;
          this.montoRecibido = 0;
          this.montoRecibidoManual = false;
          this.vuelto = 0;
          this.qrReferenciaPago = '';

          // 5. Abrir automáticamente el modal de comprobante impreso
          this.modalTicket = true;
          this.mostrarToast(
            `¡Venta ${venta.numero_comprobante} registrada exitosamente!`,
            'success'
          );

          // 6. Forzar renderizado y ciclo de detección sincrónico e inmediato
          this.cdr.markForCheck();
          this.cdr.detectChanges();
          try {
            this.appRef.tick();
          } catch (_) {}

          // Refuerzo en el siguiente microciclo para asegurar renderizado visual
          setTimeout(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
            try {
              this.appRef.tick();
            } catch (_) {}
          }, 10);
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          this.guardandoVenta = false;
          const msg =
            err.error?.detail ||
            (typeof err.error === 'string'
              ? err.error
              : 'Error al procesar la venta. Verifique la conexión.');
          this.errorQrModal = msg;
          this.mostrarToast(msg, 'error');
          this.cdr.markForCheck();
          this.cdr.detectChanges();
          try {
            this.appRef.tick();
          } catch (_) {}
        });
      },
    });
  }

  imprimirTicket(): void {
    window.print();
  }

  cerrarTicket(): void {
    this.modalTicket = false;
    this.modalQrCobro = false;
    this.ventaFinalizada = null;
    this.datosTicket = null;
    this.errorQrModal = '';
    this.cdr.detectChanges();
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
    if (!this.usuario || !this.usuario.nombre_completo) return 'EM';
    const partes = this.usuario.nombre_completo.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  // =========================================================================
  // MOVIMIENTOS DE CAJA DESDE POS (INGRESOS Y EGRESOS DIRECTOS)
  // =========================================================================
  verificarSesionCaja(): void {
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
  }

  obtenerUrlImagen(url: string | null | undefined): string {
    return this.apiService.obtenerUrlImagen(url);
  }

  cerrarSesion(): void {
    this.authService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
