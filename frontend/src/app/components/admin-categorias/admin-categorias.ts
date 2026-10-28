import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api.service';

interface PlantillaCategoria {
  nombre: string;
  descripcion: string;
  etiqueta: string;
}

@Component({
  selector: 'app-admin-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-categorias.html',
  styleUrl: './admin-categorias.css',
})
export class AdminCategorias implements OnInit {
  usuarioSesion: any = null;
  categorias: any[] = [];
  cargando = false;
  guardando = false;

  // Filtros en tiempo real
  filtroTexto = '';
  filtroEstado: 'TODAS' | 'ACTIVAS' | 'INACTIVAS' = 'TODAS';

  // Notificación visual (Toast)
  mensajeNotificacion = '';
  tipoNotificacion: 'success' | 'error' | '' = '';

  // Modal Crear / Editar Categoría
  modalAbierto = false;
  modoEdicion = false;
  errorModal = '';

  formulario = {
    id: 0,
    nombre: '',
    descripcion: '',
    activo: true,
  };

  // Plantillas sugeridas según el Caso de Uso CU06
  plantillasRubro: PlantillaCategoria[] = [
    {
      nombre: 'Cervezas',
      descripcion: 'Cervezas nacionales, importadas, artesanales, latas y six-packs',
      etiqueta: 'Cervezas',
    },
    {
      nombre: 'Vinos',
      descripcion: 'Vinos tintos, blancos, rosados, espumantes y sangrías',
      etiqueta: 'Vinos',
    },
    {
      nombre: 'Licores',
      descripcion: 'Ron, whisky, vodka, singani, tequila, gin y aperitivos',
      etiqueta: 'Licores',
    },
    {
      nombre: 'Gaseosas',
      descripcion: 'Refrescos carbonatados personales, retornables y familiares',
      etiqueta: 'Gaseosas',
    },
    {
      nombre: 'Jugos y Aguas',
      descripcion: 'Jugos naturales, néctares, aguas minerales, isotónicos y energizantes',
      etiqueta: 'Jugos',
    },
    {
      nombre: 'Snacks y Picadas',
      descripcion: 'Papas fritas, maní, nachos, galletas, chocolates y complementos',
      etiqueta: 'Snacks',
    },
  ];

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
    this.cargarCategorias();
  }

  cargarCategorias(): void {
    this.cargando = true;
    this.cdr.detectChanges();

    this.apiService.getCategorias().subscribe({
      next: (lista) => {
        this.categorias = lista || [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.mostrarToast('No se pudieron cargar las categorías del catálogo.', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // Lista filtrada instantáneamente
  get categoriasFiltradas(): any[] {
    return this.categorias.filter((cat) => {
      const texto = this.filtroTexto.trim().toLowerCase();
      const coincideTexto =
        !texto ||
        (cat.nombre && cat.nombre.toLowerCase().includes(texto)) ||
        (cat.descripcion && cat.descripcion.toLowerCase().includes(texto));

      const coincideEstado =
        this.filtroEstado === 'TODAS' ||
        (this.filtroEstado === 'ACTIVAS' && cat.activo === true) ||
        (this.filtroEstado === 'INACTIVAS' && cat.activo === false);

      return coincideTexto && coincideEstado;
    });
  }

  // KPIs calculados en tiempo real
  get totalCategorias(): number {
    return this.categorias.length;
  }

  get totalActivas(): number {
    return this.categorias.filter((c) => c.activo).length;
  }

  get totalInactivas(): number {
    return this.categorias.filter((c) => !c.activo).length;
  }

  get totalProductosClasificados(): number {
    return this.categorias.reduce((acc, c) => acc + (Number(c.cantidad_productos) || 0), 0);
  }

  existePlantilla(nombre: string): boolean {
    return this.categorias.some(
      (c) => (c.nombre || '').trim().toLowerCase() === nombre.trim().toLowerCase(),
    );
  }

  usarPlantillaRapida(plantilla: PlantillaCategoria): void {
    if (this.existePlantilla(plantilla.nombre)) {
      this.filtroTexto = plantilla.nombre;
      this.cdr.detectChanges();
      return;
    }
    this.modoEdicion = false;
    this.errorModal = '';
    this.formulario = {
      id: 0,
      nombre: plantilla.nombre,
      descripcion: plantilla.descripcion,
      activo: true,
    };
    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  aplicarPlantillaEnModal(plantilla: PlantillaCategoria): void {
    this.formulario.nombre = plantilla.nombre;
    this.formulario.descripcion = plantilla.descripcion;
    this.cdr.detectChanges();
  }

  abrirModalNueva(): void {
    this.modoEdicion = false;
    this.errorModal = '';
    this.formulario = {
      id: 0,
      nombre: '',
      descripcion: '',
      activo: true,
    };
    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  abrirModalEditar(categoria: any): void {
    this.modoEdicion = true;
    this.errorModal = '';
    this.formulario = {
      id: categoria.id,
      nombre: categoria.nombre || '',
      descripcion: categoria.descripcion || '',
      activo: categoria.activo !== false,
    };
    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModal(): void {
    if (this.guardando) return;
    this.modalAbierto = false;
    this.errorModal = '';
    this.cdr.detectChanges();
  }

  guardarCategoria(): void {
    this.errorModal = '';
    const nombre = this.formulario.nombre.trim();
    const descripcion = this.formulario.descripcion ? this.formulario.descripcion.trim() : '';

    if (!nombre) {
      this.errorModal = 'Por favor ingresa el nombre de la categoría (ej. Cervezas, Vinos, Licores).';
      this.cdr.detectChanges();
      return;
    }

    this.guardando = true;
    this.cdr.detectChanges();

    const payload = {
      nombre,
      descripcion: descripcion || null,
      activo: this.formulario.activo,
    };

    if (!this.modoEdicion) {
      this.apiService.createCategoria(payload).subscribe({
        next: (creada) => {
          this.guardando = false;
          this.modalAbierto = false;
          this.cargarCategorias();
          this.mostrarToast(
            `Categoría "${creada.nombre}" registrada correctamente en el catálogo.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo registrar la categoría.';
          this.cdr.detectChanges();
        },
      });
    } else {
      this.apiService.updateCategoria(this.formulario.id, payload).subscribe({
        next: (actualizada) => {
          this.guardando = false;
          this.modalAbierto = false;
          this.cargarCategorias();
          this.mostrarToast(
            `Categoría "${actualizada.nombre}" actualizada correctamente.`,
            'success',
          );
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.guardando = false;
          this.errorModal = err.error?.detail || 'No se pudo actualizar la categoría.';
          this.cdr.detectChanges();
        },
      });
    }
  }

  cambiarEstadoCategoria(categoria: any): void {
    this.apiService.toggleEstadoCategoria(categoria.id).subscribe({
      next: (actualizada) => {
        categoria.activo = actualizada.activo;
        const estadoTxt = actualizada.activo ? 'activada' : 'desactivada';
        this.mostrarToast(
          `Categoría "${actualizada.nombre}" ${estadoTxt} correctamente.`,
          'success',
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarToast(
          err.error?.detail || 'No se pudo cambiar el estado de la categoría.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
  }

  eliminarCategoria(categoria: any): void {
    if ((categoria.cantidad_productos || 0) > 0) {
      this.mostrarToast(
        `La categoría "${categoria.nombre}" tiene ${categoria.cantidad_productos} producto(s) asociado(s). Desactívala o reasigna sus productos antes de eliminarla.`,
        'error',
      );
      return;
    }

    this.apiService.deleteCategoria(categoria.id).subscribe({
      next: () => {
        this.cargarCategorias();
        this.mostrarToast(`Categoría "${categoria.nombre}" eliminada del catálogo.`, 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarToast(
          err.error?.detail || 'No se pudo eliminar la categoría seleccionada.',
          'error',
        );
        this.cdr.detectChanges();
      },
    });
  }

  limpiarFiltros(): void {
    this.filtroTexto = '';
    this.filtroEstado = 'TODAS';
    this.cdr.detectChanges();
  }

  obtenerEstiloCategoria(nombre: string): string {
    const n = (nombre || '').toLowerCase();
    if (n.includes('cerveza')) return 'cat-amber';
    if (n.includes('vino')) return 'cat-rose';
    if (n.includes('licor') || n.includes('whisky') || n.includes('ron')) return 'cat-purple';
    if (n.includes('gaseosa') || n.includes('refresco')) return 'cat-blue';
    if (n.includes('jugo') || n.includes('agua') || n.includes('energ')) return 'cat-emerald';
    if (n.includes('snack') || n.includes('dulce') || n.includes('picada')) return 'cat-orange';
    return 'cat-indigo';
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
