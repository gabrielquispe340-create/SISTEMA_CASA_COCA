import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export function obtenerBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.host;
    // Si se accede a través de un túnel público de desarrollo (Dev Tunnels / Codespaces)
    if (host.includes('-4200.')) {
      return `${window.location.protocol}//${host.replace('-4200.', '-8000.')}`;
    }
  }
  return 'http://127.0.0.1:8000';
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private get baseUrl(): string {
    return obtenerBaseUrl();
  }
  private get authUrl(): string {
    return `${this.baseUrl}/api/auth`;
  }
  private TOKEN_KEY = 'sistema_tienda_token';
  private USER_KEY = 'sistema_tienda_usuario';
  private REMEMBER_KEY = 'sistema_tienda_recordar_username';

  constructor(private http: HttpClient) {}

  /**
   * Envía credenciales en formato OAuth2PasswordRequestForm al backend de FastAPI
   */
  login(username: string, password: string): Observable<any> {
    const body = new HttpParams().set('username', username).set('password', password);
    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    return this.http.post(`${this.authUrl}/login`, body.toString(), { headers });
  }

  /**
   * Verifica la conexión en tiempo real con el backend en Python y Supabase
   */
  verificarEstadoServidor(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/health`);
  }

  guardarSesion(token: string, usuario: any): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(usuario));
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
  }

  obtenerToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || localStorage.getItem('token');
  }

  obtenerUsuario(): any {
    const raw = localStorage.getItem(this.USER_KEY) || localStorage.getItem('usuario');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  guardarUsuarioRecordado(username: string): void {
    localStorage.setItem(this.REMEMBER_KEY, username);
  }

  obtenerUsuarioRecordado(): string {
    return localStorage.getItem(this.REMEMBER_KEY) || '';
  }

  limpiarUsuarioRecordado(): void {
    localStorage.removeItem(this.REMEMBER_KEY);
  }

  cerrarSesion(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }

  estaAutenticado(): boolean {
    return !!this.obtenerToken() && !!this.obtenerUsuario();
  }

  obtenerRol(): string | null {
    const usuario = this.obtenerUsuario();
    return usuario?.rol?.nombre || null;
  }
}
