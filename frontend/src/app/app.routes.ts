import { Routes } from '@angular/router';
import { Login } from './components/login/login';
import { AdminDashboard } from './components/admin-dashboard/admin-dashboard';
import { AdminReportes } from './components/admin-reportes/admin-reportes';
import { AdminProductos } from './components/admin-productos/admin-productos';
import { AdminCategorias } from './components/admin-categorias/admin-categorias';
import { AdminProveedores } from './components/admin-proveedores/admin-proveedores';
import { AdminInventario } from './components/admin-inventario/admin-inventario';
import { AdminVentas } from './components/admin-ventas/admin-ventas';
import { AdminUsuarios } from './components/admin-usuarios/admin-usuarios';
import { AdminBitacora } from './components/admin-bitacora/admin-bitacora';
import { EmpleadoDashboard } from './components/empleado-dashboard/empleado-dashboard';
import { EmpleadoPos } from './components/empleado-pos/empleado-pos';
import { EmpleadoCaja } from './components/empleado-caja/empleado-caja';
import { EmpleadoCatalogo } from './components/empleado-catalogo/empleado-catalogo';
import { adminGuard, empleadoGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },

  // Apartados del Rol Administrador (Protegidos)
  { path: 'admin/dashboard', component: AdminDashboard, canActivate: [adminGuard] },
  { path: 'admin/reportes', component: AdminReportes, canActivate: [adminGuard] },
  { path: 'admin/productos', component: AdminProductos, canActivate: [adminGuard] },
  { path: 'admin/categorias', component: AdminCategorias, canActivate: [adminGuard] },
  { path: 'admin/proveedores', component: AdminProveedores, canActivate: [adminGuard] },
  { path: 'admin/inventario', component: AdminInventario, canActivate: [adminGuard] },
  { path: 'admin/ventas', component: AdminVentas, canActivate: [adminGuard] },
  { path: 'admin/usuarios', component: AdminUsuarios, canActivate: [adminGuard] },
  { path: 'admin/bitacora', component: AdminBitacora, canActivate: [adminGuard] },

  // Apartados del Rol Empleado (Protegidos)
  { path: 'empleado/dashboard', component: EmpleadoDashboard, canActivate: [empleadoGuard] },
  { path: 'empleado/pos', component: EmpleadoPos, canActivate: [empleadoGuard] },
  { path: 'empleado/caja', component: EmpleadoCaja, canActivate: [empleadoGuard] },
  { path: 'empleado/catalogo', component: EmpleadoCatalogo, canActivate: [empleadoGuard] },
  { path: 'empleado/clientes', redirectTo: 'empleado/dashboard' },

  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' },
];
