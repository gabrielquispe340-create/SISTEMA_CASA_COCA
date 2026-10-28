import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Guard para proteger rutas exclusivas de ADMINISTRADOR
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.estaAutenticado()) {
    router.navigate(['/login']);
    return false;
  }

  const rol = authService.obtenerRol();
  if (rol === 'ADMIN') {
    return true;
  }

  if (rol === 'EMPLEADO') {
    router.navigate(['/empleado/dashboard']);
    return false;
  }

  router.navigate(['/login']);
  return false;
};

/**
 * Guard para proteger rutas de EMPLEADO (permitiendo también a ADMIN)
 */
export const empleadoGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.estaAutenticado()) {
    router.navigate(['/login']);
    return false;
  }

  const rol = authService.obtenerRol();
  if (rol === 'EMPLEADO' || rol === 'ADMIN') {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
