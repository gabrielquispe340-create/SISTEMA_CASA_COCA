import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://127.0.0.1:8000/api';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private getHeaders(): { headers: HttpHeaders } {
    const token = this.authService.obtenerToken();
    return {
      headers: new HttpHeaders({
        Authorization: token ? `Bearer ${token}` : '',
      }),
    };
  }

  // Usuarios y Roles (Admin)
  getRoles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/usuarios/roles`, this.getHeaders());
  }
  getUsuarios(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/usuarios/`, this.getHeaders());
  }
  createUsuario(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/usuarios/`, data, this.getHeaders());
  }
  updateUsuario(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/usuarios/${id}`, data, this.getHeaders());
  }
  toggleEstadoUsuario(id: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/usuarios/${id}/estado`, {}, this.getHeaders());
  }

  // Catálogo: Categorías, Proveedores y Productos (CU06)
  getCategorias(buscar: string = '', soloActivos?: boolean): Observable<any[]> {
    const params: string[] = [];
    if (buscar && buscar.trim()) params.push(`buscar=${encodeURIComponent(buscar.trim())}`);
    if (soloActivos !== undefined) params.push(`solo_activos=${soloActivos}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/catalogo/categorias${query}`, this.getHeaders());
  }
  createCategoria(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/catalogo/categorias`, data, this.getHeaders());
  }
  updateCategoria(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/catalogo/categorias/${id}`, data, this.getHeaders());
  }
  toggleEstadoCategoria(id: number): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/catalogo/categorias/${id}/estado`,
      {},
      this.getHeaders(),
    );
  }
  deleteCategoria(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/catalogo/categorias/${id}`, this.getHeaders());
  }

  // CU12: Gestión de Proveedores (Admin)
  getProveedores(buscar: string = '', soloActivos?: boolean): Observable<any[]> {
    const params: string[] = [];
    if (buscar && buscar.trim()) params.push(`buscar=${encodeURIComponent(buscar.trim())}`);
    if (soloActivos !== undefined) params.push(`solo_activos=${soloActivos}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/catalogo/proveedores${query}`, this.getHeaders());
  }
  createProveedor(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/catalogo/proveedores`, data, this.getHeaders());
  }
  updateProveedor(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/catalogo/proveedores/${id}`, data, this.getHeaders());
  }
  toggleEstadoProveedor(id: number): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/catalogo/proveedores/${id}/estado`,
      {},
      this.getHeaders(),
    );
  }
  deleteProveedor(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/catalogo/proveedores/${id}`, this.getHeaders());
  }

  // CU07: Gestión de Productos (Admin / Empleado)
  getProductos(
    buscar: string = '',
    categoriaId?: number,
    soloActivos?: boolean,
  ): Observable<any[]> {
    const params: string[] = [];
    if (buscar && buscar.trim()) params.push(`buscar=${encodeURIComponent(buscar.trim())}`);
    if (categoriaId !== undefined && categoriaId > 0) params.push(`categoria_id=${categoriaId}`);
    if (soloActivos !== undefined) params.push(`solo_activos=${soloActivos}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/catalogo/productos${query}`, this.getHeaders());
  }
  getProductoPorCodigo(codigo: string): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/catalogo/productos/codigo/${encodeURIComponent(codigo)}`,
      this.getHeaders(),
    );
  }
  createProducto(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/catalogo/productos`, data, this.getHeaders());
  }
  updateProducto(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/catalogo/productos/${id}`, data, this.getHeaders());
  }
  updatePrecioProducto(
    id: number,
    data: { precio_compra: number; precio_venta: number },
  ): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/catalogo/productos/${id}/precio`,
      data,
      this.getHeaders(),
    );
  }
  toggleEstadoProducto(id: number): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/catalogo/productos/${id}/estado`,
      {},
      this.getHeaders(),
    );
  }
  subirImagenProducto(id: number, archivo: File): Observable<any> {
    const formData = new FormData();
    formData.append('archivo', archivo);
    const token = this.authService.obtenerToken();
    const headers = new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : '',
    });
    return this.http.post<any>(
      `${this.apiUrl}/catalogo/productos/${id}/imagen`,
      formData,
      { headers }
    );
  }
  obtenerUrlImagen(imagenUrl: string | null | undefined): string {
    if (!imagenUrl) return '';
    if (imagenUrl.startsWith('http://') || imagenUrl.startsWith('https://')) {
      return imagenUrl;
    }
    const base = this.apiUrl.replace(/\/api$/, '');
    return `${base}${imagenUrl.startsWith('/') ? '' : '/'}${imagenUrl}`;
  }

  // Sesiones y Arqueo de Caja (Empleado / Admin)
  getCajaActual(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/caja/actual`, this.getHeaders());
  }
  abrirCaja(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/caja/abrir`, data, this.getHeaders());
  }
  cerrarCaja(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/caja/cerrar`, data, this.getHeaders());
  }
  getHistorialCajas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/caja/historial`, this.getHeaders());
  }
  getMovimientosCaja(sesionId?: number): Observable<any[]> {
    const query = sesionId ? `?sesion_id=${sesionId}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/caja/movimientos${query}`, this.getHeaders());
  }
  registrarMovimientoCaja(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/caja/movimientos`, data, this.getHeaders());
  }

  // Clientes y Ventas POS
  getClientes(buscar: string = ''): Observable<any[]> {
    const query = buscar ? `?buscar=${encodeURIComponent(buscar)}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/ventas/clientes${query}`, this.getHeaders());
  }
  createCliente(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/ventas/clientes`, data, this.getHeaders());
  }
  registrarVenta(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/ventas/`, data, this.getHeaders());
  }
  getVentas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/ventas/`, this.getHeaders());
  }
  getVentaPorId(ventaId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/ventas/${ventaId}`, this.getHeaders());
  }
  anularVenta(ventaId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/ventas/${ventaId}/anular`, {}, this.getHeaders());
  }

  // Inventario, Stock Disponible (CU09), Compras y Kardex
  getStockDisponible(filtros?: {
    buscar?: string;
    categoria_id?: number;
    nivel?: string;
    solo_activos?: boolean;
  }): Observable<any> {
    const params: string[] = [];
    if (filtros?.buscar && filtros.buscar.trim()) {
      params.push(`buscar=${encodeURIComponent(filtros.buscar.trim())}`);
    }
    if (filtros?.categoria_id && filtros.categoria_id > 0) {
      params.push(`categoria_id=${filtros.categoria_id}`);
    }
    if (filtros?.nivel && filtros.nivel !== 'TODOS') {
      params.push(`nivel=${encodeURIComponent(filtros.nivel)}`);
    }
    if (filtros?.solo_activos !== undefined) {
      params.push(`solo_activos=${filtros.solo_activos}`);
    }
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any>(
      `${this.apiUrl}/inventario/stock-disponible${query}`,
      this.getHeaders(),
    );
  }
  getCompras(filtros?: any): Observable<any[]> {
    let params: string[] = [];
    if (typeof filtros === 'string') {
      if (filtros.trim()) params.push(`buscar=${encodeURIComponent(filtros.trim())}`);
    } else if (filtros) {
      if (filtros.buscar?.trim()) params.push(`buscar=${encodeURIComponent(filtros.buscar.trim())}`);
      if (filtros.proveedor_id && filtros.proveedor_id !== 'TODOS') params.push(`proveedor_id=${filtros.proveedor_id}`);
      if (filtros.estado && filtros.estado !== 'TODOS') params.push(`estado=${encodeURIComponent(filtros.estado)}`);
      if (filtros.fecha_desde) params.push(`fecha_desde=${encodeURIComponent(filtros.fecha_desde)}`);
      if (filtros.fecha_hasta) params.push(`fecha_hasta=${encodeURIComponent(filtros.fecha_hasta)}`);
    }
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/inventario/compras${query}`, this.getHeaders());
  }
  getDetalleCompra(compraId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/inventario/compras/${compraId}`, this.getHeaders());
  }
  registrarCompra(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/inventario/compras`, data, this.getHeaders());
  }
  anularCompra(compraId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/inventario/compras/${compraId}/anular`, {}, this.getHeaders());
  }
  registrarAjusteInventario(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/inventario/ajustes`, data, this.getHeaders());
  }
  getKardex(productoId?: number): Observable<any[]> {
    const query = productoId ? `?producto_id=${productoId}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/inventario/kardex${query}`, this.getHeaders());
  }

  // CU11: Alertas de Stock Mínimo y Productos Próximos a Vencer (Admin)
  getAlertasInventario(
    diasUmbral: number = 30,
    incluirVigentes: boolean = false,
  ): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/inventario/alertas?dias_umbral=${diasUmbral}&incluir_vigentes=${incluirVigentes}`,
      this.getHeaders(),
    );
  }
  generarAlertasInventario(
    diasUmbral: number = 30,
    incluirVigentes: boolean = false,
  ): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/inventario/alertas/generar?dias_umbral=${diasUmbral}&incluir_vigentes=${incluirVigentes}`,
      {},
      this.getHeaders(),
    );
  }
  updateVencimientoProducto(
    productoId: number,
    data: { fecha_vencimiento?: string | null; lote?: string; stock_minimo?: number },
  ): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/inventario/productos/${productoId}/vencimiento`,
      data,
      this.getHeaders(),
    );
  }

  // Reportes y Analítica Financiera (Admin)
  getReporteDashboard(fechaInicio?: string, fechaFin?: string): Observable<any> {
    const params: string[] = [];
    if (fechaInicio) params.push(`fecha_inicio=${fechaInicio}`);
    if (fechaFin) params.push(`fecha_fin=${fechaFin}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any>(`${this.apiUrl}/reportes/dashboard${query}`, this.getHeaders());
  }

  getReporteVentasFiltradas(filtros?: {
    fechaInicio?: string;
    fechaFin?: string;
    usuarioId?: number;
    categoriaId?: number;
    productoId?: number;
    metodoPago?: string;
  }): Observable<any> {
    const params: string[] = [];
    if (filtros?.fechaInicio) params.push(`fecha_inicio=${filtros.fechaInicio}`);
    if (filtros?.fechaFin) params.push(`fecha_fin=${filtros.fechaFin}`);
    if (filtros?.usuarioId && filtros.usuarioId > 0) params.push(`usuario_id=${filtros.usuarioId}`);
    if (filtros?.categoriaId && filtros.categoriaId > 0) params.push(`categoria_id=${filtros.categoriaId}`);
    if (filtros?.productoId && filtros.productoId > 0) params.push(`producto_id=${filtros.productoId}`);
    if (filtros?.metodoPago && filtros.metodoPago !== 'TODOS') params.push(`metodo_pago=${filtros.metodoPago}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any>(`${this.apiUrl}/reportes/ventas-filtradas${query}`, this.getHeaders());
  }

  getReporteInventarioValorizado(filtros?: {
    categoriaId?: number;
    proveedorId?: number;
    estadoStock?: string;
    busqueda?: string;
  }): Observable<any> {
    const params: string[] = [];
    if (filtros?.categoriaId && filtros.categoriaId > 0) params.push(`categoria_id=${filtros.categoriaId}`);
    if (filtros?.proveedorId && filtros.proveedorId > 0) params.push(`proveedor_id=${filtros.proveedorId}`);
    if (filtros?.estadoStock && filtros.estadoStock !== 'TODOS') params.push(`estado_stock=${filtros.estadoStock}`);
    if (filtros?.busqueda && filtros.busqueda.trim()) params.push(`busqueda=${encodeURIComponent(filtros.busqueda.trim())}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any>(`${this.apiUrl}/reportes/inventario-valorizado${query}`, this.getHeaders());
  }

  getReporteProductosMasVendidos(filtros?: {
    fechaInicio?: string;
    fechaFin?: string;
    categoriaId?: number;
    limit?: number;
  }): Observable<any[]> {
    const params: string[] = [];
    if (filtros?.fechaInicio) params.push(`fecha_inicio=${filtros.fechaInicio}`);
    if (filtros?.fechaFin) params.push(`fecha_fin=${filtros.fechaFin}`);
    if (filtros?.categoriaId && filtros.categoriaId > 0) params.push(`categoria_id=${filtros.categoriaId}`);
    if (filtros?.limit) params.push(`limit=${filtros.limit}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/reportes/productos-mas-vendidos${query}`, this.getHeaders());
  }

  getStockCritico(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/reportes/stock-critico`, this.getHeaders());
  }

  // CU05: Bitácora de Actividades del Sistema (Admin)
  getResumenBitacora(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/bitacora/resumen`, this.getHeaders());
  }
  getBitacora(filtros?: {
    buscar?: string;
    modulo?: string;
    nivel?: string;
    fecha_inicio?: string;
    fecha_fin?: string;
  }): Observable<any[]> {
    const params: string[] = [];
    if (filtros?.buscar) params.push(`buscar=${encodeURIComponent(filtros.buscar)}`);
    if (filtros?.modulo && filtros.modulo !== 'TODOS') {
      params.push(`modulo=${encodeURIComponent(filtros.modulo)}`);
    }
    if (filtros?.nivel && filtros.nivel !== 'TODOS') {
      params.push(`nivel=${encodeURIComponent(filtros.nivel)}`);
    }
    if (filtros?.fecha_inicio) params.push(`fecha_inicio=${filtros.fecha_inicio}`);
    if (filtros?.fecha_fin) params.push(`fecha_fin=${filtros.fecha_fin}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<any[]>(`${this.apiUrl}/bitacora/${query}`, this.getHeaders());
  }
}
