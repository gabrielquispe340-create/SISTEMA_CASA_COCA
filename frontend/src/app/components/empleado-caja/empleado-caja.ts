import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth';

export interface DesgloseCorte {
  corte: number;
  tipo: 'billete' | 'moneda';
  label: string;
  cantidad: number;
}

@Component({
  selector: 'app-empleado-caja',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './empleado-caja.html',
  styleUrl: './empleado-caja.css',
})
export class EmpleadoCaja implements OnInit {
  usuario: any = null;
  cargando: boolean = true;
  cajaActual: any = null;


  // Apertura de Caja
  montoInicial: number = 0;
  observacionesApertura: string = '';
  procesandoApertura: boolean = false;
  mostrarCalculadoraDesglose: boolean = false;

  // Desglose de cortes en Bolivianos (Bs.)
  cortesEfectivo: DesgloseCorte[] = [
    { corte: 200, tipo: 'billete', label: 'Bs. 200 (Billete)', cantidad: 0 },
    { corte: 100, tipo: 'billete', label: 'Bs. 100 (Billete)', cantidad: 0 },
    { corte: 50, tipo: 'billete', label: 'Bs. 50 (Billete)', cantidad: 0 },
    { corte: 20, tipo: 'billete', label: 'Bs. 20 (Billete)', cantidad: 0 },
    { corte: 10, tipo: 'billete', label: 'Bs. 10 (Billete)', cantidad: 0 },
    { corte: 5, tipo: 'moneda', label: 'Bs. 5 (Moneda)', cantidad: 0 },
    { corte: 2, tipo: 'moneda', label: 'Bs. 2 (Moneda)', cantidad: 0 },
    { corte: 1, tipo: 'moneda', label: 'Bs. 1 (Moneda)', cantidad: 0 },
    { corte: 0.5, tipo: 'moneda', label: 'Bs. 0.50 (Moneda)', cantidad: 0 },
  ];

  chipsFondoRapido: number[] = [50, 100, 150, 200, 300, 500];

  // Cierre y Arqueo de Caja
  montoFinalReal: number = 0;
  observacionesCierre: string = '';
  procesandoCierre: boolean = false;
  modalConfirmarCierre: boolean = false;

  // Historial de turnos
  historialCajas: any[] = [];
  cargandoHistorial: boolean = false;


  // Modal Comprobante Térmico (Apertura o Cierre)
  modalComprobante: boolean = false;
  tipoComprobante: 'APERTURA' | 'CIERRE' = 'APERTURA';
  datosComprobante: any = null;

  // Toast / Feedback
  toast = {
    visible: false,
    mensaje: '',
    tipo: 'info' as 'success' | 'error' | 'info' | 'warning',
  };
  private toastTimeout: any;

  fechaHoraActual: Date = new Date();
  private relojTimer: any;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.obtenerUsuario();
    if (!this.usuario) {
      this.router.navigate(['/login']);
      return;
    }

    this.relojTimer = setInterval(() => {
      this.fechaHoraActual = new Date();
    }, 1000);

    this.cargarDatosCaja();
  }

  ngOnDestroy(): void {
    if (this.relojTimer) {
      clearInterval(this.relojTimer);
    }
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  // =========================================================================
  // CARGA DE DATOS
  // =========================================================================
  cargarDatosCaja(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.apiService.getCajaActual().subscribe({
      next: (caja) => {
        this.cajaActual = caja;
        this.cargando = false;
        if (caja) {
          const inicial = Number(caja.monto_inicial) || 0;
          const ventasEf = Number(caja.total_ventas_efectivo) || 0;
          const ingresos = Number(caja.total_ingresos) || 0;
          const egresos = Number(caja.total_egresos) || 0;
          this.montoFinalReal = parseFloat(
            (inicial + ventasEf + ingresos - egresos).toFixed(2)
          );
        }
        this.cargarHistorial();
        this.cdr.detectChanges();
      },
      error: () => {
        this.cajaActual = null;
        this.cargando = false;
        this.cargarHistorial();
        this.cdr.detectChanges();
      },
    });
  }

  cargarHistorial(): void {
    this.cargandoHistorial = true;
    this.apiService.getHistorialCajas().subscribe({
      next: (data) => {
        this.historialCajas = data || [];
        this.cargandoHistorial = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.historialCajas = [];
        this.cargandoHistorial = false;
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // APERTURA DE CAJA
  // =========================================================================
  sumarFondoRapido(monto: number): void {
    this.montoInicial = (Number(this.montoInicial) || 0) + monto;
    this.cdr.detectChanges();
  }

  fijarFondoRapido(monto: number): void {
    this.montoInicial = monto;
    this.limpiarDesglose();
    this.cdr.detectChanges();
  }

  limpiarFondo(): void {
    this.montoInicial = 0;
    this.limpiarDesglose();
    this.cdr.detectChanges();
  }

  limpiarDesglose(): void {
    this.cortesEfectivo.forEach((c) => (c.cantidad = 0));
  }

  toggleCalculadoraDesglose(): void {
    this.mostrarCalculadoraDesglose = !this.mostrarCalculadoraDesglose;
    this.cdr.detectChanges();
  }

  actualizarDesglose(item: DesgloseCorte, valorRaw: any): void {
    let cant = parseInt(valorRaw, 10);
    if (isNaN(cant) || cant < 0) cant = 0;
    item.cantidad = cant;

    // Sumar todos los cortes
    const totalDesglose = this.cortesEfectivo.reduce(
      (acc, curr) => acc + curr.corte * curr.cantidad,
      0
    );
    this.montoInicial = parseFloat(totalDesglose.toFixed(2));
    this.cdr.detectChanges();
  }

  abrirCaja(): void {
    if (this.cajaActual) {
      this.mostrarToast('Ya tienes una sesión de caja abierta.', 'warning');
      return;
    }

    const monto = Number(this.montoInicial);
    if (isNaN(monto) || monto < 0) {
      this.mostrarToast('El monto inicial no puede ser negativo.', 'warning');
      return;
    }

    this.procesandoApertura = true;
    this.cdr.detectChanges();

    const payload = {
      monto_inicial: monto,
      observaciones: this.observacionesApertura.trim() || undefined,
    };

    this.apiService.abrirCaja(payload).subscribe({
      next: (cajaCreada) => {
        this.procesandoApertura = false;
        this.cajaActual = cajaCreada;
        this.mostrarToast(
          `¡Caja abierta exitosamente! Turno #${cajaCreada.id} iniciado.`,
          'success'
        );

        // Preparar comprobante de apertura
        this.tipoComprobante = 'APERTURA';
        this.datosComprobante = {
          turnoId: cajaCreada.id,
          fecha: cajaCreada.fecha_apertura,
          cajero: this.usuario?.nombre_completo || 'Empleado',
          montoInicial: Number(cajaCreada.monto_inicial) || 0,
          observaciones: cajaCreada.observaciones || 'Sin observaciones.',
        };
        this.modalComprobante = true;

        this.montoInicial = 0;
        this.observacionesApertura = '';
        this.limpiarDesglose();
        this.cargarHistorial();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.procesandoApertura = false;
        const msg =
          err.error?.detail ||
          'Error al abrir turno de caja. Intente nuevamente.';
        this.mostrarToast(msg, 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // CIERRE Y ARQUEO DE CAJA
  // =========================================================================
  get totalEsperadoActual(): number {
    if (!this.cajaActual) return 0;
    const inicial = Number(this.cajaActual.monto_inicial) || 0;
    const ventasEf = Number(this.cajaActual.total_ventas_efectivo) || 0;
    const ingresos = Number(this.cajaActual.total_ingresos) || 0;
    const egresos = Number(this.cajaActual.total_egresos) || 0;
    return parseFloat((inicial + ventasEf + ingresos - egresos).toFixed(2));
  }

  get diferenciaArqueo(): number {
    const real = Number(this.montoFinalReal) || 0;
    return real - this.totalEsperadoActual;
  }

  abrirModalCierre(): void {
    if (!this.cajaActual) {
      this.mostrarToast('No hay ninguna caja abierta para cerrar.', 'warning');
      return;
    }
    this.montoFinalReal = this.totalEsperadoActual;
    this.observacionesCierre = '';
    this.modalConfirmarCierre = true;
    this.cdr.detectChanges();
  }

  cerrarModalCierre(): void {
    this.modalConfirmarCierre = false;
    this.cdr.detectChanges();
  }

  confirmarCierreCaja(): void {
    const real = Number(this.montoFinalReal);
    if (isNaN(real) || real < 0) {
      this.mostrarToast('El monto final contado no puede ser negativo.', 'warning');
      return;
    }

    this.procesandoCierre = true;
    this.cdr.detectChanges();

    const payload = {
      monto_final_real: real,
      observaciones: this.observacionesCierre.trim() || undefined,
    };

    this.apiService.cerrarCaja(payload).subscribe({
      next: (cajaCerrada) => {
        this.procesandoCierre = false;
        this.modalConfirmarCierre = false;
        this.mostrarToast(
          `Caja #${cajaCerrada.id} cerrada y arqueada exitosamente.`,
          'success'
        );

        // Preparar comprobante de arqueo
        this.tipoComprobante = 'CIERRE';
        this.datosComprobante = {
          turnoId: cajaCerrada.id,
          fechaApertura: cajaCerrada.fecha_apertura,
          fechaCierre: cajaCerrada.fecha_cierre,
          cajero: this.usuario?.nombre_completo || 'Empleado',
          montoInicial: Number(cajaCerrada.monto_inicial) || 0,
          ventasEfectivo: Number(cajaCerrada.total_ventas_efectivo) || 0,
          totalIngresos: Number(cajaCerrada.total_ingresos) || 0,
          totalEgresos: Number(cajaCerrada.total_egresos) || 0,
          ventasOtros: Number(cajaCerrada.total_ventas_otros) || 0,
          montoEsperado: Number(cajaCerrada.monto_final_esperado) || 0,
          montoReal: Number(cajaCerrada.monto_final_real) || 0,
          diferencia: Number(cajaCerrada.diferencia) || 0,
          observaciones: cajaCerrada.observaciones || 'Arqueo sin observaciones.',
        };
        this.modalComprobante = true;

        this.cajaActual = null;
        this.cargarHistorial();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.procesandoCierre = false;
        const msg =
          err.error?.detail || 'Error al cerrar la caja. Intente nuevamente.';
        this.mostrarToast(msg, 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // DETALLES E IMPRESIÓN DE COMPROBANTE
  // =========================================================================
  verDetalleTurno(item: any): void {
    if (item.estado === 'ABIERTA') {
      this.tipoComprobante = 'APERTURA';
      this.datosComprobante = {
        turnoId: item.id,
        fecha: item.fecha_apertura,
        cajero: item.usuario_nombre || this.usuario?.nombre_completo || 'Empleado',
        montoInicial: Number(item.monto_inicial) || 0,
        observaciones: item.observaciones || 'Turno actualmente en curso.',
      };
    } else {
      this.tipoComprobante = 'CIERRE';
      this.datosComprobante = {
        turnoId: item.id,
        fechaApertura: item.fecha_apertura,
        fechaCierre: item.fecha_cierre,
        cajero: item.usuario_nombre || this.usuario?.nombre_completo || 'Empleado',
        montoInicial: Number(item.monto_inicial) || 0,
        ventasEfectivo: Number(item.total_ventas_efectivo) || 0,
        totalIngresos: Number(item.total_ingresos) || 0,
        totalEgresos: Number(item.total_egresos) || 0,
        ventasOtros: Number(item.total_ventas_otros) || 0,
        montoEsperado: Number(item.monto_final_esperado) || 0,
        montoReal: Number(item.monto_final_real) || 0,
        diferencia: Number(item.diferencia) || 0,
        observaciones: item.observaciones || 'Arqueo de turno finalizado.',
      };
    }
    this.modalComprobante = true;
    this.cdr.detectChanges();
  }

  cerrarModalComprobante(): void {
    this.modalComprobante = false;
    this.cdr.detectChanges();
  }

  imprimirComprobante(): void {
    window.print();
  }

  irAPuntoDeVenta(): void {
    this.router.navigate(['/empleado/pos']);
  }

  // =========================================================================
  // AUXILIARES
  // =========================================================================
  obtenerIniciales(): string {
    if (!this.usuario?.nombre_completo) return 'E';
    return this.usuario.nombre_completo.charAt(0).toUpperCase();
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
    }, 4000);
  }

  cerrarToast(): void {
    this.toast.visible = false;
    this.cdr.detectChanges();
  }
}
