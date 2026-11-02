"use client";

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Building2,
  Copy,
  Check,
  Search,
  RefreshCw,
  FileText,
  FileCode,
  ShieldCheck,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ALL_BANKS } from '@/core/banks/registry';
import { ExtractoBancarioResult, MovimientoBancario } from '@/core/banks/types';
import { downloadBankExcel } from '@/lib/excel/bank-exporter';

export default function ExtractosBancariosPage() {
  const [selectedBankId, setSelectedBankId] = useState<string>('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractoBancarioResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [copiedCbu, setCopiedCbu] = useState(false);
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = useCallback(async (file: File, bankId: string) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('error');
      setErrorMsg('Por favor, seleccioná un archivo de extracto en formato PDF (.pdf).');
      return;
    }

    setCurrentFile(file);
    setStatus('processing');
    setProgressMsg('Extrayendo texto y estructura del PDF...');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankId', bankId);

      const response = await fetch('/api/parse-bank-pdf', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Ocurrió un error al procesar el extracto bancario.');
      }

      setResult(data.data);
      setStatus('success');
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error procesando PDF:', err);
      setStatus('error');
      setErrorMsg(err.message || 'No se pudo procesar el PDF.');
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleProcessFile(e.dataTransfer.files[0], selectedBankId);
      }
    },
    [handleProcessFile, selectedBankId]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleProcessFile(e.target.files[0], selectedBankId);
      }
    },
    [handleProcessFile, selectedBankId]
  );

  const handleBankChange = (newBankId: string) => {
    setSelectedBankId(newBankId);
    // If a file is already loaded, re-process with the newly selected bank parser
    if (currentFile && status === 'success') {
      handleProcessFile(currentFile, newBankId);
    }
  };

  const copyCBU = useCallback(() => {
    if (result?.metadata?.cbu) {
      navigator.clipboard.writeText(result.metadata.cbu);
      setCopiedCbu(true);
      setTimeout(() => setCopiedCbu(false), 2000);
    }
  }, [result]);

  // Filtered movements
  const filteredMovimientos = useMemo(() => {
    if (!result?.movimientos) return [];
    let list = result.movimientos;

    if (typeFilter === 'debit') {
      list = list.filter(m => m.debito !== null && m.debito > 0);
    } else if (typeFilter === 'credit') {
      list = list.filter(m => m.credito !== null && m.credito > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        m =>
          m.concepto.toLowerCase().includes(q) ||
          m.fecha.toLowerCase().includes(q) ||
          (m.referencia && m.referencia.toLowerCase().includes(q)) ||
          (m.cbu && m.cbu.includes(q))
      );
    }

    return list;
  }, [result, searchQuery, typeFilter]);

  const hasCustomTable = Boolean(result && result.customColumns && result.tableRows && result.tableRows.length > 0);

  const filteredCustomRows = useMemo(() => {
    if (!result || !result.tableRows) return [];
    if (!searchQuery.trim()) return result.tableRows;
    const q = searchQuery.toLowerCase();
    const cols = result.customColumns || [];
    return result.tableRows.filter(row => {
      for (let i = 0; i < cols.length; i++) {
        const val = row[cols[i]];
        if (val && val.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [result, searchQuery]);

  const totalItemCount = hasCustomTable ? filteredCustomRows.length : filteredMovimientos.length;
  const totalPages = Math.ceil(totalItemCount / pageSize) || 1;

  const paginatedMovimientos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMovimientos.slice(start, start + pageSize);
  }, [filteredMovimientos, currentPage, pageSize]);

  const paginatedCustomRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomRows.slice(start, start + pageSize);
  }, [filteredCustomRows, currentPage, pageSize]);

  const resetAll = () => {
    setResult(null);
    setCurrentFile(null);
    setStatus('idle');
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Page Title & Intro */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                <Landmark className="h-6 w-6" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Extractos Bancarios
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-main/10 text-main border border-main/20">
                PDF a Excel
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Convertí resúmenes bancarios en PDF a planillas Excel (.xlsx) estructuradas con detección
              automática de CBU, Tipo de Banco, detalle de movimientos y conciliación contable de saldos.
            </p>
          </div>

          {result && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetAll}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Subir otro extracto
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => downloadBankExcel(result)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm font-semibold"
              >
                <Download className="h-4 w-4" />
                Descargar Excel (.xlsx)
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar: Bank Selector */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Building2 className="h-4 w-4 text-main" />
            <span>Banco del Extracto:</span>
          </div>

          <div className="flex-1 max-w-md">
            <select
              value={selectedBankId}
              onChange={(e) => handleBankChange(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-main transition-all cursor-pointer"
            >
              <option value="auto">✨ Detectar Banco Automáticamente (por CBU / Encabezado)</option>
              <optgroup label="Bancos Soportados">
                {ALL_BANKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.type})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Upload Zone (shown when idle or processing) */}
        {!result && (
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-main bg-main/5 scale-[0.99]'
                : 'border-border/80 hover:border-main/60 bg-muted/20 hover:bg-muted/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={onFileInputChange}
            />

            <div className="flex flex-col items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-main/10 text-main flex items-center justify-center shadow-xs">
                {status === 'processing' ? (
                  <RefreshCw className="h-7 w-7 animate-spin text-main" />
                ) : (
                  <UploadCloud className="h-7 w-7 text-main" />
                )}
              </div>

              {status === 'processing' ? (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">{progressMsg}</p>
                  <p className="text-xs text-muted-foreground">
                    Procesando movimientos, CBU y conciliación...
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground text-base">
                    Arrastrá tu extracto bancario en PDF aquí, o{' '}
                    <span className="text-main underline underline-offset-2">hacé clic para examinar</span>
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Compatible con Santander, Galicia, BBVA, Credicoop, Nación, BAPRO, ICBC, Banco de Santa Cruz,
                    Patagonia, BPN y cualquier extracto estándar de Argentina.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error notification */}
        {status === 'error' && errorMsg && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Error al procesar el archivo</p>
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* Results View */}
      {result && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Metadata Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Bank & Type */}
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Banco Identificado
                </span>
                <span className="p-1.5 rounded-lg bg-main/10 text-main">
                  <Landmark className="h-4 w-4" />
                </span>
              </div>
              <p className="text-base font-bold text-foreground leading-tight">
                {result.metadata.banco}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
                  {result.metadata.tipoBanco}
                </span>
                {result.metadata.codigoBanco && result.metadata.codigoBanco !== '000' && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    BCRA: {result.metadata.codigoBanco}
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: CBU & Account */}
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  CBU de la Cuenta
                </span>
                <button
                  onClick={copyCBU}
                  title="Copiar CBU al portapapeles"
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedCbu ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-sm font-mono font-bold text-foreground tracking-tight break-all">
                {result.metadata.cbu || 'No detectado en encabezado'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {result.metadata.cuenta ? `Cta: ${result.metadata.cuenta}` : 'Cuenta activa'}
              </p>
            </div>

            {/* Card 3: Titular & CUIT */}
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Titular & CUIT
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <ShieldCheck className="h-4 w-4" />
                </span>
              </div>
              <p className="text-sm font-bold text-foreground truncate" title={result.metadata.titular}>
                {result.metadata.titular || 'Titular registrado'}
              </p>
              <p className="text-xs font-mono text-muted-foreground">
                {result.metadata.cuit ? `CUIT: ${result.metadata.cuit}` : 'CUIT en extracto'}
              </p>
            </div>

            {/* Card 4: Accounting Reconciliation */}
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Conciliación de Saldos
                </span>
                <span
                  className={`p-1.5 rounded-lg ${
                    result.totales.cuadra
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-amber-500/10 text-amber-600'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-foreground">
                  {result.totales.cuadra ? 'Cuadre Perfecto' : 'Diferencia'}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({result.totales.cantidadMovimientos} movs)
                </span>
              </div>
              <p
                className={`text-xs font-semibold ${
                  result.totales.cuadra ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {result.totales.cuadra
                  ? '✓ Saldos verificados al 100%'
                  : `Dif: $ ${result.totales.diferenciaCuadre.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
              </p>
            </div>
          </div>

          {/* Financial Totals Ribbon */}
          <div className="bg-surface rounded-2xl border border-border p-4 shadow-soft flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              {result.metadata.saldoInicial !== null && (
                <div>
                  <span className="text-xs text-muted-foreground block">Saldo Inicial:</span>
                  <span className="text-sm font-mono font-bold text-foreground">
                    $ {result.metadata.saldoInicial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-red-500/10 text-red-600">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                </span>
                <div>
                  <span className="text-xs text-muted-foreground block">Total Débitos:</span>
                  <span className="text-sm font-mono font-bold text-red-600">
                    -$ {result.totales.totalDebitos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-600">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
                <div>
                  <span className="text-xs text-muted-foreground block">Total Créditos:</span>
                  <span className="text-sm font-mono font-bold text-emerald-600">
                    +$ {result.totales.totalCreditos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {result.totales.saldoCalculado !== null && (
                <div>
                  <span className="text-xs text-muted-foreground block">Saldo Final:</span>
                  <span className="text-sm font-mono font-bold text-foreground">
                    $ {result.totales.saldoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Export Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => downloadBankExcel(result)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Descargar Excel (.xlsx)
              </Button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-surface rounded-2xl border border-border shadow-soft overflow-hidden space-y-4 p-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por concepto, comprobante, fecha..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-main"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {hasCustomTable ? (
                  <div className="flex items-center gap-2 bg-blue-500/10 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-xl text-xs font-semibold border border-blue-500/20">
                    Formato Completo de Cuenta ({filteredCustomRows.length} filas)
                  </div>
                ) : (
                  <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border text-xs">
                    <button
                      onClick={() => {
                        setTypeFilter('all');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                        typeFilter === 'all'
                          ? 'bg-surface text-foreground font-bold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Todos ({result.movimientos.length})
                    </button>
                    <button
                      onClick={() => {
                        setTypeFilter('debit');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                        typeFilter === 'debit'
                          ? 'bg-surface text-red-600 font-bold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Débitos
                    </button>
                    <button
                      onClick={() => {
                        setTypeFilter('credit');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                        typeFilter === 'credit'
                          ? 'bg-surface text-emerald-600 font-bold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Créditos
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            {hasCustomTable ? (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      {result.customColumns!.map((col) => (
                        <th
                          key={col}
                          className={`py-2.5 px-3 whitespace-nowrap ${
                            col === 'Descripción'
                              ? 'text-left'
                              : col.includes('Fecha')
                              ? 'text-center'
                              : 'text-right'
                          }`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedCustomRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={result.customColumns!.length}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No se encontraron filas con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomRows.map((row, rIdx) => {
                        const isSectionHeader =
                          !row['Cant. VN'] &&
                          !row['Saldo'] &&
                          !row['Neto'] &&
                          !row['Fecha Co.'] &&
                          !row['Fecha Li.'];
                        return (
                          <tr
                            key={rIdx}
                            className={`hover:bg-muted/20 transition-colors ${
                              isSectionHeader ? 'bg-muted/30 font-bold text-blue-700 dark:text-blue-400' : ''
                            }`}
                          >
                            {result.customColumns!.map((col) => {
                              const val = row[col] || '';
                              const isDesc = col === 'Descripción';
                              const isDate = col.includes('Fecha');
                              return (
                                <td
                                  key={col}
                                  className={`py-2 px-3 ${
                                    isDesc
                                      ? 'text-left max-w-sm'
                                      : isDate
                                      ? 'text-center font-mono whitespace-nowrap'
                                      : 'text-right font-mono whitespace-nowrap'
                                  } ${val.startsWith('-') ? 'text-red-600' : ''}`}
                                >
                                  {val || '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap">Fecha</th>
                      <th className="py-2.5 px-3">Concepto / Detalle</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Comprobante</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Débito</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Crédito</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedMovimientos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No se encontraron movimientos con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      paginatedMovimientos.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                            {m.fecha}
                          </td>
                          <td className="py-2 px-3 font-medium text-foreground max-w-md">
                            {m.concepto}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                            {m.referencia || '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-red-600 whitespace-nowrap">
                            {m.debito !== null ? `$ ${m.debito.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-600 whitespace-nowrap">
                            {m.credito !== null ? `$ ${m.credito.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                            {m.saldo !== null ? `$ ${m.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span>
                  Mostrando {((currentPage - 1) * pageSize) + 1} a{' '}
                  {Math.min(currentPage * pageSize, filteredMovimientos.length)} de{' '}
                  {totalItemCount} {hasCustomTable ? 'filas' : 'movimientos'}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-7 text-xs px-2"
                  >
                    Anterior
                  </Button>
                  <span className="px-2 font-medium">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 text-xs px-2"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
