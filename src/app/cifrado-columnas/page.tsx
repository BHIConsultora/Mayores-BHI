"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Loader2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  KeyRound,
  Database,
  Trash2,
  Info,
  Layers,
  ArrowRight,
  ShieldAlert,
  CheckSquare,
  Square
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  md5,
  isMd5Hash,
  analyzeColumnCrypto,
  ColumnCryptoAnalysis,
  getLocalVault,
  saveToLocalVault,
  clearLocalVault,
  VAULT_SHEET_NAME
} from '@/lib/crypto/md5';

type OperationMode = 'encrypt' | 'decrypt';

interface ProcessedStats {
  mode: OperationMode;
  columnNames: string[];
  totalRows: number;
  processedCount: number;
  unresolvedCount: number;
  emptyCount: number;
  unresolvedSamples: string[];
}

export default function CifradoColumnasPage() {
  const [mode, setMode] = useState<OperationMode>('encrypt');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'file_loaded' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  
  // File data
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetDataMap, setSheetDataMap] = useState<Record<string, any[][]>>({});
  
  // Active sheet rows
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<any[][]>([]);
  
  // Multi-Column Selection
  const [selectedColIndices, setSelectedColIndices] = useState<number[]>([]);
  const [forceDoubleHash, setForceDoubleHash] = useState(false);
  
  // In-memory file vault mappings (hash -> original)
  const [fileVault, setFileVault] = useState<Record<string, string>>({});
  const [localVaultCount, setLocalVaultCount] = useState<number>(0);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  
  // Processed Output
  const [processedRows, setProcessedRows] = useState<any[][]>([]);
  const [processedStats, setProcessedStats] = useState<ProcessedStats | null>(null);
  // Track processed data per sheet so all sheets are preserved on export
  const [modifiedSheets, setModifiedSheets] = useState<Record<string, { headers: string[]; rows: any[][]; stats: ProcessedStats; colIndices: number[] }>>({});

  // Original raw file buffer and sheet header index map to preserve all formulas, formats and metadata
  const rawFileBufferRef = useRef<ArrayBuffer | null>(null);
  const sheetHeaderRowMapRef = useRef<Record<string, number>>({});

  // Update vault count on mount / change
  const refreshVaultCount = useCallback(() => {
    const v = getLocalVault();
    setLocalVaultCount(Object.keys(v).length);
  }, []);

  useEffect(() => {
    refreshVaultCount();
  }, [refreshVaultCount]);

  // Reset force double hash when column or mode changes
  useEffect(() => {
    setForceDoubleHash(false);
  }, [selectedColIndices, mode]);

  // Analyze every column in the current sheet (streamlined for large datasets)
  const allColumnAnalyses: ColumnCryptoAnalysis[] = useMemo(() => {
    if (!headers.length || !dataRows.length) return [];
    return headers.map((_, colIdx) => {
      let nonEmpty = 0;
      let empty = 0;
      let md5Count = 0;
      const sampleValues: string[] = [];

      for (let r = 0; r < dataRows.length; r++) {
        const v = dataRows[r][colIdx];
        if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
          empty++;
          continue;
        }
        nonEmpty++;
        const strVal = String(v).trim();
        if (sampleValues.length < 5) {
          sampleValues.push(strVal);
        }
        if (isMd5Hash(strVal)) {
          md5Count++;
        }
      }

      const plainCount = nonEmpty - md5Count;
      const md5Ratio = nonEmpty > 0 ? md5Count / nonEmpty : 0;
      const likelyEncrypted = md5Ratio >= 0.8 && nonEmpty > 0;
      const likelyPlain = md5Ratio < 0.2 && nonEmpty > 0;
      const isMixed = !likelyEncrypted && !likelyPlain && nonEmpty > 0;

      return {
        totalRows: dataRows.length,
        nonEmptyRows: nonEmpty,
        emptyRows: empty,
        md5Count,
        plainCount,
        md5Ratio,
        likelyEncrypted,
        likelyPlain,
        isMixed,
        sampleValues
      };
    });
  }, [headers, dataRows]);

  // Aggregated analysis for selected columns
  const selectedAnalyses = useMemo(() => {
    return selectedColIndices
      .map(idx => ({
        idx,
        name: headers[idx] || `Columna ${idx + 1}`,
        analysis: allColumnAnalyses[idx]
      }))
      .filter(item => item.analysis !== undefined);
  }, [selectedColIndices, headers, allColumnAnalyses]);

  const combinedStats = useMemo(() => {
    let nonEmpty = 0;
    let empty = 0;
    let md5Count = 0;
    let plainCount = 0;
    const encryptedCols: string[] = [];
    const plainCols: string[] = [];

    for (const item of selectedAnalyses) {
      nonEmpty += item.analysis.nonEmptyRows;
      empty += item.analysis.emptyRows;
      md5Count += item.analysis.md5Count;
      plainCount += item.analysis.plainCount;
      if (item.analysis.likelyEncrypted) {
        encryptedCols.push(item.name);
      }
      if (item.analysis.likelyPlain) {
        plainCols.push(item.name);
      }
    }

    return {
      nonEmpty,
      empty,
      md5Count,
      plainCount,
      encryptedCols,
      plainCols,
      hasEncryptedCols: encryptedCols.length > 0,
      hasPlainCols: plainCols.length > 0
    };
  }, [selectedAnalyses]);

  // Combined vault (file embedded vault + local storage vault)
  const combinedVault = useMemo(() => {
    const local = getLocalVault();
    return { ...local, ...fileVault };
  }, [fileVault, localVaultCount]);

  // Check how many hashes in selected columns can be resolved
  const vaultMatchStats = useMemo(() => {
    if (combinedStats.md5Count === 0) return { matched: 0, missing: 0 };
    let matched = 0;
    let missing = 0;
    for (const item of selectedAnalyses) {
      for (const row of dataRows) {
        const v = row[item.idx];
        if (v !== null && v !== undefined && isMd5Hash(String(v).trim())) {
          const hash = String(v).trim().toLowerCase();
          if (combinedVault[hash]) {
            matched++;
          } else {
            missing++;
          }
        }
      }
    }
    return { matched, missing };
  }, [combinedStats, selectedAnalyses, dataRows, combinedVault]);

  // Multi-column toggle helper
  const toggleColumn = (idx: number) => {
    setSelectedColIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  };

  // Parse uploaded file
  const handleFileProcess = useCallback(async (uploadedFile: File) => {
    const isXlsx = uploadedFile.name.endsWith('.xlsx') || uploadedFile.name.endsWith('.xls');
    const isCsv = uploadedFile.name.endsWith('.csv');

    if (!isXlsx && !isCsv) {
      setStatus('error');
      setErrorMsg('Por favor, subí un archivo de Excel (.xlsx, .xls) o CSV válido.');
      return;
    }

    try {
      setStatus('processing');
      const xlsx = await import('xlsx');
      const buffer = await uploadedFile.arrayBuffer();
      rawFileBufferRef.current = buffer;
      const isCsv = uploadedFile.name.toLowerCase().endsWith('.csv');
      const wb = xlsx.read(buffer, {
        type: 'array',
        raw: isCsv,
        cellFormula: true,
        cellNF: true,
        cellDates: true
      });

      // Inspect for hidden vault sheet
      const foundFileVault: Record<string, string> = {};
      if (wb.Sheets[VAULT_SHEET_NAME]) {
        const vaultSheet = wb.Sheets[VAULT_SHEET_NAME];
        const vaultData = xlsx.utils.sheet_to_json<string[]>(vaultSheet, { header: 1 });
        for (let i = 1; i < vaultData.length; i++) {
          const row = vaultData[i];
          if (row && row[0] && row[1] !== undefined) {
            const h = String(row[0]).trim().toLowerCase();
            const orig = String(row[1]);
            foundFileVault[h] = orig;
          }
        }
        if (Object.keys(foundFileVault).length > 0) {
          saveToLocalVault(foundFileVault);
          refreshVaultCount();
        }
      }
      setFileVault(foundFileVault);

      // Filter out vault sheet from visible sheets
      const visibleSheets = wb.SheetNames.filter(name => name !== VAULT_SHEET_NAME);
      if (!visibleSheets.length) {
        throw new Error('El archivo no contiene ninguna hoja con datos visibles.');
      }

      const sheetsMap: Record<string, any[][]> = {};
      for (const sName of visibleSheets) {
        const ws = wb.Sheets[sName];
        const rawGrid = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        sheetsMap[sName] = rawGrid;
      }

      setSheetNames(visibleSheets);
      setSheetDataMap(sheetsMap);
      setModifiedSheets({});
      setFile(uploadedFile);

      // Default to first sheet
      const firstSheet = visibleSheets[0];
      setSelectedSheet(firstSheet);
      applySheetData(sheetsMap[firstSheet], firstSheet);

      setStatus('file_loaded');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Error al leer el archivo. Verificá que no esté protegido o dañado.');
    }
  }, [refreshVaultCount]);

  // Setup sheet data
  const applySheetData = (rawGrid: any[][], sName?: string) => {
    if (!rawGrid || !rawGrid.length) {
      setHeaders([]);
      setDataRows([]);
      setSelectedColIndices([]);
      return;
    }

    let headerRowIdx = 0;
    while (headerRowIdx < rawGrid.length && rawGrid[headerRowIdx].every(c => c === '' || c === null || c === undefined)) {
      headerRowIdx++;
    }

    if (headerRowIdx >= rawGrid.length) {
      setHeaders([]);
      setDataRows([]);
      setSelectedColIndices([]);
      return;
    }

    const currentSheetName = sName || selectedSheet || 'default';
    sheetHeaderRowMapRef.current[currentSheetName] = headerRowIdx;

    const rawHeaderRow = rawGrid[headerRowIdx];
    let maxCols = rawHeaderRow ? rawHeaderRow.length : 0;
    for (let r = 0; r < rawGrid.length; r++) {
      if (rawGrid[r] && rawGrid[r].length > maxCols) {
        maxCols = rawGrid[r].length;
      }
    }

    const detectedHeaders: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      const val = rawHeaderRow ? rawHeaderRow[c] : undefined;
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        detectedHeaders.push(String(val).trim());
      } else {
        detectedHeaders.push(`Columna ${c + 1}`);
      }
    }

    const rows = rawGrid.slice(headerRowIdx + 1).filter(r => 
      r && r.some(cell => cell !== '' && cell !== null && cell !== undefined)
    );

    const normalizedRows = rows.map(r => {
      if (r.length >= detectedHeaders.length) return r;
      const rowCopy = r.slice();
      while (rowCopy.length < detectedHeaders.length) {
        rowCopy.push('');
      }
      return rowCopy;
    });

    setHeaders(detectedHeaders);
    setDataRows(normalizedRows);
    // Default: select first column
    setSelectedColIndices(detectedHeaders.length > 0 ? [0] : []);
  };

  const handleSheetChange = (sheetName: string) => {
    // If current sheet was processed, ensure it's saved in modifiedSheets
    if (status === 'success' && processedRows.length > 0 && processedStats) {
      setModifiedSheets(prev => ({
        ...prev,
        [selectedSheet]: { headers, rows: processedRows, stats: processedStats, colIndices: [...selectedColIndices] }
      }));
    }

    setSelectedSheet(sheetName);

    // If target sheet was already processed, load its processed state
    if (modifiedSheets[sheetName]) {
      setHeaders(modifiedSheets[sheetName].headers);
      setDataRows(modifiedSheets[sheetName].rows);
      setProcessedRows(modifiedSheets[sheetName].rows);
      setProcessedStats(modifiedSheets[sheetName].stats);
      setSelectedColIndices(modifiedSheets[sheetName].colIndices);
      setStatus('success');
    } else if (sheetDataMap[sheetName]) {
      applySheetData(sheetDataMap[sheetName], sheetName);
      setStatus('file_loaded');
      setProcessedRows([]);
      setProcessedStats(null);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  // Perform Encryption or Decryption for multiple columns
  const handleExecuteOperation = () => {
    if (selectedColIndices.length === 0 || !dataRows.length) return;

    const colNames = selectedColIndices.map(idx => headers[idx] || `Columna ${idx + 1}`);
    setStatus('processing');

    try {
      const newRows = dataRows.map(row => [...row]);
      let processedCount = 0;
      let emptyCount = 0;
      let unresolvedCount = 0;
      const unresolvedSamples: string[] = [];

      if (mode === 'encrypt') {
        const newMappings: Record<string, string> = {};

        for (let i = 0; i < newRows.length; i++) {
          for (const colIdx of selectedColIndices) {
            const cell = newRows[i][colIdx];
            if (cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')) {
              emptyCount++;
              continue;
            }

            const plainStr = String(cell);
            const hash = md5(plainStr);
            newMappings[hash] = plainStr;
            newRows[i][colIdx] = hash;
            processedCount++;
          }
        }

        // Save new mappings to local vault and in-memory vault
        saveToLocalVault(newMappings);
        setFileVault(prev => ({ ...prev, ...newMappings }));
        refreshVaultCount();

        setProcessedRows(newRows);
        const stats: ProcessedStats = {
          mode: 'encrypt',
          columnNames: colNames,
          totalRows: dataRows.length,
          processedCount,
          unresolvedCount: 0,
          emptyCount,
          unresolvedSamples: []
        };
        setProcessedStats(stats);
        setModifiedSheets(prev => ({
          ...prev,
          [selectedSheet]: { headers, rows: newRows, stats, colIndices: [...selectedColIndices] }
        }));
        setStatus('success');
      } else {
        // Mode DECRYPT
        const vault = combinedVault;

        for (let i = 0; i < newRows.length; i++) {
          for (const colIdx of selectedColIndices) {
            const cell = newRows[i][colIdx];
            if (cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')) {
              emptyCount++;
              continue;
            }

            const cellStr = String(cell).trim();
            if (isMd5Hash(cellStr)) {
              const lowerHash = cellStr.toLowerCase();
              if (vault[lowerHash] !== undefined) {
                newRows[i][colIdx] = vault[lowerHash];
                processedCount++;
              } else {
                unresolvedCount++;
                if (unresolvedSamples.length < 5) {
                  unresolvedSamples.push(cellStr);
                }
              }
            } else {
              // Not an MD5 hash, leave as is
              unresolvedCount++;
            }
          }
        }

        setProcessedRows(newRows);
        const stats: ProcessedStats = {
          mode: 'decrypt',
          columnNames: colNames,
          totalRows: dataRows.length,
          processedCount,
          unresolvedCount,
          emptyCount,
          unresolvedSamples
        };
        setProcessedStats(stats);
        setModifiedSheets(prev => ({
          ...prev,
          [selectedSheet]: { headers, rows: newRows, stats, colIndices: [...selectedColIndices] }
        }));
        setStatus('success');
      }
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Ocurrió un error inesperado al procesar los datos.');
    }
  };

  // Helper to update specific cells in-place while preserving formulas on all other cells
  const updateCellInWorksheet = (ws: any, r: number, c: number, newVal: string, xlsx: any) => {
    if (ws['!data']) {
      if (!ws['!data'][r]) ws['!data'][r] = [];
      if (ws['!data'][r][c]) {
        ws['!data'][r][c].v = newVal;
        ws['!data'][r][c].t = 's';
        delete ws['!data'][r][c].f;
        delete ws['!data'][r][c].w;
      } else {
        ws['!data'][r][c] = { t: 's', v: newVal };
      }
    } else {
      const coord = xlsx.utils.encode_cell({ r, c });
      if (ws[coord]) {
        ws[coord].v = newVal;
        ws[coord].t = 's';
        delete ws[coord].f;
        delete ws[coord].w;
      } else {
        ws[coord] = { t: 's', v: newVal };
      }
    }
  };

  // Export & Download
  const handleDownload = async (format: 'xlsx' | 'csv') => {
    if (!file) return;

    const xlsx = await import('xlsx');
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const suffix = mode === 'encrypt' ? '_encriptado' : '_desencriptado';

    if (format === 'csv') {
      // CSV format can only contain a single sheet (the active one)
      const currentRows = (status === 'success' && processedRows.length > 0) ? processedRows : dataRows;
      const ws = xlsx.utils.aoa_to_sheet([headers]);
      xlsx.utils.sheet_add_aoa(ws, currentRows, { origin: 'A2' });
      const csvContent = xlsx.utils.sheet_to_csv(ws, { FS: ';' });
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}_${selectedSheet}${suffix}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // XLSX format: Export preserving all original sheets, formulas, cell formats and calculations!
      let wb: any;

      if (rawFileBufferRef.current && !file.name.toLowerCase().endsWith('.csv')) {
        // Re-read pristine original workbook from buffer, preserving formulas (.f), number formats (.z) and styles
        wb = xlsx.read(rawFileBufferRef.current, {
          type: 'array',
          cellFormula: true,
          cellNF: true,
          cellDates: true
        });

        const sheetsToUpdate: Record<string, { colIndices: number[]; rows: any[][] }> = {};
        for (const sName of Object.keys(modifiedSheets)) {
          sheetsToUpdate[sName] = {
            colIndices: modifiedSheets[sName].colIndices,
            rows: modifiedSheets[sName].rows
          };
        }
        if (status === 'success' && processedRows.length > 0) {
          sheetsToUpdate[selectedSheet] = {
            colIndices: [...selectedColIndices],
            rows: processedRows
          };
        }

        // Apply in-place cell updates ONLY to target columns in modified sheets
        for (const sName of Object.keys(sheetsToUpdate)) {
          if (!wb.Sheets[sName]) continue;
          const ws = wb.Sheets[sName];
          const mod = sheetsToUpdate[sName];
          const hRowIdx = sheetHeaderRowMapRef.current[sName] ?? 0;

          for (let r = 0; r < mod.rows.length; r++) {
            const R = hRowIdx + 1 + r;
            for (const colIdx of mod.colIndices) {
              const val = mod.rows[r][colIdx];
              if (val === null || val === undefined) continue;
              updateCellInWorksheet(ws, R, colIdx, String(val), xlsx);
            }
          }
        }
      } else {
        // Fallback for CSV or when buffer is unavailable
        wb = xlsx.utils.book_new();
        for (const sName of sheetNames) {
          let ws: any;
          if (sName === selectedSheet && status === 'success' && processedRows.length > 0) {
            ws = xlsx.utils.aoa_to_sheet([headers]);
            xlsx.utils.sheet_add_aoa(ws, processedRows, { origin: 'A2' });
          } else if (modifiedSheets[sName] && modifiedSheets[sName].rows.length > 0) {
            ws = xlsx.utils.aoa_to_sheet([modifiedSheets[sName].headers]);
            xlsx.utils.sheet_add_aoa(ws, modifiedSheets[sName].rows, { origin: 'A2' });
          } else if (sheetDataMap[sName]) {
            ws = xlsx.utils.aoa_to_sheet(sheetDataMap[sName]);
          } else {
            continue;
          }
          xlsx.utils.book_append_sheet(wb, ws, sName);
        }
      }

      // If Encrypt mode, embed the hidden vault sheet for reversible round-trip
      if (mode === 'encrypt') {
        const existingIdx = wb.SheetNames.indexOf(VAULT_SHEET_NAME);
        if (existingIdx !== -1) {
          wb.SheetNames.splice(existingIdx, 1);
          delete wb.Sheets[VAULT_SHEET_NAME];
        }

        const vaultEntries = Object.entries(combinedVault);
        if (vaultEntries.length > 0) {
          const vaultData: string[][] = [['Hash MD5', 'Valor Original', 'Herramienta']];
          for (let i = 0; i < vaultEntries.length; i++) {
            vaultData.push([vaultEntries[i][0], vaultEntries[i][1], 'BHI Suite']);
          }
          const vaultWs = xlsx.utils.aoa_to_sheet(vaultData);
          xlsx.utils.book_append_sheet(wb, vaultWs, VAULT_SHEET_NAME);

          // Hide vault sheet in workbook
          if (!wb.Workbook) wb.Workbook = { Sheets: [] };
          if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
          const vaultIndex = wb.SheetNames.indexOf(VAULT_SHEET_NAME);
          if (vaultIndex !== -1) {
            wb.Workbook.Sheets[vaultIndex] = { Hidden: 1 };
          }
        }
      }

      xlsx.writeFile(wb, `${baseName}${suffix}.xlsx`);
    }
  };

  // Validation rules for disabling action buttons
  const isActionDisabled = useMemo(() => {
    if (selectedColIndices.length === 0 || combinedStats.nonEmpty === 0) {
      return true;
    }
    if (mode === 'encrypt') {
      // If ANY selected column is already MD5, must explicitly check forceDoubleHash
      if (combinedStats.hasEncryptedCols && !forceDoubleHash) {
        return true;
      }
      return false;
    } else {
      // In decrypt mode, cannot decrypt if ANY selected column is plain text
      if (combinedStats.hasPlainCols) {
        return true;
      }
      return false;
    }
  }, [selectedColIndices, combinedStats, mode, forceDoubleHash]);

  // Local Vault management modal helper
  const vaultEntries = useMemo(() => {
    const v = combinedVault;
    const entries = Object.entries(v);
    if (!vaultSearchQuery.trim()) return entries;
    const q = vaultSearchQuery.toLowerCase();
    return entries.filter(([hash, orig]) => hash.includes(q) || orig.toLowerCase().includes(q));
  }, [combinedVault, vaultSearchQuery]);

  return (
    <main className="max-w-5xl mx-auto py-10 px-4 space-y-8">
      {/* Header section */}
      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-main/10 text-main border border-main/20">
                <Lock className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold text-main">Cifrado y Descifrado de Columnas</h1>
                <p className="text-sm text-muted-foreground">
                  Hasheá una o varias columnas con MD5 en Excel/CSV y recuperá los datos originales de forma segura.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowVaultModal(true)}
              className="gap-2 bg-surface text-xs"
            >
              <Database className="h-4 w-4 text-main" />
              <span>Bóveda Local</span>
              <span className="bg-main/10 text-main px-1.5 py-0.5 rounded-full font-mono text-xs font-semibold">
                {localVaultCount}
              </span>
            </Button>
          </div>
        </div>

        {/* Informative Accordion */}
        <details className="group border border-border rounded-xl bg-surface mt-4 max-w-3xl text-sm">
          <summary className="cursor-pointer font-semibold p-3.5 text-main hover:bg-main/5 list-none flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span>¿Para qué sirve y cómo funciona el cifrado MD5? (Ver detalles)</span>
            </span>
            <span className="transition group-open:rotate-180">▼</span>
          </summary>
          <div className="p-4 border-t border-border text-foreground space-y-3 bg-muted/20 text-xs sm:text-sm">
            <p>
              Esta herramienta permite proteger columnas confidenciales (ej. contraseñas, documentos de identidad, cuentas bancarias o salarios) antes de compartir planillas con terceros:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Cifrado multi-columna:</strong> Podés seleccionar <strong>una o múltiples columnas a la vez</strong> para procesarlas en un solo clic.
              </li>
              <li>
                <strong>Hash MD5 estándar de 32 caracteres:</strong> Convierte cada celda en una cadena hexadecimal irreconocible (ej. <em>"secreto123"</em> → <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">85c7f8a85...</code>).
              </li>
              <li>
                <strong>Bóveda Reversible Inteligente:</strong> MD5 es matemáticamente una función unidireccional. Para permitir la desencriptación que solicitaste, al exportar en Excel se incluye un mapa de bóveda oculto que viaja con el archivo, y se sincroniza en la bóveda local de tu navegador.
              </li>
              <li>
                <strong>Detección proactiva de errores:</strong> La suite analiza cada columna seleccionada y te previene si elegís una columna que ya está encriptada (evitando un doble hash no deseado) o si intentás desencriptar una columna que está en texto plano.
              </li>
              <li>
                <strong>100% Procesamiento Local:</strong> Tus archivos nunca se suben a ningún servidor externo; todo se procesa dentro de tu propio navegador.
              </li>
            </ul>
          </div>
        </details>
      </header>

      {/* Main Mode Selector: Encriptar vs Desencriptar */}
      <div className="flex rounded-2xl bg-muted/50 p-1.5 border border-border max-w-md mx-auto">
        <button
          type="button"
          onClick={() => {
            setMode('encrypt');
            if (status === 'success') setStatus('file_loaded');
          }}
          className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
            mode === 'encrypt'
              ? 'bg-surface text-main shadow-xs border border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Lock className="h-4 w-4" />
          <span>1. Encriptar (Hash MD5)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('decrypt');
            if (status === 'success') setStatus('file_loaded');
          }}
          className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
            mode === 'decrypt'
              ? 'bg-surface text-main shadow-xs border border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Unlock className="h-4 w-4" />
          <span>2. Desencriptar</span>
        </button>
      </div>

      {/* Step 1: File Upload (Idle state) */}
      {status === 'idle' && (
        <section
          className={`card p-12 text-center border-2 border-dashed transition-all ${
            isDragging ? 'border-main bg-main/5' : 'border-border hover:border-main/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="mx-auto h-14 w-14 rounded-2xl bg-main/10 flex items-center justify-center text-main mb-4">
            <UploadCloud className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold mb-1">
            {mode === 'encrypt' ? 'Arrastrá el archivo a encriptar' : 'Arrastrá el archivo a desencriptar'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Soporta planillas de Microsoft Excel (.xlsx, .xls) o archivos separados por coma (.csv).
          </p>
          <Button asChild size="lg" className="shadow-xs">
            <label className="cursor-pointer">
              Elegir archivo
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
              />
            </label>
          </Button>
        </section>
      )}

      {/* Processing State */}
      {status === 'processing' && (
        <section className="card p-12 text-center flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-main" />
          <h3 className="text-lg font-semibold">Procesando archivo...</h3>
          <p className="text-sm text-muted-foreground">
            {mode === 'encrypt' ? 'Calculando hashes criptográficos MD5...' : 'Consultando bóveda y restaurando texto original...'}
          </p>
        </section>
      )}

      {/* Error State */}
      {status === 'error' && (
        <section className="card p-8 border-red-200 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-red-700 font-bold text-base">Ocurrió un problema</h3>
              <p className="text-red-600 text-sm leading-relaxed">{errorMsg}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatus('idle')}
                className="mt-3 bg-white border-red-200 text-red-700 hover:bg-red-100/50"
              >
                Volver a intentar
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Step 2: File Loaded & Multi-Column Selection */}
      {(status === 'file_loaded' || status === 'success') && file && (
        <div className="space-y-6">
          {/* File summary banner */}
          <section className="card p-5 border border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-main/10 flex items-center justify-center text-main shrink-0">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-base text-foreground break-all">{file.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                  <span>•</span>
                  <span>{dataRows.length.toLocaleString('es-AR')} filas de datos</span>
                  <span>•</span>
                  <span>{headers.length} columnas</span>
                  {Object.keys(fileVault).length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Bóveda incrustada ({Object.keys(fileVault).length} claves)
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-main"
                  >
                    {sheetNames.map((name) => {
                      const isMod = (name === selectedSheet && processedRows.length > 0) || Boolean(modifiedSheets[name]);
                      return (
                        <option key={name} value={name}>
                          Hoja: {name} {isMod ? '✓ (Modificada)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus('idle');
                  setFile(null);
                  setProcessedRows([]);
                  setProcessedStats(null);
                }}
                className="text-xs"
              >
                Cambiar archivo
              </Button>
            </div>
          </section>

          {/* Column Selection & Validation Card */}
          <section className="card p-6 border border-border bg-surface space-y-6">
            <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <span>Paso 1: Seleccioná las columnas a {mode === 'encrypt' ? 'hashear con MD5' : 'desencriptar'}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Podés elegir <strong>una o varias columnas a la vez</strong> haciendo clic en las tarjetas o <strong>directamente sobre los encabezados de la tabla</strong> de vista previa.
                </p>
              </div>

              {/* Action buttons to select / deselect all */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedColIndices(headers.map((_, i) => i))}
                  className="text-xs h-8 gap-1.5 bg-surface"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Todas
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedColIndices([])}
                  className="text-xs h-8 gap-1.5 bg-surface"
                >
                  <Square className="h-3.5 w-3.5" />
                  Ninguna
                </Button>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-main/10 text-main border border-main/20">
                  {selectedColIndices.length} de {headers.length} seleccionadas
                </span>
              </div>
            </div>

            {/* Multi-Column Checklist Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1.5 border border-border rounded-xl bg-muted/20">
              {headers.map((headerName, idx) => {
                const isSelected = selectedColIndices.includes(idx);
                const colAnalysis = allColumnAnalyses[idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleColumn(idx)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-main bg-main/10 shadow-xs ring-1 ring-main'
                        : 'border-border bg-surface hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded text-main focus:ring-main cursor-pointer shrink-0 pointer-events-none"
                      />
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-foreground truncate">
                          {idx + 1}. {headerName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {colAnalysis ? `${colAnalysis.nonEmptyRows.toLocaleString('es-AR')} celdas con datos` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {colAnalysis?.likelyEncrypted && (
                        <span className="text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-mono font-bold border border-amber-500/30">
                          🔒 MD5
                        </span>
                      )}
                      {colAnalysis?.likelyPlain && (
                        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-semibold border border-border">
                          📝 Texto
                        </span>
                      )}
                      {colAnalysis?.isMixed && (
                        <span className="text-[10px] bg-blue-500/15 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold border border-blue-500/30">
                          Mixto
                        </span>
                      )}
                      {colAnalysis && colAnalysis.nonEmptyRows === 0 && (
                        <span className="text-[10px] bg-muted text-muted-foreground/60 px-2 py-0.5 rounded-full font-semibold">
                          Vacía
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Consolidated Analysis for Selected Columns */}
            {selectedColIndices.length > 0 && (
              <div className="space-y-4 pt-2">
                {/* Stats Pill Row */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="pill bg-muted border border-border text-foreground">
                    Columnas seleccionadas: <strong>{selectedColIndices.length}</strong>
                  </span>
                  <span className="pill bg-muted border border-border text-foreground">
                    Total celdas a procesar: <strong>{combinedStats.nonEmpty.toLocaleString('es-AR')}</strong>
                  </span>
                  <span className="pill bg-muted border border-border text-foreground">
                    Hashes MD5: <strong>{combinedStats.md5Count.toLocaleString('es-AR')}</strong>
                  </span>
                  <span className="pill bg-muted border border-border text-foreground">
                    Texto plano / Números: <strong>{combinedStats.plainCount.toLocaleString('es-AR')}</strong>
                  </span>
                  {combinedStats.empty > 0 && (
                    <span className="pill bg-muted border border-border text-muted-foreground">
                      Celdas vacías: {combinedStats.empty.toLocaleString('es-AR')} (se preservan)
                    </span>
                  )}
                </div>

                {/* MODE 1: ENCRYPT VALIDATIONS */}
                {mode === 'encrypt' && (
                  <>
                    {/* CASE: At least one selected column is ALREADY ENCRYPTED */}
                    {combinedStats.hasEncryptedCols && (
                      <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 flex items-start gap-3.5">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm space-y-2">
                          <p className="font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                            <span>¡Atención! Columnas ya encriptadas detectadas</span>
                            <span className="text-xs bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                              MD5 Detectado
                            </span>
                          </p>
                          <p className="text-amber-900/90 dark:text-amber-200/90 text-xs sm:text-sm leading-relaxed">
                            Las siguientes columnas seleccionadas ya parecen estar encriptadas con MD5: <strong>{combinedStats.encryptedCols.join(', ')}</strong>. Si las vuelves a encriptar, se generará un <strong>doble hash</strong> sobre ellas.
                          </p>
                          <div className="pt-1 flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="forceDoubleHashCheckbox"
                              checked={forceDoubleHash}
                              onChange={(e) => setForceDoubleHash(e.target.checked)}
                              className="h-4 w-4 rounded text-main focus:ring-main cursor-pointer"
                            />
                            <label
                              htmlFor="forceDoubleHashCheckbox"
                              className="text-xs font-semibold text-amber-950 dark:text-amber-100 cursor-pointer"
                            >
                              Comprendo el riesgo y deseo forzar el doble hash en esas columnas de todos modos
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CASE: All selected columns are Plain Text (Ready to encrypt) */}
                    {!combinedStats.hasEncryptedCols && combinedStats.nonEmpty > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-sm space-y-1">
                          <p className="font-bold text-emerald-950 dark:text-emerald-100 text-xs uppercase tracking-wide">
                            {selectedColIndices.length === 1 ? 'Columna lista para encriptar' : 'Columnas listas para encriptar'}
                          </p>
                          <p className="text-xs text-foreground/90 leading-relaxed">
                            Se detectaron <strong>{combinedStats.nonEmpty.toLocaleString('es-AR')}</strong> celdas en texto plano en <strong>{selectedColIndices.length} columna(s)</strong> listos para hashear con MD5.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* MODE 2: DECRYPT VALIDATIONS */}
                {mode === 'decrypt' && (
                  <>
                    {/* CASE: Plain text columns selected in decrypt mode (ERROR) */}
                    {combinedStats.hasPlainCols && (
                      <div className="bg-red-500/10 border-2 border-red-500/40 rounded-xl p-4 flex items-start gap-3.5">
                        <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="text-sm space-y-1.5">
                          <p className="font-bold text-red-950 dark:text-red-100 flex items-center gap-2">
                            <span>¡Error de selección! Hay columnas que no están encriptadas</span>
                            <span className="text-xs bg-red-500/20 text-red-800 dark:text-red-300 px-2 py-0.5 rounded-full font-semibold">
                              Texto Plano Detectado
                            </span>
                          </p>
                          <p className="text-red-900/90 dark:text-red-200/90 text-xs sm:text-sm leading-relaxed">
                            Las siguientes columnas contienen texto o números normales y ningún valor coincide con un hash MD5: <strong>{combinedStats.plainCols.join(', ')}</strong>. Deseleccionalas o elegí únicamente columnas que contengan hashes MD5.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* CASE: Selected columns are all MD5 */}
                    {!combinedStats.hasPlainCols && combinedStats.md5Count > 0 && (
                      <div className="space-y-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="text-sm space-y-1">
                            <p className="font-bold text-emerald-950 dark:text-emerald-100 text-xs uppercase tracking-wide">
                              Hashes MD5 reconocidos
                            </p>
                            <p className="text-xs text-foreground/90 leading-relaxed">
                              Se detectaron <strong>{combinedStats.md5Count.toLocaleString('es-AR')}</strong> hashes MD5 en <strong>{selectedColIndices.length} columna(s)</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Vault resolution check */}
                        <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-start gap-3">
                          <Database className="h-5 w-5 text-main shrink-0 mt-0.5" />
                          <div className="text-xs space-y-1 w-full">
                            <p className="font-bold text-foreground">Cotejo con la Bóveda de Descifrado</p>
                            <p className="text-muted-foreground">
                              Coincidencias encontradas en la bóveda: <strong>{vaultMatchStats.matched} de {combinedStats.md5Count}</strong> hashes.
                            </p>
                            {vaultMatchStats.missing > 0 && (
                              <p className="text-amber-700 dark:text-amber-400 font-medium pt-1">
                                ⚠ Hay {vaultMatchStats.missing} hashes que no se encuentran en la bóveda de este equipo o archivo. Los hashes no registrados permanecerán con su valor hash.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Action Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <Button
                    size="lg"
                    disabled={isActionDisabled}
                    onClick={handleExecuteOperation}
                    className="w-full sm:w-auto gap-2 font-bold shadow-xs"
                  >
                    {mode === 'encrypt' ? (
                      <>
                        <Lock className="h-4 w-4" />
                        <span>
                          {selectedColIndices.length > 1
                            ? `Hashear ${selectedColIndices.length} Columnas con MD5`
                            : 'Hashear Columna con MD5'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Unlock className="h-4 w-4" />
                        <span>
                          {selectedColIndices.length > 1
                            ? `Desencriptar ${selectedColIndices.length} Columnas`
                            : 'Desencriptar Columna'}
                        </span>
                      </>
                    )}
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  {isActionDisabled && (
                    <p className="text-xs text-muted-foreground">
                      {selectedColIndices.length === 0
                        ? 'Seleccioná al menos una columna para comenzar.'
                        : mode === 'encrypt' && combinedStats.hasEncryptedCols && !forceDoubleHash
                        ? 'Marcá la casilla superior para autorizar el doble hash.'
                        : mode === 'decrypt' && combinedStats.hasPlainCols
                        ? 'Deseleccioná las columnas en texto plano para habilitar el botón.'
                        : 'Completá la selección para habilitar el botón.'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Step 3: Success & Download Section */}
          {status === 'success' && processedStats && (
            <section className="card p-6 border-2 border-emerald-500/40 bg-emerald-500/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-emerald-950 dark:text-emerald-100">
                      {processedStats.mode === 'encrypt'
                        ? `¡${processedStats.columnNames.length} columna(s) hasheada(s) con éxito!`
                        : `¡${processedStats.columnNames.length} columna(s) desencriptada(s) con éxito!`}
                    </h3>
                    <p className="text-xs text-emerald-800 dark:text-emerald-200">
                      {processedStats.mode === 'encrypt'
                        ? `${processedStats.processedCount.toLocaleString('es-AR')} celdas convertidas a hash MD5 en [${processedStats.columnNames.join(', ')}].`
                        : `${processedStats.processedCount.toLocaleString('es-AR')} celdas restauradas en [${processedStats.columnNames.join(', ')}].`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('csv')}
                    className="gap-2 border-main text-main hover:bg-main/5 bg-surface text-xs font-semibold"
                    title={sheetNames.length > 1 ? `Descargar la hoja activa "${selectedSheet}" en CSV` : 'Descargar en CSV'}
                  >
                    <Download className="h-4 w-4" /> {sheetNames.length > 1 ? `CSV (Hoja "${selectedSheet}")` : 'CSV'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDownload('xlsx')}
                    className="gap-2 font-bold text-xs shadow-xs"
                    title={sheetNames.length > 1 ? `Descargar archivo Excel con las ${sheetNames.length} hojas completas` : 'Descargar en Excel'}
                  >
                    <Download className="h-4 w-4" /> {sheetNames.length > 1 ? `Descargar Excel (${sheetNames.length} hojas)` : 'Descargar Excel (XLSX)'}
                  </Button>
                </div>
              </div>

              {/* Details if any unresolved in decrypt */}
              {processedStats.mode === 'decrypt' && processedStats.unresolvedCount > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1">
                  <p className="font-bold text-amber-950 dark:text-amber-100">
                    Nota de recuperación: {processedStats.unresolvedCount} celdas no pudieron ser desencriptadas
                  </p>
                  <p className="text-amber-900/90 dark:text-amber-200/90">
                    Estos hashes no estaban registrados en la bóveda del archivo ni de este equipo. Como MD5 es irreversible, se conservó el hash original en esas celdas.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Data Table Preview (ALWAYS VISIBLE once file is loaded) */}
          {dataRows.length > 0 && (
            <section className="card overflow-hidden border border-border">
              <div className="bg-muted p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-main" />
                    <span>
                      {status === 'success' && processedRows.length > 0
                        ? 'Vista previa de la planilla procesada (primeras 50 filas)'
                        : 'Vista previa de la planilla original (primeras 50 filas)'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {status === 'success' && processedStats
                      ? `Columnas modificadas: ${processedStats.columnNames.join(', ')}`
                      : selectedColIndices.length > 0
                      ? `Columnas seleccionadas actualmente (${selectedColIndices.length}): ${selectedColIndices.map(i => headers[i]).join(', ')}`
                      : 'Hacé clic directamente en los encabezados de la tabla para seleccionar las columnas'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] bg-main/10 text-main font-semibold px-2.5 py-1 rounded-full border border-main/20 flex items-center gap-1">
                    <span>👆</span> Clic en los títulos para seleccionar
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedColIndices(headers.map((_, i) => i))}
                    className="text-xs h-7 bg-surface font-medium"
                  >
                    Todas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedColIndices([])}
                    className="text-xs h-7 bg-surface font-medium"
                  >
                    Ninguna
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono ml-1">
                    {Math.min(50, dataRows.length)} de {dataRows.length.toLocaleString('es-AR')} filas
                  </span>
                  {status === 'success' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStatus('file_loaded');
                        setProcessedRows([]);
                        setProcessedStats(null);
                      }}
                      className="text-xs h-7 bg-surface font-medium text-main border-main/40"
                    >
                      ↺ Reconfigurar
                    </Button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-muted/80 text-foreground uppercase font-semibold text-[11px] sticky top-0 z-10 shadow-xs">
                    <tr>
                      <th className="px-3 py-2.5 text-center w-12 bg-muted/90 text-muted-foreground border-b border-border">#</th>
                      {headers.map((h, i) => {
                        const isSelected = selectedColIndices.includes(i);
                        const isProcessed = status === 'success' && processedRows.length > 0;
                        const colAnalysis = allColumnAnalyses[i];
                        return (
                          <th
                            key={i}
                            onClick={() => {
                              if (status === 'success') {
                                setStatus('file_loaded');
                                setProcessedRows([]);
                                setProcessedStats(null);
                              }
                              toggleColumn(i);
                            }}
                            title={
                              isSelected
                                ? `Columna seleccionada: "${h}". Hacé clic para deseleccionar.`
                                : `Hacé clic para seleccionar la columna "${h}".`
                            }
                            className={`px-4 py-2.5 whitespace-nowrap transition-all duration-150 cursor-pointer select-none border-b border-border group ${
                              isSelected
                                ? 'bg-main text-on-main font-bold shadow-inner'
                                : 'hover:bg-main/15 hover:text-main text-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="h-3.5 w-3.5 rounded border-border text-main focus:ring-main cursor-pointer pointer-events-none"
                              />
                              <span className="tracking-tight">{h}</span>
                              {isSelected && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-white/20 text-white font-bold ml-1">
                                  {isProcessed ? (mode === 'encrypt' ? '🔒 MD5' : '🔓') : '✓'}
                                </span>
                              )}
                              {!isSelected && colAnalysis?.likelyEncrypted && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-semibold ml-1 border border-amber-500/30">
                                  🔒 MD5
                                </span>
                              )}
                              {!isSelected && colAnalysis?.likelyPlain && (
                                <span className="text-[10px] text-muted-foreground/70 group-hover:text-main/70 ml-1">
                                  📝
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {((status === 'success' && processedRows.length > 0 ? processedRows : dataRows).slice(0, 50)).map((row, rIdx) => {
                      const isProcessed = status === 'success' && processedRows.length > 0;
                      return (
                        <tr key={rIdx} className="hover:bg-muted/40 transition-colors">
                          <td className="px-3 py-2 text-center text-muted-foreground font-mono text-[10px]">
                            {rIdx + 1}
                          </td>
                          {row.map((cellVal, cIdx) => {
                            const isSelected = selectedColIndices.includes(cIdx);
                            const isHash = isMd5Hash(cellVal);
                            return (
                              <td
                                key={cIdx}
                                className={`px-4 py-2 whitespace-nowrap transition-colors ${
                                  isSelected
                                    ? isHash
                                      ? 'bg-main/5 font-mono text-[11px] text-main font-medium'
                                      : isProcessed
                                      ? 'bg-emerald-500/10 font-medium text-emerald-900 dark:text-emerald-200'
                                      : 'bg-main/10 font-medium text-foreground'
                                    : 'text-foreground'
                                }`}
                              >
                                {cellVal === null || cellVal === undefined ? '' : String(cellVal)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Vault Management Modal */}
      {showVaultModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-main" />
                <div>
                  <h3 className="font-bold text-base">Bóveda Criptográfica Local</h3>
                  <p className="text-xs text-muted-foreground">
                    Diccionario seguro persistente en tu navegador ({Object.keys(combinedVault).length} claves guardadas)
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVaultModal(false)}
                className="text-xs"
              >
                ✕ Cerrar
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar por texto original o hash MD5..."
                value={vaultSearchQuery}
                onChange={(e) => setVaultSearchQuery(e.target.value)}
                className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-main"
              />
              {vaultSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVaultSearchQuery('')}
                  className="text-xs h-9"
                >
                  Limpiar
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto border border-border rounded-xl divide-y divide-border min-h-[250px]">
              {vaultEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                  <KeyRound className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="font-semibold">No se encontraron claves en la bóveda</p>
                  <p>Cuando encriptes columnas o cargues archivos con bóveda integrada, aparecerán acá.</p>
                </div>
              ) : (
                vaultEntries.map(([h, orig], idx) => (
                  <div key={idx} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30">
                    <div className="space-y-0.5 overflow-hidden">
                      <p className="font-semibold text-foreground truncate">{orig}</p>
                      <p className="font-mono text-[10px] text-muted-foreground truncate">{h}</p>
                    </div>
                    <span className="text-[10px] bg-main/10 text-main px-2 py-0.5 rounded font-mono shrink-0 self-start sm:self-auto">
                      MD5
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('¿Estás seguro de que deseas vaciar la bóveda local? Perderás la capacidad de revertir hashes en este navegador.')) {
                    clearLocalVault();
                    setFileVault({});
                    refreshVaultCount();
                  }
                }}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Vaciar Bóveda
              </Button>

              <Button
                size="sm"
                onClick={() => setShowVaultModal(false)}
                className="text-xs"
              >
                Aceptar
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
