/* Motor de deteccion y limpieza de mayores contables. Sin dependencias ni DOM. */
(function (root) {
  'use strict';

  function norm(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/ /g, ' ')
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.:]+$/, '')
      .replace(/\s+/g, ' ');
  }
  function txt(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return '';
    return String(v).replace(/ /g, ' ').trim();
  }

  var SIN = {
    fecha:    ['fecha', 'fec', 'fecha asiento', 'fecha mov', 'fecha movimiento', 'fecha contable',
               'f emision', 'fecha emision', 'fecha registro', 'date', 'dia'],
    cuenta:   ['cuenta', 'cta', 'codigo', 'codigo cuenta', 'cod cuenta', 'cod cta', 'nro cuenta',
               'numero de cuenta', 'cuenta contable', 'imputacion', 'account'],
    desccta:  ['descripcion cuenta', 'nombre cuenta', 'denominacion', 'denominacion cuenta',
               'detalle cuenta', 'nombre de la cuenta', 'titulo cuenta', 'account name'],
    ref:      ['referencia', 'concepto', 'detalle', 'leyenda', 'glosa', 'observaciones',
               'observacion', 'descripcion', 'descripcion movimiento', 'comprobante', 'documento',
               'nro comprobante', 'numero comprobante', 'texto', 'memo'],
    debito:   ['debito', 'debitos', 'debe', 'cargo', 'cargos', 'debit'],
    credito:  ['credito', 'creditos', 'haber', 'abono', 'abonos', 'credit'],
    importe:  ['importe', 'monto', 'movimiento', 'valor', 'importe movimiento', 'amount'],
    asiento:  ['asiento', 'nro asiento', 'numero asiento', 'diario', 'libro'],
    saldo:    ['saldo', 'saldo acumulado', 'saldo acumu', 'acumulado', 'saldo final', 'balance']
  };
  var ORDEN = ['fecha', 'cuenta', 'desccta', 'ref', 'debito', 'credito', 'importe', 'asiento', 'saldo'];

  function claseDe(s) {
    if (!s) return null;
    for (var i = 0; i < ORDEN.length; i++) {
      var k = ORDEN[i];
      if (SIN[k].indexOf(s) !== -1) return k;
    }
    for (var j = 0; j < ORDEN.length; j++) {
      var k2 = ORDEN[j], lista = SIN[k2];
      for (var m = 0; m < lista.length; m++) {
        if (lista[m].length >= 5 && s.indexOf(lista[m]) !== -1) return k2;
      }
    }
    return null;
  }

  /* --- fechas ------------------------------------------------------- */
  var RE_FECHA = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/;

  function piezasFecha(v) {
    if (v instanceof Date && !isNaN(v)) return { date: v };
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      return { date: new Date(Math.round((v - 25569) * 86400000)) };
    }
    var s = txt(v);
    if (!s) return null;
    s = s.split(' ')[0];
    var m = RE_FECHA.exec(s);
    if (!m) return null;
    var a = +m[1], b = +m[2], c = +m[3];
    if (m[1].length === 4) return { date: armar(a, b, c) };     // yyyy-mm-dd
    return { amb: [a, b, c] };
  }
  function armar(y, mo, d) {
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCDate() === d && dt.getUTCMonth() === mo - 1 ? dt : null;
  }
  function esFecha(v) { var p = piezasFecha(v); return !!(p && (p.date || p.amb)); }
  function resolverFecha(v, diaPrimero) {
    var p = piezasFecha(v);
    if (!p) return null;
    if (p.date) return p.date;
    var x = p.amb;
    return diaPrimero ? armar(x[2], x[1], x[0]) : armar(x[2], x[0], x[1]);
  }

  /* --- numeros ------------------------------------------------------ */
  function aNumero(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v).replace(/ /g, ' ').trim();
    if (!s) return 0;
    var neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s);
    s = s.replace(/[()]/g, '').replace(/[^0-9.,\-]/g, '');
    if (!s) return 0;
    var coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
    if (coma > -1 && punto > -1) {
      if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (coma > -1) {
      s = (s.length - coma - 1) === 3 && !/^-?\d{1,3},\d{3}$/.test(s) === false
        ? s.replace(/,/g, '') : s.replace(',', '.');
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return neg && n > 0 ? -n : n;
  }

  /* --- filas que no son movimiento ---------------------------------- */
  /* Marcas de saldo/total. Prefijo solo para la familia "saldo ...";
     para el resto exige igualdad exacta, asi un proveedor llamado
     "TRANSPORTE AL SUR S.R.L." no se confunde con una fila de transporte. */
  var RUIDO_PREFIJO = ['saldo inicial', 'saldo final', 'saldo anterior', 'saldo al',
    'saldos iniciales', 'saldos finales', 'saldo del periodo', 'saldo acumulado inicial'];
  var RUIDO_EXACTO = ['total', 'totales', 'total cuenta', 'total general', 'total del periodo',
    'subtotal', 'sub total', 'transporte', 'arrastre', 'suma y sigue', 'vienen', 'van',
    'acumulado', 'acumulado del periodo', 'saldo', 'saldos'];

  function esRuido(fila, colRef) {
    for (var i = 0; i < fila.length; i++) {
      if (i === colRef) continue;                  // la referencia es texto libre del usuario
      var s = norm(fila[i]);
      if (!s) continue;
      if (RUIDO_EXACTO.indexOf(s) !== -1) return true;
      for (var j = 0; j < RUIDO_PREFIJO.length; j++) {
        if (s.indexOf(RUIDO_PREFIJO[j]) === 0) return true;
      }
    }
    return false;
  }

  var RE_TITULO = /^\s*([0-9][0-9A-Za-z._\-\/]*)\s*[-–—:]\s*(.+?)\s*$/;
  function tituloDe(fila) {
    for (var i = 0; i < Math.min(fila.length, 4); i++) {
      var s = txt(fila[i]);
      if (!s || s.length > 160) continue;
      var m = RE_TITULO.exec(s);
      if (m && /\d/.test(m[1]) && m[2].length > 1 && !/^\d+$/.test(m[2])) {
        return { cod: m[1].replace(/[.\-\/]+$/, ''), desc: m[2] };
      }
    }
    return null;
  }

  /* --- deteccion del encabezado ------------------------------------- */
  function detectarEncabezado(filas) {
    var mejor = null, tope = Math.min(filas.length, 150);
    for (var r = 0; r < tope; r++) {
      var fila = filas[r], vistos = {}, puntos = 0, mapa = {};
      for (var c = 0; c < fila.length; c++) {
        var k = claseDe(norm(fila[c]));
        if (k && !vistos[k]) { vistos[k] = 1; mapa[k] = c; puntos++; }
      }
      if (mapa.fecha === undefined) puntos -= 1;
      if (puntos >= 3 && (!mejor || puntos > mejor.puntos)) mejor = { fila: r, puntos: puntos, mapa: mapa };
    }
    return mejor;
  }

  /* --- analisis principal ------------------------------------------- */
  function analizar(filas, override) {
    var det = detectarEncabezado(filas);
    var mapa = {}, filaEnc = -1;
    if (det) { mapa = det.mapa; filaEnc = det.fila; }
    if (override) for (var k in override) {
      var ov = override[k];
      if (ov === -1 || ov === null) delete mapa[k];
      else if (ov !== undefined) mapa[k] = ov;
    }

    if (mapa.fecha === undefined) mapa.fecha = 0;

    // dd/mm vs mm/dd
    var diaPrimero = true, votoDia = 0, votoMes = 0;
    for (var r = 0; r < filas.length; r++) {
      var p = piezasFecha(filas[r][mapa.fecha]);
      if (p && p.amb) {
        if (p.amb[0] > 12) votoDia++;
        else if (p.amb[1] > 12) votoMes++;
      }
      if (votoDia + votoMes > 400) break;
    }
    if (votoMes > votoDia) diaPrimero = false;

    var mapaCtas = {}, actual = null, movs = [], ctasUsadas = {};
    var totDeb = 0, totCred = 0, sinDesc = 0;
    var hayDebHaber = mapa.debito !== undefined || mapa.credito !== undefined;

    for (var i = 0; i < filas.length; i++) {
      var fila = filas[i];
      if (!fila || !fila.length) continue;
      if (i === filaEnc) continue;

      var crudoCta = mapa.cuenta !== undefined ? txt(fila[mapa.cuenta]) : '';
      var fechaOk = esFecha(fila[mapa.fecha]);

      if (!fechaOk) {
        var t = tituloDe(fila);
        if (t) { mapaCtas[t.cod] = t.desc; actual = t; }
        continue;
      }
      if (esRuido(fila, mapa.ref)) continue;
      if (claseDe(norm(crudoCta))) continue;          // encabezado repetido

      var cod = crudoCta || (actual ? actual.cod : '');
      if (!cod && mapa.cuenta !== undefined) continue;

      var desc = '';
      if (mapa.desccta !== undefined) desc = txt(fila[mapa.desccta]);
      if (!desc) desc = mapaCtas[cod] || (actual && actual.cod === cod ? actual.desc : '') || '';
      if (!desc && actual && !crudoCta) desc = actual.desc;
      if (!desc) sinDesc++;

      var deb = 0, cred = 0, mov;
      if (hayDebHaber) {
        deb = mapa.debito !== undefined ? aNumero(fila[mapa.debito]) : 0;
        cred = mapa.credito !== undefined ? aNumero(fila[mapa.credito]) : 0;
        mov = deb - cred;
      } else if (mapa.importe !== undefined) {
        mov = aNumero(fila[mapa.importe]);
        if (mov >= 0) deb = mov; else cred = -mov;
      } else { mov = 0; }

      totDeb += deb; totCred += cred;
      if (cod) ctasUsadas[cod] = 1;

      movs.push({
        fecha: resolverFecha(fila[mapa.fecha], diaPrimero),
        cod: cod,
        desc: desc,
        ref: mapa.ref !== undefined ? txt(fila[mapa.ref]) : '',
        mov: Math.round(mov * 100) / 100
      });
    }

    return {
      filas: movs,
      mapa: mapa,
      filaEnc: filaEnc,
      diaPrimero: diaPrimero,
      modoImporte: hayDebHaber ? 'debe-haber' : (mapa.importe !== undefined ? 'importe' : 'ninguno'),
      cuentas: Object.keys(ctasUsadas).length,
      cuentasConNombre: Object.keys(mapaCtas).length,
      sinDescripcion: sinDesc,
      totalDebito: Math.round(totDeb * 100) / 100,
      totalCredito: Math.round(totCred * 100) / 100
    };
  }

  root.MayorCore = {
    analizar: analizar, detectarEncabezado: detectarEncabezado,
    norm: norm, aNumero: aNumero, esFecha: esFecha, SIN: SIN, ORDEN: ORDEN
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
