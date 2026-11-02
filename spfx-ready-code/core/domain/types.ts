export interface Movimiento {
  // Campos semánticos normalizados (los esenciales)
  fecha: Date | null;
  cod: string;
  desc: string;
  ref: string;
  debito: number;
  credito: number;
  mov: number; // debito - credito
  
  // La fila original completa para poder armar plantillas personalizadas
  filaOriginal: any[];
}

export type MapeoColumnas = {
  fecha?: number;
  cuenta?: number;
  desccta?: number;
  ref?: number;
  debito?: number;
  credito?: number;
  importe?: number;
  asiento?: number;
  saldo?: number;
};

export interface ColumnaTemplate {
  id: string;
  titulo: string; // Nombre de la columna en el Excel final
  // Origen puede ser un campo semántico o el índice (number) de una columna del Excel original
  origen: 'fecha' | 'cod' | 'desc' | 'ref' | 'debito' | 'credito' | 'mov' | number; 
}

export interface ResultadoAnalisis {
  filas: Movimiento[];
  mapa: MapeoColumnas;
  filaEnc: number; // Índice de la fila de encabezados en el original
  encabezadosOriginales: string[]; // Nombres de las columnas originales
  diaPrimero: boolean;
  modoImporte: 'debe-haber' | 'importe' | 'ninguno';
  cuentas: number;
  cuentasConNombre: number;
  sinDescripcion: number;
  totalDebito: number;
  totalCredito: number;
}
