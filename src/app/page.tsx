"use client";

import React, { useCallback, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Loader2, 
  Download, 
  Settings, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Scale, 
  ChevronDown, 
  ChevronUp, 
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultadoAnalisis, ColumnaTemplate } from '@/core/domain/types';

const DEFAULT_TEMPLATE: ColumnaTemplate[] = [
  { id: '1', titulo: 'Fecha', origen: 'fecha' },
  { id: '2', titulo: 'Cód. Cuenta', origen: 'cod' },
  { id: '3', titulo: 'Descripción Cuenta', origen: 'desc' },
  { id: '4', titulo: 'Referencia', origen: 'ref' },
  { id: '5', titulo: 'Movimiento', origen: 'mov' },
];

export default function HomePage() {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<ResultadoAnalisis | null>(null);
  
  const [template, setTemplate] = useState<ColumnaTemplate[]>(DEFAULT_TEMPLATE);
  const [showEditor, setShowEditor] = useState(false);
  const [showAccountSummary, setShowAccountSummary] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [incluirApertura, setIncluirApertura] = useState<boolean>(true);

  const workerRef = useRef<Worker | null>(null);

  const processFile = useCallback((file: File, options?: { incluirApertura?: boolean }) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      setStatus('error');
      setErrorMsg('Por favor, subí un archivo de Excel (.xlsx, .xls) o CSV.');
      return;
    }

    setCurrentFile(file);
    setStatus('processing');
    setProgressMsg('Iniciando...');
    
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../lib/worker.ts', import.meta.url));
    }
    
    workerRef.current.onmessage = (e) => {
      const { type, message, result: workerResult, error } = e.data;
      if (type === 'progress') {
        setProgressMsg(message);
      } else if (type === 'success') {
        setResult(workerResult);
        setStatus('success');
      } else if (type === 'error') {
        setErrorMsg(error);
        setStatus('error');
      }
    };

    const incAp = options?.incluirApertura !== undefined ? options.incluirApertura : incluirApertura;
    workerRef.current.postMessage({ file, opciones: { incluirApertura: incAp } });
  }, [incluirApertura]);

  const handleToggleApertura = (checked: boolean) => {
    setIncluirApertura(checked);
    if (currentFile) {
      processFile(currentFile, { incluirApertura: checked });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
  };

  const obtenerValor = (fila: any, origen: ColumnaTemplate['origen']) => {
    if (origen === 'fecha') return fila.fecha ? new Date(fila.fecha).toLocaleDateString('es-AR') : '';
    if (typeof origen === 'string') return fila[origen] ?? '';
    if (typeof origen === 'number') return fila.filaOriginal[origen] ?? '';
    return '';
  };

  const diffCuadratura = useMemo(() => {
    if (!result) return 0;
    return Math.round(Math.abs(result.totalDebito - result.totalCredito) * 100) / 100;
  }, [result]);

  const esCuadrado = diffCuadratura < 0.01;

  const rangoFechas = useMemo(() => {
    if (!result || !result.filas.length) return null;
    let min: Date | null = null;
    let max: Date | null = null;
    for (const f of result.filas) {
      if (f.fecha) {
        const d = new Date(f.fecha);
        if (!isNaN(d.getTime())) {
          if (!min || d < min) min = d;
          if (!max || d > max) max = d;
        }
      }
    }
    if (!min || !max) return null;
    return {
      desde: min.toLocaleDateString('es-AR'),
      hasta: max.toLocaleDateString('es-AR')
    };
  }, [result]);

  const resumenCuentas = useMemo(() => {
    if (!result) return [];
    const agrupado: Record<string, { cod: string; desc: string; cant: number; debito: number; credito: number; mov: number }> = {};
    for (const f of result.filas) {
      const key = f.cod || '(Sin código)';
      if (!agrupado[key]) {
        agrupado[key] = {
          cod: f.cod || '-',
          desc: f.desc || '(Sin descripción)',
          cant: 0,
          debito: 0,
          credito: 0,
          mov: 0
        };
      }
      agrupado[key].cant++;
      agrupado[key].debito += f.debito;
      agrupado[key].credito += f.credito;
      agrupado[key].mov += f.mov;
    }
    return Object.values(agrupado).sort((a, b) => b.cant - a.cant);
  }, [result]);

  const handleDownload = async (format: 'xlsx' | 'csv') => {
    if (!result) return;
    const xlsx = await import('xlsx');
    
    const data = result.filas.map(f => {
      const row: Record<string, any> = {};
      template.forEach(col => {
        row[col.titulo] = obtenerValor(f, col.origen);
      });
      return row;
    });
    
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Grilla");
    
    if (format === 'csv') {
      const csv = xlsx.utils.sheet_to_csv(ws, { FS: ";" });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mayor_limpio.csv";
      link.click();
      URL.revokeObjectURL(url);
    } else {
      xlsx.writeFile(wb, "mayor_limpio.xlsx");
    }
  };

  const addColumn = () => {
    setTemplate([...template, { id: Date.now().toString(), titulo: 'Nueva Columna', origen: 'ref' }]);
  };

  const removeColumn = (id: string) => {
    setTemplate(template.filter(t => t.id !== id));
  };

  const updateColumn = (id: string, campo: keyof ColumnaTemplate, valor: any) => {
    setTemplate(template.map(t => t.id === id ? { ...t, [campo]: valor } : t));
  };

  return (
    <main className="max-w-5xl mx-auto py-10 px-4 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-main">Procesador de Mayores</h1>
        <p className="text-muted-foreground">Subí el mayor exportado del sistema contable y descargá la grilla limpia al instante.</p>
        <details className="group border border-border rounded-lg bg-surface mt-4 max-w-2xl text-sm">
          <summary className="cursor-pointer font-semibold p-3 text-main hover:bg-main/5 list-none flex items-center justify-between">
            <span>¿Para qué sirve y cómo funciona esta herramienta? (Ver más)</span>
            <span className="transition group-open:rotate-180">▼</span>
          </summary>
          <div className="p-4 border-t border-border text-foreground space-y-3 bg-muted/30">
            <p>
              Esta aplicación está programada para <strong>ahorrarte el trabajo manual de limpiar Excel</strong>. Recibe el libro mayor "crudo", tal como lo exporta el sistema de tu cliente, y hace lo siguiente de forma automática:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Elimina la basura:</strong> Ignora encabezados repetidos, filas vacías y totales o subtotales que ensucian el Excel.</li>
              <li><strong>Quita saldos iniciales y finales:</strong> Deja únicamente los movimientos reales, para que puedas filtrar tranquilamente las cuentas de resultado.</li>
              <li><strong>Personalizable:</strong> Podés definir tu propia plantilla de salida, eligiendo qué columnas del Excel original te querés llevar.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Todo el procesamiento se hace directamente en tu computadora. Los datos sensibles de los clientes nunca se envían a ningún servidor.
            </p>
          </div>
        </details>
      </header>

      {status === 'idle' && (
        <>
          <section 
            className={`card p-12 text-center border-2 border-dashed transition-colors ${isDragging ? 'border-main bg-main/5' : 'border-border hover:border-main/50'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <UploadCloud className="mx-auto h-12 w-12 text-main/60 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Arrastrá el archivo del mayor acá</h3>
            <p className="text-sm text-muted-foreground mb-6">O si preferís, elegilo desde tu computadora (XLSX o CSV)</p>
            <Button asChild>
              <label className="cursor-pointer">
                Elegir archivo
                <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} />
              </label>
            </Button>
          </section>

          <div className="card p-4 border border-border bg-surface flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-main/10 text-main shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-bold text-foreground">Nueva herramienta: Cifrador y Hasheador de Columnas (MD5)</p>
                <p className="text-muted-foreground">Hasheá contraseñas, documentos o salarios mediante MD5 y revertilos cuando lo necesites.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0 text-xs gap-1.5 border-main text-main hover:bg-main/5">
              <Link href="/cifrado-columnas">Ir a Cifrado de Columnas →</Link>
            </Button>
          </div>
        </>
      )}

      {status === 'processing' && (
        <section className="card p-12 text-center flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-main" />
          <h3 className="text-lg font-semibold">Procesando mayor...</h3>
          <p className="text-muted-foreground">{progressMsg}</p>
        </section>
      )}

      {status === 'error' && (
        <section className="card p-8 border-red-200 bg-red-50">
          <h3 className="text-red-700 font-bold mb-2">Ocurrió un problema</h3>
          <p className="text-red-600 mb-6">{errorMsg}</p>
          <Button variant="outline" onClick={() => setStatus('idle')}>Volver a intentar</Button>
        </section>
      )}

      {status === 'success' && result && (
        <div className="space-y-6">
          <section className="card p-6 flex flex-wrap gap-6 items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Movimientos encontrados</p>
              <p className="text-2xl font-bold text-main">{result.filas.length.toLocaleString('es-AR')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cuentas</p>
              <p className="text-2xl font-bold text-main">{result.cuentas}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Débito</p>
              <p className="text-lg font-semibold text-green-700">{formatMoney(result.totalDebito)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Crédito</p>
              <p className="text-lg font-semibold text-blue-700">{formatMoney(result.totalCredito)}</p>
            </div>
          </section>

          {/* Alerta Destacada: Verificación Obligatoria */}
          <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 flex items-start gap-3.5 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                <span>¡Punto de Control Importante!</span>
                <span className="text-xs bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                  Revisar antes de descargar
                </span>
              </p>
              <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed text-xs sm:text-sm">
                Es fundamental verificar la información (totales de débito, crédito y cuentas asignadas) antes de procesar o cargar estos datos en tus sistemas. Detectar cualquier inconsistencia ahora evita cascadeos de errores en balances y conciliaciones posteriores.
              </p>
            </div>
          </div>

          {/* Selector de Asiento de Apertura / Saldo Inicial */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-border bg-surface">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="toggleAperturaApp"
                checked={incluirApertura}
                onChange={(e) => handleToggleApertura(e.target.checked)}
                className="w-4 h-4 rounded text-main focus:ring-main cursor-pointer"
              />
              <div>
                <label htmlFor="toggleAperturaApp" className="text-sm font-semibold cursor-pointer text-foreground">
                  Incluir Asientos de Apertura / Saldos Iniciales
                </label>
                <p className="text-xs text-muted-foreground">
                  {incluirApertura
                    ? (result && result.filasApertura ? `(${result.filasApertura} aperturas incluidas para cuadrar con el reporte oficial)` : '(Activo)')
                    : '(Omitidos: solo movimientos del período)'}
                </p>
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 w-fit ${
              incluirApertura ? 'bg-main/10 text-main border border-main/20' : 'bg-muted text-muted-foreground border border-border'
            }`}>
              {incluirApertura ? 'Apertura Incluida' : 'Solo Movimientos'}
            </span>
          </div>

          <section className="card overflow-hidden">
            <div className="bg-muted p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-main" />
                  Vista previa de la grilla lista
                </h3>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setShowEditor(!showEditor)} className="gap-2 bg-surface">
                  <Settings className="h-4 w-4" />
                  Personalizar Template
                </Button>
                <Button variant="outline" size="sm" onClick={() => setStatus('idle')}>
                  Subir otro
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownload('csv')} className="gap-2 border-main text-main hover:bg-main/5">
                  <Download className="h-4 w-4" /> CSV
                </Button>
                <Button size="sm" onClick={() => handleDownload('xlsx')} className="gap-2">
                  <Download className="h-4 w-4" /> XLSX
                </Button>
              </div>
            </div>

            {showEditor && (
              <div className="p-4 bg-muted/50 border-b border-border space-y-4">
                <p className="text-sm font-medium">Configurá las columnas que querés en tu Excel final:</p>
                <div className="space-y-2">
                  {template.map((col, index) => (
                    <div key={col.id} className="flex items-center gap-2">
                      <div className="bg-background border border-border px-3 py-1.5 rounded-md text-xs font-bold text-muted-foreground w-8 text-center">
                        {index + 1}
                      </div>
                      <input 
                        type="text" 
                        value={col.titulo} 
                        onChange={e => updateColumn(col.id, 'titulo', e.target.value)}
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Título de la columna"
                      />
                      <span className="text-sm text-muted-foreground">=</span>
                      <select 
                        value={col.origen}
                        onChange={e => {
                          const val = e.target.value;
                          const num = parseInt(val, 10);
                          updateColumn(col.id, 'origen', isNaN(num) ? val : num);
                        }}
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <optgroup label="Datos Procesados (Inteligentes)">
                          <option value="fecha">Fecha (Normalizada)</option>
                          <option value="cod">Código de Cuenta</option>
                          <option value="desc">Descripción de Cuenta</option>
                          <option value="debito">Débito (Solo numérico)</option>
                          <option value="credito">Crédito (Solo numérico)</option>
                          <option value="mov">Movimiento (Débito - Crédito)</option>
                        </optgroup>
                        <optgroup label="Columnas Originales del Excel">
                          {result.encabezadosOriginales.map((enc, i) => (
                            <option key={i} value={i}>Columna: {enc || `Col ${i+1}`}</option>
                          ))}
                        </optgroup>
                      </select>
                      <Button variant="ghost" size="icon" onClick={() => removeColumn(col.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addColumn} className="gap-2">
                  <Plus className="h-4 w-4" /> Agregar Columna
                </Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-main/5 text-main uppercase font-semibold text-xs">
                  <tr>
                    {template.map(col => (
                      <th key={col.id} className="px-4 py-3 whitespace-nowrap">{col.titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.filas.slice(0, 50).map((f, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      {template.map(col => {
                        const val = obtenerValor(f, col.origen);
                        const isNumber = typeof val === 'number';
                        return (
                          <td key={col.id} className={`px-4 py-2 ${isNumber ? 'text-right font-medium' : 'min-w-[150px]'}`}>
                            {isNumber && col.origen !== 'cod' ? formatMoney(val) : val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Panel de Control y Cotejo Contable */}
          <section className="card p-6 space-y-5 border border-border bg-surface">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <Scale className="h-5 w-5 text-main" />
                <div>
                  <h3 className="font-bold text-base text-foreground">Control de Consistencia y Cuadratura</h3>
                  <p className="text-xs text-muted-foreground">Validaciones automáticas para asegurar la integridad de la grilla</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  esCuadrado 
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30' 
                    : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                }`}>
                  {esCuadrado ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                  {esCuadrado ? 'Balance Cuadrado' : `Diferencia: ${formatMoney(diffCuadratura)}`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cuadratura Débito vs Crédito */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                esCuadrado 
                  ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-950 dark:text-emerald-100' 
                  : 'bg-amber-500/5 border-amber-500/30 text-amber-950 dark:text-amber-100'
              }`}>
                {esCuadrado ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-xs uppercase tracking-wide opacity-80">Cuadratura Contable</p>
                  <p className="font-bold text-sm">
                    {esCuadrado ? 'Partida Doble Balanceada' : `Diferencia detectada: ${formatMoney(diffCuadratura)}`}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {esCuadrado 
                      ? 'El total de débitos y créditos coincide con exactitud ($0,00 de diferencia).'
                      : 'Débito y Crédito difieren. Esto es normal y esperado si exportaste un subconjunto de cuentas (ej. sólo disponibilidades o retenciones). Si el archivo debía incluir todas las cuentas contables, cotejá el reporte de origen.'}
                  </p>
                </div>
              </div>

              {/* Reglas e integridad */}
              <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-start gap-3">
                <Check className="h-5 w-5 text-main shrink-0 mt-0.5" />
                <div className="text-sm space-y-1 w-full">
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Reglas de Integridad</p>
                  <ul className="text-xs text-foreground/80 space-y-1.5 mt-1">
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>
                        <strong>Saldos iniciales / Apertura:</strong> {incluirApertura 
                          ? `${result.filasApertura || 0} aperturas incluidas para cuadrar con el reporte.` 
                          : 'Omitidos (solo movimientos del período).'}
                      </span>
                    </li>
                    {rangoFechas && (
                      <li className="flex items-center gap-1.5">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Período detectado:</strong> del {rangoFechas.desde} al {rangoFechas.hasta}.</span>
                      </li>
                    )}
                    <li className="flex items-center gap-1.5">
                      <span className={result.sinDescripcion === 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                        {result.sinDescripcion === 0 ? "✓" : "⚠"}
                      </span>
                      <span>
                        <strong>Asignación de cuentas:</strong> {result.sinDescripcion === 0 
                          ? '100% de los movimientos tienen cuenta asignada.' 
                          : `${result.sinDescripcion} movimientos sin descripción.`}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Desglose de sumas por cuenta para cotejo */}
            <div className="border border-border rounded-xl overflow-hidden bg-background">
              <button
                type="button"
                onClick={() => setShowAccountSummary(!showAccountSummary)}
                className="w-full p-3.5 bg-muted/40 hover:bg-muted/70 flex items-center justify-between text-sm font-semibold transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-main" />
                  <span>Resumen de sumas por cuenta para cotejar ({resumenCuentas.length} cuentas)</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                  <span>{showAccountSummary ? 'Ocultar' : 'Ver desglose'}</span>
                  {showAccountSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {showAccountSummary && (
                <div className="max-h-80 overflow-y-auto border-t border-border">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted sticky top-0 font-semibold text-muted-foreground uppercase text-[11px]">
                      <tr>
                        <th className="px-3.5 py-2.5">Código</th>
                        <th className="px-3.5 py-2.5">Cuenta</th>
                        <th className="px-3.5 py-2.5 text-right">Movimientos</th>
                        <th className="px-3.5 py-2.5 text-right">Total Débito</th>
                        <th className="px-3.5 py-2.5 text-right">Total Crédito</th>
                        <th className="px-3.5 py-2.5 text-right">Movimiento Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resumenCuentas.map((cta, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3.5 py-2 font-mono font-medium text-main">{cta.cod}</td>
                          <td className="px-3.5 py-2 font-medium">{cta.desc}</td>
                          <td className="px-3.5 py-2 text-right text-muted-foreground">{cta.cant.toLocaleString('es-AR')}</td>
                          <td className="px-3.5 py-2 text-right font-medium text-green-700">{formatMoney(cta.debito)}</td>
                          <td className="px-3.5 py-2 text-right font-medium text-blue-700">{formatMoney(cta.credito)}</td>
                          <td className="px-3.5 py-2 text-right font-bold">{formatMoney(cta.mov)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
