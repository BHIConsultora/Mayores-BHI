const fs = require('fs');
let content = fs.readFileSync('src/webparts/formateadorDeMayores/components/FormateadorDeMayores.tsx', 'utf8');
let oldText = fs.readFileSync('old.txt', 'utf16le'); // PowerShell Get-Content > uses utf16le by default
if (oldText.charCodeAt(0) === 0xFEFF || oldText.charCodeAt(0) === 0xFFFE) {
  oldText = oldText.substring(1);
}
// Clean up carriage returns
oldText = oldText.replace(/\r/g, '');

const newText = `          <div className={styles.resultCard}>
            <div className={styles.successIcon}>✓</div>
            <div>
              <strong style={{ display: 'block', fontSize: '15px' }}>Procesamiento Exitoso</strong> 
              <span style={{ fontSize: '14px', opacity: 0.9 }}>Se procesaron exitosamente {result.filas.length} filas de {result.cuentas} cuenta(s).</span>
            </div>
          </div>

          <div style={{ marginTop: '24px', marginBottom: '24px', overflowX: 'auto', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontWeight: 600, fontSize: '13px', color: '#374151' }}>
              Vista Previa (Primeras filas)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {template.map(col => (
                    <th key={col.id} style={{ padding: '10px 16px', color: '#6b7280', fontWeight: 500 }}>{col.titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.filas.slice(0, 4).map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    {template.map(col => {
                      let val: any = '';
                      if (col.origen === 'fecha') val = f.fecha ? new Date(f.fecha).toLocaleDateString('es-AR') : '';
                      else if (col.origen === 'debito') val = f.debito || 0;
                      else if (col.origen === 'credito') val = f.credito || 0;
                      else if (col.origen === 'mov') val = (f.debito || 0) - (f.credito || 0);
                      else if (col.origen === 'cod') val = f.cod || '';
                      else if (col.origen === 'desc') val = f.desc || '';
                      else if (col.origen === 'ref') val = f.ref || '';
                      else if (typeof col.origen === 'number') val = f.filaOriginal[col.origen] ?? '';
                      return <td key={col.id} style={{ padding: '10px 16px', color: '#111827' }}>{val}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.mappingSection}>
            <h3>⚙️ Confirmar Columnas</h3>
            
            {template.map(col => (
              <div className={styles.mappingRow} key={col.id}>
                <div className={styles.columnName}>
                  <span className={styles.colBadge}>COL</span>
                  {col.titulo}
                </div>
                <div className={styles.arrow}>→</div>
                <div className={styles.selectWrapper}>
                  <select 
                    value={col.origen} 
                    onChange={e => {
                      const val = e.target.value;
                      handleColumnMapChange(col.id, isNaN(Number(val)) ? val : Number(val));
                    }}
                  >
                    <option value="fecha">📅 Fecha Inteligente</option>
                    <option value="cod">🔢 Código de Cuenta</option>
                    <option value="desc">📝 Descripción de Cuenta</option>
                    <option value="ref">📄 Referencia / Comprobante</option>
                    <option value="mov">💵 Movimiento Neto</option>
                    <option value="debito">⬆️ Débito</option>
                    <option value="credito">⬇️ Crédito</option>
                    <option disabled>— Columnas originales —</option>
                    {(result.encabezadosOriginales || []).map((enc, idx) => (
                      <option key={idx} value={idx}>
                        Original: {enc || "(Sin título " + (idx + 1) + ")"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <button 
            className={styles.advancedToggle} 
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '🔼 Ocultar opciones avanzadas' : '🔽 Configuración por Cliente (Avanzado)'}
          </button>

          {showAdvanced && (
            <div className={styles.advancedPanel}>
              <div className={styles.inputGroup}>
                <label>Vincular a Cliente (SharePoint)</label>
                <input 
                  type="text" 
                  value={clienteActual} 
                  onChange={e => setClienteActual(e.target.value)} 
                  placeholder="Ej: BHI Consultora..."
                />
              </div>
              <button className={styles.btnSecondary} onClick={loadTemplateFromSharePoint}>Cargar</button>
              <button className={styles.btnSecondary} onClick={saveTemplateToSharePoint}>Guardar</button>
            </div>
          )}

          <div style={{ marginTop: '30px', padding: '20px', background: '#f3f4f6', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Nombre del archivo a descargar
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={fileName} 
                  onChange={e => setFileName(e.target.value)} 
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                />
                <span style={{ marginLeft: '12px', color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>.xlsx</span>
              </div>
            </div>
            
            <button className={styles.downloadBtn} onClick={exportarAExcel} style={{ width: '100%', padding: '12px', fontSize: '15px' }}>
              ⬇️ Descargar Excel Formateado
            </button>
`;

// I will just use lines indexing because exact string matching with encoding is brittle
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('className={styles.resultCard}'));
const end = lines.findIndex((l, i) => i > start && l.includes('Descargar Excel Formateado')) + 2;
lines.splice(start, end - start, ...newText.split('\n'));

fs.writeFileSync('src/webparts/formateadorDeMayores/components/FormateadorDeMayores.tsx', lines.join('\n'));
