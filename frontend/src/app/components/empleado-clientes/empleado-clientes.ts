import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-empleado-clientes',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './empleado-clientes.html',
  styleUrl: './empleado-clientes.css',
})
export class EmpleadoClientes {}
