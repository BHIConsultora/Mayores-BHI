import * as React from 'react';
import { IGrillaMayoresProps } from './IGrillaMayoresProps';
import { SharePointService } from '../services/SharePointService';
import { analizar } from '../../core/engine/analyzer';
import { ResultadoAnalisis, ColumnaTemplate } from '../../core/domain/types';
import * as xlsx from 'xlsx';

// Este componente usa React Hooks y está listo para correr dentro de SPFx / Teams
export default function GrillaMayores(props: IGrillaMayoresProps) {
  const [status, setStatus] = React.useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [result, setResult] = React.useState<ResultadoAnalisis | null>(null);
  const [template, setTemplate] = React.useState<ColumnaTemplate[]>([
    { id: '1', titulo: 'Fecha', origen: 'fecha' },
    { id: '2', titulo: 'Cód. Cuenta', origen: 'cod' },
    { id: '3', titulo: 'Descripción Cuenta', origen: 'desc' },
    { id: '4', titulo: 'Referencia', origen: 'ref' },
    { id: '5', titulo: 'Movimiento', origen: 'mov' },
  ]);
  const [clienteActual, setClienteActual] = React.useState('');
  
  const spService = React.useMemo(() => new SharePointService(props.context), [props.context]);

  const processFile = async (file: File) => {
    setStatus('processing');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
      
      const res = analizar(rows);
      setResult(res);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const saveTemplateToSharePoint = async () => {
    if (!clienteActual) {
      alert("Por favor, ingresá el nombre del cliente para guardar el template.");
      return;
    }
    try {
      await spService.saveTemplate(clienteActual, template);
      alert("Template guardado exitosamente en SharePoint!");
    } catch (e) {
      alert("Error guardando. Verificá la consola.");
    }
  };

  const loadTemplateFromSharePoint = async () => {
    try {
      const templates = await spService.getTemplates();
      const match = templates.find(t => t.cliente.toLowerCase() === clienteActual.toLowerCase());
      if (match) {
        setTemplate(match.config);
        alert("Template cargado!");
      } else {
        alert("No se encontró configuración guardada para este cliente.");
      }
    } catch (e) {
      alert("Error cargando. Verificá la consola.");
    }
  };

  const handleDownload = (format: 'xlsx' | 'csv') => {
    if (!result) return;
    
    const data = result.filas.map(f => {
      const row: Record<string, any> = {};
      template.forEach(col => {
        let val = '';
        if (col.origen === 'fecha') val = f.fecha ? new Date(f.fecha).toLocaleDateString('es-AR') : '';
        else if (typeof col.origen === 'string') val = (f as any)[col.origen] ?? '';
        else if (typeof col.origen === 'number') val = f.filaOriginal[col.origen] ?? '';
        row[col.titulo] = val;
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

  return (
    <div style={{ padding: '20px', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2>Procesador de Mayores Contables</h2>
      <p>Hola, {props.userDisplayName} (contexto de Teams/SPFx)</p>

      {status === 'idle' && (
        <div style={{ border: '2px dashed #005278', padding: '40px', textAlign: 'center' }}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
        </div>
      )}

      {status === 'processing' && <p>Procesando Excel en memoria...</p>}

      {status === 'success' && result && (
        <div>
          <h3>Mapeo de Columnas (SharePoint)</h3>
          <div style={{ marginBottom: '10px' }}>
            <input 
              placeholder="Nombre del Cliente..." 
              value={clienteActual} 
              onChange={e => setClienteActual(e.target.value)} 
              style={{ marginRight: '10px', padding: '5px' }}
            />
            <button onClick={loadTemplateFromSharePoint}>Cargar Regla de SP</button>
            <button onClick={saveTemplateToSharePoint} style={{ marginLeft: '10px' }}>Guardar Regla en SP</button>
          </div>
          
          <button onClick={() => handleDownload('xlsx')} style={{ marginTop: '20px', padding: '10px', background: '#107c41', color: 'white' }}>
            Descargar Excel Limpio
          </button>
        </div>
      )}
    </div>
  );
}
