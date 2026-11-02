# Prompt para Claude Code — App "Grilla de Mayores"

> Pegá todo lo que sigue como primer mensaje en Claude Code, dentro de una carpeta vacía.
> Adjuntá también `motor-deteccion.js` (el motor ya validado) y al menos un mayor real de ejemplo.

---

Vamos a construir una app web interna para un estudio contable. Antes de escribir una línea
de código leé todo este mensaje: la sección de dominio tiene conocimiento que ya costó caro
y no quiero que lo vuelvas a descubrir.

## 1. El problema

Las contadoras del estudio bajan el libro mayor del sistema contable de cada cliente. Cada
sistema exporta distinto: cambian los nombres de columna, el orden, cuántas filas de título
hay arriba, si los importes vienen en débito/crédito separados o en una sola columna con
signo. Hoy cada una limpia ese archivo a mano en Excel, cada vez.

La app tiene que recibir el mayor como viene y devolver siempre la misma grilla:

| FECHA | CODIGO CUENTA | DESCRIPCION CUENTA | REFERENCIA | MOVIMIENTO |
|-------|---------------|--------------------|------------|------------|

`MOVIMIENTO` = débito − crédito. Positivo es débito, negativo es crédito.

Solo movimientos. Fuera las filas de saldo inicial y saldo final: después del proceso ellas
filtran las cuentas de resultado, que no tienen saldo al inicio, así que esas filas solo
ensucian.

## 2. Quiénes la usan

- **Contadoras** (entre 5 y 10). No son técnicas. Suben un archivo y bajan otro. Todo lo
  que no sea eso tiene que estar escondido detrás de un "ver más".
- **Yo** (consultor BI, administro la app). Ajusto reglas de detección por cliente, miro el
  historial, agrego clientes.

El diseño se optimiza para la contadora, no para mí. Si una pantalla la puede confundir,
está mal hecha aunque sea potente.

## 3. El flujo que quiero

1. Entra, ve la lista de clientes del estudio y elige uno (o arranca sin cliente).
2. Arrastra el archivo del mayor.
3. La app detecta las columnas y muestra: cuántos movimientos salieron, cuántas cuentas,
   total débito, total crédito, y si cuadra o no.
4. Ve una vista previa de las primeras filas.
5. Descarga la grilla en Excel o CSV.
6. Si la detección falló, abre un panel y corrige las columnas a mano con desplegables.
   La grilla se rehace al instante.
7. **Lo que importa de verdad:** cuando corrige el mapeo de columnas, la app le ofrece
   guardar esa configuración para ese cliente. La próxima vez que alguien suba un mayor de
   ese cliente, ya viene bien mapeado. Esto es lo que convierte la herramienta en algo que
   mejora con el uso.

## 4. Anatomía de un mayor — leé esto con atención

El formato más común (sistema tipo Odoo, es el del archivo de ejemplo) viene así:

```
Libro mayor - MILLA SUR S.A.
(filas 2 a 10: filtros aplicados, período, etc.)

1.1.01.0001 - CAJA CENTRAL                              <- fila título de la cuenta
Fecha | Asiento | Diario | Cuenta | Impuestos | Socio |  <- fila de encabezados
      |         |        |        |           | Saldo inicial | ...  <- saldo, NO es movimiento
02/05/2025 | PCAJAS/2025/02603 | CAJAS | 1.1.01.0001 | ... <- movimiento
02/05/2025 | ...                                           <- movimiento
1.1.01.0001 - CAJA CENTRAL | ... | Saldo final | ...       <- saldo, NO es movimiento
(fila en blanco)

1.1.01.0002 - CAJA SUCURSAL                             <- empieza la cuenta siguiente
...
```

Cosas que no se ven a simple vista y te van a morder:

- **La fila de encabezados se repite** una vez por cada cuenta. En el archivo de ejemplo
  aparece 12.158 veces. Hay que detectarla una vez y después saltearla siempre.
- **La descripción de la cuenta solo existe en la fila título.** Los movimientos traen el
  código en la columna `Cuenta`, nunca el nombre. Hay que armar un mapa código → descripción
  con todas las filas título y pegárselo a cada movimiento por el código.
- **Las cuentas de clientes y proveedores vienen abiertas por socio.** Dentro de la cuenta
  `1.3.01.0001 - CUENTAS A COBRAR` hay un sub-bloque por cada empresa, cada uno con su propia
  fila de encabezados y sus filas `Saldo Inicial de empresa` / `Saldo final de empresa`. Los
  movimientos de esos sub-bloques **son movimientos reales de la cuenta, no duplicados**: van
  en la grilla. Lo verifiqué sumando bloque por bloque.
- Hay cuentas que solo tienen saldo inicial y final, sin ningún movimiento. Quedan fuera
  de la grilla y está bien.

Otros sistemas que vamos a encontrar (todavía no los vi, pero el diseño tiene que aguantarlos):

- **Formato plano**: cada fila trae fecha, código de cuenta, descripción de cuenta,
  referencia, debe, haber. Sin filas título.
- **Debe / Haber** en vez de Débito / Crédito.
- **Una sola columna de importe con signo** en vez del par.
- Nombres de columna distintos para lo mismo: referencia, concepto, detalle, leyenda, glosa,
  observaciones, comprobante.

## 5. La regla que separa un movimiento de todo lo demás

Esta regla está validada contra un mayor real de 254.166 filas y da exacto:

> Una fila es un movimiento si y solo si tiene una **fecha parseable** en la columna de fecha
> **y** un **código de cuenta** (propio en su columna, o arrastrado del último título leído).

Eso solo ya deja afuera títulos, encabezados repetidos, saldos, nombres de socio y filas en
blanco, porque ninguno tiene fecha. El filtro de palabras tipo "saldo inicial" es una red de
seguridad para formatos donde esas filas sí traen fecha, no el mecanismo principal.

## 6. Trampas reales — no las descubras de nuevo

1. **El filtro de ruido se come movimientos buenos.** Mi primera versión descartaba cualquier
   fila que tuviera una celda empezando con "transporte", "total" o "arrastre". Perdí 996
   movimientos porque un proveedor se llama **TRANSPORTE AL SUR S.R.L.**. La regla correcta:
   prefijo solo para la familia `saldo …`; para total, totales, subtotal, transporte, arrastre,
   suma y sigue exigí **igualdad exacta** del texto normalizado, y **nunca mires la columna de
   referencia**, que es texto libre del usuario.

2. **dd/mm contra mm/dd.** No lo asumas. Votá sobre todas las fechas del archivo: si aparece
   algún primer componente mayor a 12, es día primero; si aparece algún segundo componente
   mayor a 12, es mes primero. Empate o sin datos: día primero (Argentina). Mostrale a la
   usuaria cuál eligió y dejala cambiarlo.

3. **Coma contra punto decimal.** `1.234,56` y `1,234.56` son el mismo número. Decidí por la
   posición del último separador, no por configuración regional. Manejá también paréntesis
   como negativo y el espacio duro ` `, que aparece en los importes de estos exports.

4. **Encabezados repetidos con el literal "Cuenta"** en la columna de cuenta. Si clasificás
   por "tiene algo en la columna cuenta", te entran los 12.158 encabezados. Descartá la fila
   si el valor de esa columna es un nombre de columna conocido.

5. **Volumen.** El archivo de ejemplo son 254.166 filas y 6 MB. La detección completa corre
   en ~2,5 segundos en Node. Exportar el xlsx tarda ~9 segundos más y pesa 16 MB. No se puede
   bloquear la UI: va en un Web Worker, con progreso real, y el CSV como alternativa rápida.

## 7. El motor ya está escrito y validado

Te adjunto `motor-deteccion.js`. Es JavaScript sin dependencias ni DOM, con la lógica de los
puntos 4, 5 y 6 ya resuelta y probada. **Portalo a TypeScript, no lo reescribas de cero.**
Está en español (nombres de funciones y variables); mantené ese idioma en el dominio.

Lo que te pido que hagas con él:

- Tipalo bien: `Movimiento`, `MapeoColumnas`, `ResultadoAnalisis`.
- Separalo en módulos: normalización de texto, parseo de fechas, parseo de números,
  detección de encabezado, clasificación de filas, análisis.
- Escribile tests unitarios a cada parser, con los casos del punto 6 como casos de prueba.
- No le metas dependencias nuevas salvo que haya una razón fuerte.

## 8. Criterios de aceptación

El test de regresión principal, contra el mayor de ejemplo (254.166 filas):

| Qué | Valor esperado |
|-----|----------------|
| Movimientos extraídos | 193.128 |
| Cuentas distintas | 198 |
| Movimientos sin descripción de cuenta | 0 |
| Movimientos sin fecha válida | 0 |
| Total débito | 61.275.076.216,10 |
| Total crédito | 61.275.076.216,10 |
| Diferencia débito − crédito | exactamente 0,00 |

Escribí ese test primero y que falle. Después hacelo pasar. Si tu implementación da otro
número, es tu implementación la que está mal: estos valores están verificados contra los
saldos finales del propio reporte, cuenta por cuenta.

Además:

- Subir un archivo que no es un mayor da un mensaje claro, no un stack trace.
- Cambiar una columna en el panel de mapeo recalcula sin recargar la página.
- Un mayor de 250.000 filas no congela el navegador en ningún momento.
- La app funciona en pantalla de celular sin scroll horizontal.

## 9. Stack y decisiones ya tomadas

- **Next.js (App Router) + TypeScript + Tailwind.** Node LTS, pnpm.
- **El parseo del Excel corre en el navegador, en un Web Worker, con SheetJS.** Decisión
  deliberada y es la más importante de la arquitectura: son mayores contables de clientes
  reales del estudio. Mientras el archivo no se suba a ningún servidor, no tenemos un
  problema de confidencialidad que resolver. Al servidor van solo los metadatos del proceso
  y las reglas guardadas, nunca los movimientos.
- **Postgres** para clientes, reglas de mapeo y historial. Elegí vos el proveedor y
  justificámelo en una línea.
- **Auth con email del estudio**, un solo rol admin y el resto usuarias. Nada de permisos
  finos en v1.
- Exportar a **xlsx y csv**. El csv va con separador `;`, coma decimal y BOM UTF-8, porque
  lo abren con Excel en español.

Si no estás de acuerdo con alguna de estas decisiones, decímelo antes de implementarla, con
el motivo. No la cambies por tu cuenta.

## 10. Modelo de datos inicial

```
cliente          id, nombre, sistema_contable, creado_en
regla_mapeo      id, cliente_id, nombre, mapeo_columnas (jsonb), fila_encabezado,
                 dia_primero (bool), modo_importe, creada_por, creada_en, activa
procesamiento    id, cliente_id, regla_id, usuario_id, nombre_archivo, filas_origen,
                 movimientos, cuentas, total_debito, total_credito, procesado_en
usuario          id, email, nombre, es_admin
```

En `procesamiento` guardamos el resumen, **nunca los movimientos**.

## 11. Fuera de alcance en v1

No lo construyas aunque te parezca buena idea. Lo anoto para que sepas hacia dónde va:

- Conexión directa a los sistemas contables.
- Clasificación automática de cuentas de resultado.
- Comparar dos mayores entre sí o entre períodos.
- Dashboards y gráficos.
- Multi-estudio / multi-tenant.

## 12. Cómo quiero que trabajes

1. Leé el motor adjunto y el mayor de ejemplo antes de proponer nada.
2. Pasame un plan corto con la estructura de carpetas y el orden de los hitos. Esperá mi OK.
3. Hito 1: el motor portado a TypeScript con sus tests pasando, sin interfaz. Nada de UI
   hasta que el test de regresión del punto 8 esté en verde.
4. Hito 2: la pantalla de subir, procesar, previsualizar y descargar. Sin base de datos.
5. Hito 3: auth, clientes, reglas guardadas e historial.
6. Commits chicos y con mensaje claro. Al final de cada hito, decime qué probaste y qué no.

Reglas que no se negocian:

- Si algo no lo pudiste verificar, decilo. No me digas que funciona porque compila.
- No metas datos de ejemplo inventados en la base.
- Los textos de la interfaz van en español rioplatense, en voz activa, sin jerga técnica.
  La usuaria es contadora: "Subí el mayor", no "Cargar archivo de entrada".
- Los mensajes de error dicen qué pasó y qué hacer, nunca solo "Error".

## 13. Preguntame esto antes de arrancar

- Dónde se va a hostear y si hay restricciones de la consultora.
- Si el login tiene que ir contra el Microsoft 365 del estudio o alcanza con magic link.
- Cuántos clientes y qué sistemas contables usa cada uno, para armar el diccionario de
  sinónimos de columnas con casos reales.
