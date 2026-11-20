/* San Francisco Crust Pizza – Sistema Inteligente de Apoyo a la Toma de Decisiones */
// Nombres por defecto; pueden cambiarse sin tocar el código en data/config.json
let FILES = {
  ventas: 'San_Francisco_Crust_Pizza_Ventas.xlsx',
  clientes: 'San_Francisco_Crust_Pizza_Clientes.xlsx',
  productos: 'San_Francisco_Crust_Pizza_Productos.xlsx'
};
const S = { ventas: [], clientes: new Map(), productos: new Map(), rows: [], charts: {}, src: {}, raw: {}, qa: {}, renamed: {} };
const $ = id => document.getElementById(id);
const fmt$ = v => '$' + Math.round(v).toLocaleString('en-US');
const fmt$2 = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = v => Math.round(v).toLocaleString('en-US');
const fmtP = v => (v * 100).toFixed(1) + '%';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAL = ['#0098cd', '#1b365d', '#f0a202', '#5bb8a6', '#d0342c', '#7c8a96', '#8ccbe6', '#a05195', '#3d9970', '#e07a5f'];

/* ---------- Esquemas, sinónimos y validación ---------- */
const TIPOS = { v: 'Ventas', c: 'Clientes', p: 'Productos' };
// Nombre canónico -> nombres alternativos aceptados (ya normalizados: sin tildes, espacios ni mayúsculas)
const SYN = {
  v: {
    ventaid: ['idventa', 'transaccionid', 'idtransaccion', 'orderid', 'saleid', 'ticket', 'numventa', 'factura'],
    fecha: ['date', 'fechaventa', 'orderdate', 'fechapedido', 'dia'],
    ciudad: ['city', 'localidad'],
    sucursal: ['store', 'tienda', 'local', 'branch', 'storename'],
    clienteid: ['idcliente', 'cliente', 'customerid', 'customer', 'codcliente'],
    productoid: ['idproducto', 'productid', 'sku', 'codproducto', 'codigoproducto'],
    cantidad: ['qty', 'quantity', 'unidades', 'units'],
    preciounitario: ['unitprice', 'precio', 'price'],
    costounitario: ['unitcost', 'costo', 'cost'],
    descuentopct: ['descuento', 'discount', 'discountpct'],
    ventaneta: ['total', 'sales', 'ventas', 'importe', 'monto', 'netsales', 'venta', 'totalventa'],
    costototal: ['totalcost', 'costtotal'],
    utilidadbruta: ['utilidad', 'grossprofit', 'profit', 'ganancia'],
    canal: ['channel'],
    formapago: ['metodopago', 'paymentmethod', 'pago', 'payment'],
    tiempoentregamin: ['tiempoentrega', 'deliverytime'],
    tiempopreparacionmin: ['tiempopreparacion', 'preptime']
  },
  c: {
    clienteid: ['idcliente', 'customerid', 'codcliente', 'cliente'],
    segmento: ['segment', 'tipocliente', 'customersegment'],
    ciudad: ['city'], edad: ['age'], clienteactivo: ['activo', 'active'],
    nps: ['puntuacionnps'], motivoperdida: ['motivo', 'churnreason'], canalfavorito: ['canal', 'preferredchannel']
  },
  p: {
    productoid: ['idproducto', 'productid', 'sku', 'codproducto', 'codigoproducto'],
    categoria: ['category', 'familia', 'linea'],
    producto: ['nombreproducto', 'productname', 'nombre', 'product', 'descripcion'],
    tamano: ['size', 'talla'],
    costousd: ['costo', 'cost', 'costounitario'],
    precioventausd: ['precio', 'price', 'precioventa', 'pvp']
  }
};
// Obligatorias: lista de grupos; cada grupo se cumple si existe alguna de sus columnas
const REQ = {
  v: [['fecha'], ['clienteid'], ['productoid'], ['ventaneta', 'cantidad']],
  c: [['clienteid'], ['segmento']],
  p: [['productoid'], ['producto', 'categoria']]
};
const RECO = {
  v: ['ventaid', 'ciudad', 'sucursal', 'canal', 'cantidad', 'ventaneta', 'costototal', 'utilidadbruta'],
  c: ['ciudad', 'clienteactivo', 'nps', 'motivoperdida'],
  p: ['costousd', 'precioventausd', 'tamano']
};
const LABEL = { ventaid: 'VentaID', fecha: 'Fecha', ciudad: 'Ciudad', sucursal: 'Sucursal', clienteid: 'ClienteID', productoid: 'ProductoID',
  cantidad: 'Cantidad', ventaneta: 'VentaNeta', costototal: 'CostoTotal', utilidadbruta: 'UtilidadBruta', canal: 'Canal', segmento: 'Segmento',
  producto: 'Producto', categoria: 'Categoria', costousd: 'CostoUSD', precioventausd: 'PrecioVentaUSD', tamano: 'Tamaño', clienteactivo: 'ClienteActivo',
  nps: 'NPS', motivoperdida: 'MotivoPerdida' };
const lbl = k => LABEL[k] || k;

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
// Lee un Excel/CSV: toma la hoja con más filas y normaliza los encabezados
function readWB(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true }); // Excel: fechas como serial; CSV: texto sin interpretar (evita desfases por zona horaria)
  let best = [];
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null });
    if (rows.length > best.length) best = rows;
  }
  return best.map(r => { const o = {}; for (const k in r) o[norm(k)] = r[k]; return o; });
}
function headersOf(rows) { const h = new Set(); rows.slice(0, 50).forEach(r => Object.keys(r).forEach(k => h.add(k))); return h; }
// Mapa columna original -> nombre canónico según el tipo de archivo
function mapHeaders(headers, t) {
  const map = {}, used = new Set();
  for (const canon of Object.keys(SYN[t])) if (headers.has(canon)) { map[canon] = canon; used.add(canon); }
  for (const [canon, alts] of Object.entries(SYN[t])) {
    if (used.has(canon)) continue;
    const hit = alts.find(a => headers.has(a) && !map[a]);
    if (hit) { map[hit] = canon; used.add(canon); }
  }
  return map;
}
function evaluar(rows, t) {
  const h = headersOf(rows), map = mapHeaders(h, t), have = new Set(Object.values(map));
  const faltan = REQ[t].filter(g => !g.some(c => have.has(c))).map(g => g.map(lbl).join(' o '));
  const renombradas = Object.entries(map).filter(([a, c]) => a !== c).map(([a, c]) => `${a} → ${lbl(c)}`);
  return { ok: faltan.length === 0, faltan, map, have, renombradas, headers: [...h] };
}
function canonizar(rows, map) {
  return rows.map(r => { const o = {}; for (const k in r) o[map[k] || k] = r[k]; return o; });
}
// Detecta el tipo por sus columnas: Ventas tiene fecha + cliente + producto; Clientes tiene segmento sin producto; Productos sin cliente
function detectarTipo(rows) {
  const e = { v: evaluar(rows, 'v'), c: evaluar(rows, 'c'), p: evaluar(rows, 'p') };
  if (e.v.ok) return { tipo: 'v', e };
  if (e.c.ok && !e.c.headers.some(x => ['productoid', 'idproducto', 'productid', 'sku'].includes(x))) return { tipo: 'c', e };
  if (e.p.ok && !e.p.headers.some(x => ['clienteid', 'idcliente', 'customerid'].includes(x))) return { tipo: 'p', e };
  return { tipo: null, e };
}

const num = v => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[$\s]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');                        // 1.234 (miles con punto)
  else if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');                              // 12,50
  else s = s.replace(/,/g, '');                                                           // 1,234.56
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
};
// Orden de fechas texto D/M/A vs M/D/A detectado por archivo: por defecto D/M/A (España y Ecuador)
function ordenFechas(rows) {
  let dm = 0, md = 0;
  for (const r of rows) {
    const m = typeof r.fecha === 'string' && r.fecha.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{4}/);
    if (m) { if (+m[1] > 12) dm++; else if (+m[2] > 12) md++; }
  }
  return md > dm ? 'md' : 'dm';
}
let ORDEN = 'dm';
function toISO(v) {
  let d = null;
  if (v instanceof Date) d = new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 864e5));
  else {
    const s = String(v ?? '').trim(); if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) {
      let a = +m[1], b = +m[2];
      const [mes, dia] = a > 12 ? [b, a] : b > 12 ? [a, b] : ORDEN === 'md' ? [a, b] : [b, a];
      d = new Date(Date.UTC(+m[3], mes - 1, dia));
    } else { const x = new Date(s); if (!isNaN(x)) d = x; }
  }
  if (!d || isNaN(d)) return null;
  const y = d.getUTCFullYear(); if (y < 2000 || y > 2100) return null;
  return d.toISOString().slice(0, 10);
}

function buildProductos(rows) {
  const m = new Map(), q = { leidas: rows.length, sinId: 0, dup: 0, sinPrecio: 0 };
  for (const r of rows) {
    if (r.productoid == null || r.productoid === '') { q.sinId++; continue; }
    const id = String(r.productoid).trim(); if (m.has(id)) q.dup++;
    const precio = num(r.precioventausd), costo = num(r.costousd); if (!precio) q.sinPrecio++;
    m.set(id, { id, cat: r.categoria || 'Sin categoría', nombre: r.producto || id, tam: r.tamano || '', costo, precio, activo: r.activo });
  }
  return { map: m, q };
}
function buildClientes(rows) {
  const m = new Map(), q = { leidas: rows.length, sinId: 0, dup: 0, sinSeg: 0 };
  for (const r of rows) {
    if (r.clienteid == null || r.clienteid === '') { q.sinId++; continue; }
    const id = String(r.clienteid).trim(); if (m.has(id)) q.dup++;
    if (!r.segmento) q.sinSeg++;
    m.set(id, { id, seg: r.segmento || 'Sin segmento', ciudad: r.ciudad, edad: num(r.edad), activo: r.clienteactivo, nps: num(r.nps), motivo: r.motivoperdida, canalFav: r.canalfavorito });
  }
  return { map: m, q };
}
function buildVentas(rows, prods, clis) {
  const out = [], ids = new Set(), sinCliIds = new Set(), sinProdIds = new Set();
  const q = { leidas: rows.length, validas: 0, sinFecha: 0, montoCero: 0, negativos: 0, dupId: 0, sinCli: 0, sinProd: 0, sinSuc: 0 };
  ORDEN = ordenFechas(rows); q.ordenFechas = ORDEN;
  rows.forEach((r, i) => {
    const fecha = toISO(r.fecha); if (!fecha) { q.sinFecha++; return; }
    const pid = String(r.productoid ?? '').trim(), cid = String(r.clienteid ?? '').trim();
    const p = prods.get(pid), c = clis.get(cid);
    if (!p) { q.sinProd++; sinProdIds.add(pid); }
    if (!c) { q.sinCli++; sinCliIds.add(cid); }
    const cant = num(r.cantidad) || 1;
    const venta = r.ventaneta != null ? num(r.ventaneta) : num(r.preciounitario ?? p?.precio) * cant * (1 - num(r.descuentopct) / 100);
    const costo = r.costototal != null ? num(r.costototal) : num(r.costounitario ?? p?.costo) * cant;
    const util = r.utilidadbruta != null ? num(r.utilidadbruta) : venta - costo;
    if (venta === 0) q.montoCero++; if (venta < 0) q.negativos++;
    let id = r.ventaid != null && r.ventaid !== '' ? String(r.ventaid) : 'fila' + i;
    if (ids.has(id)) q.dupId++; ids.add(id);
    if (!r.sucursal) q.sinSuc++;
    out.push({
      id, fecha, mes: fecha.slice(0, 7), ciudad: r.ciudad || 'Sin ciudad', suc: r.sucursal || 'Sin sucursal',
      cli: cid, seg: c?.seg || 'Sin segmento', pid,
      prod: p ? `${p.nombre}${p.tam ? ' (' + p.tam + ')' : ''}` : (pid || 'Sin producto'), cat: p?.cat || 'Sin categoría',
      cant, venta, costo, util, desc: num(r.descuentopct), canal: r.canal || 'Sin canal', pago: r.formapago || 'NA',
      tEnt: num(r.tiempoentregamin), tPrep: num(r.tiempopreparacionmin)
    });
  });
  q.validas = out.length;
  q.ejemplosSinCli = [...sinCliIds].slice(0, 5); q.ejemplosSinProd = [...sinProdIds].slice(0, 5);
  const f = out.map(v => v.fecha).sort(); q.desde = f[0]; q.hasta = f[f.length - 1];
  return { list: out, q };
}

/* ---------- Carga de datos ---------- */
async function fetchBuf(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url.split('/').pop()); return r.arrayBuffer(); }
async function loadDefault() {
  $('loader').style.display = 'flex'; S.qaVisible = false; $('upStatus').textContent = '';
  try { const cfg = await fetch('data/config.json', { cache: 'no-cache' }); if (cfg.ok) FILES = Object.assign(FILES, await cfg.json()); } catch (e) { }
  const orden = [['p', FILES.productos], ['c', FILES.clientes], ['v', FILES.ventas]];
  const errores = [];
  const raw = {}, info = {};
  await Promise.all(orden.map(async ([t, name]) => {
    try {
      const rows = readWB(await fetchBuf('data/' + name));
      const ev = evaluar(rows, t);
      if (!rows.length) errores.push(`${TIPOS[t]} (${name}): archivo vacío`);
      else if (!ev.ok) errores.push(`${TIPOS[t]} (${name}): faltan columnas ${ev.faltan.join(', ')}`);
      else { raw[t] = canonizar(rows, ev.map); info[t] = ev; }
    } catch (e) { errores.push(`${TIPOS[t]}: no se encontró data/${name}`); }
  }));
  if (raw.v) {
    S.raw = raw; S.renamed = {}; S.reco = {};
    for (const t in info) { S.renamed[t] = info[t].renombradas; S.reco[t] = RECO[t].filter(c => !info[t].have.has(c)); }
    S.src = { p: `Productos (${FILES.productos})`, c: `Clientes (${FILES.clientes})`, v: `Ventas (${FILES.ventas})` };
    rebuild();
  }
  S.loadErrors = errores; renderQA();
  $('loader').style.display = 'none';
  if (!raw.v) { show('data'); $('upStatus').innerHTML = `<span class="tag r">✖</span> No se pudo cargar la base de ventas por defecto. Cargue los archivos manualmente.`; }
}
function rebuild() {
  const P = buildProductos(S.raw.p || []), C = buildClientes(S.raw.c || []), V = buildVentas(S.raw.v || [], P.map, C.map);
  S.productos = P.map; S.clientes = C.map; S.ventas = V.list; S.qa = { p: P.q, c: C.q, v: V.q };
  initFilters(); refresh(); renderQA(); renderHome();
  const alerta = qaAlertas().length ? ' · ⚠ revisar calidad de datos en “Cargar datos”' : '';
  $('dsinfo').textContent = `${S.src.v} · ${fmtN(S.ventas.length)} registros · ${V.q.desde || ''} a ${V.q.hasta || ''} · ${S.clientes.size} clientes · ${S.productos.size} productos${alerta}`;
}
async function upload(input, slot) {
  const f = input.files[0]; if (!f) return;
  const st = $('upStatus'); st.textContent = 'Procesando ' + f.name + '…';
  try {
    const rows = readWB(await f.arrayBuffer());
    if (!rows.length) throw new Error('el archivo no contiene filas de datos.');
    let t = slot, ev = evaluar(rows, slot), nota = '';
    if (!ev.ok || (slot !== 'v' && evaluar(rows, 'v').ok)) {
      const d = detectarTipo(rows);
      if (d.tipo && d.tipo !== slot) { t = d.tipo; ev = d.e[t]; nota = ` Se detectó que es un archivo de <b>${TIPOS[t]}</b> (no de ${TIPOS[slot]}) y se cargó como ${TIPOS[t]}.`; }
      else if (!ev.ok) throw new Error(`no tiene la estructura de ${TIPOS[slot]}. Faltan columnas obligatorias: <b>${ev.faltan.join(', ')}</b>.<br>Columnas encontradas: ${esc(ev.headers.slice(0, 25).join(', '))}`);
    }
    const canon = canonizar(rows, ev.map);
    // Prueba antes de reemplazar: si las ventas resultan inválidas, se conservan los datos anteriores
    const P = t === 'p' ? buildProductos(canon) : buildProductos(S.raw.p || []);
    const C = t === 'c' ? buildClientes(canon) : buildClientes(S.raw.c || []);
    const V = buildVentas(t === 'v' ? canon : (S.raw.v || []), P.map, C.map);
    if (t === 'v' && !V.list.length) throw new Error(`ninguna fila tiene una fecha válida en la columna Fecha (${fmtN(V.q.sinFecha)} filas descartadas).`);
    if (t === 'p' && !P.map.size) throw new Error('ninguna fila tiene ProductoID.');
    if (t === 'c' && !C.map.size) throw new Error('ninguna fila tiene ClienteID.');
    S.raw[t] = canon; S.src[t] = `${TIPOS[t]} (${f.name})`; S.qaVisible = true;
    S.renamed[t] = ev.renombradas; S.reco = S.reco || {}; S.reco[t] = RECO[t].filter(c => !ev.have.has(c));
    rebuild();
    const al = qaAlertas();
    st.innerHTML = `<span class="tag g">✔</span> <b>${esc(f.name)}</b>: ${fmtN(rows.length)} filas leídas como ${TIPOS[t]}. Indicadores actualizados.${nota}` +
      (al.length ? ` <span class="tag y">⚠ ${al.length} advertencia(s)</span>, vea el informe de calidad.` : '');
  } catch (e) {
    st.innerHTML = `<span class="tag r">✖</span> <b>${esc(f.name)}</b> rechazado: ${e.message}<br>Los datos anteriores se mantienen sin cambios.`;
  }
  input.value = '';
}
function qaAlertas() {
  const a = [], v = S.qa.v || {}, p = S.qa.p || {}, c = S.qa.c || {};
  if (!v.leidas) return a;
  const pct = n => fmtP(n / (v.validas || 1));
  if (v.sinFecha) a.push(['y', `${fmtN(v.sinFecha)} filas de ventas descartadas por fecha vacía o inválida.`]);
  if (v.sinCli) a.push([v.sinCli / v.validas > .5 ? 'r' : 'y', `${fmtN(v.sinCli)} ventas (${pct(v.sinCli)}) tienen un ClienteID que no existe en Clientes${v.sinCli === v.validas ? ': <b>los archivos no se relacionan</b>' : ''}. Se muestran como “Sin segmento”. Ej.: ${esc(v.ejemplosSinCli.join(', '))}. Cargue una base de Clientes actualizada.`]);
  if (v.sinProd) a.push([v.sinProd / v.validas > .5 ? 'r' : 'y', `${fmtN(v.sinProd)} ventas (${pct(v.sinProd)}) tienen un ProductoID que no existe en Productos${v.sinProd === v.validas ? ': <b>los archivos no se relacionan</b>' : ''}. Se muestran como “Sin categoría”. Ej.: ${esc(v.ejemplosSinProd.join(', '))}. Cargue una base de Productos actualizada.`]);
  if (v.montoCero) a.push(['y', `${fmtN(v.montoCero)} ventas con monto 0 (revise VentaNeta o precios).`]);
  if (v.negativos) a.push(['y', `${fmtN(v.negativos)} ventas con monto negativo (posibles devoluciones).`]);
  if (v.dupId) a.push(['y', `${fmtN(v.dupId)} filas con VentaID repetido: se cuentan como una misma transacción.`]);
  if (v.sinSuc) a.push(['y', `${fmtN(v.sinSuc)} ventas sin sucursal.`]);
  if (p.dup) a.push(['y', `${fmtN(p.dup)} ProductoID duplicados en Productos (se usa el último).`]);
  if (c.dup) a.push(['y', `${fmtN(c.dup)} ClienteID duplicados en Clientes (se usa el último).`]);
  if (c.sinSeg) a.push(['y', `${fmtN(c.sinSeg)} clientes sin segmento.`]);
  for (const t of ['v', 'c', 'p']) if (S.reco?.[t]?.length) a.push(['y', `${TIPOS[t]}: faltan columnas recomendadas ${S.reco[t].map(lbl).join(', ')}; algunos indicadores quedarán incompletos.`]);
  return a;
}
function renderQA() {
  const v = S.qa.v || {}, p = S.qa.p || {}, c = S.qa.c || {};
  let h = '';
  (S.loadErrors || []).forEach(e => h += `<div class="qa r">✖ ${esc(e)}</div>`);
  if (v.leidas) {
    h += `<table><thead><tr><th>Base</th><th>Origen</th><th>Filas leídas</th><th>Registros válidos</th><th>Detalle</th></tr></thead><tbody>
      <tr><td>Ventas</td><td>${esc(S.src.v)}</td><td>${fmtN(v.leidas)}</td><td>${fmtN(v.validas)}</td><td>${v.desde} a ${v.hasta}</td></tr>
      <tr><td>Clientes</td><td>${esc(S.src.c || '—')}</td><td>${fmtN(c.leidas || 0)}</td><td>${fmtN(S.clientes.size)}</td><td>${fmtN(c.sinId || 0)} sin ID</td></tr>
      <tr><td>Productos</td><td>${esc(S.src.p || '—')}</td><td>${fmtN(p.leidas || 0)}</td><td>${fmtN(S.productos.size)}</td><td>${fmtN(p.sinId || 0)} sin ID</td></tr></tbody></table>`;
    const rel = [['Clientes', v.sinCli], ['Productos', v.sinProd]].map(([n, x]) => `${n}: ${fmtP(1 - x / (v.validas || 1))} de las ventas relacionadas`).join(' · ');
    h += `<p class="status">Integridad referencial — ${rel}</p>`;
    const al = qaAlertas();
    h += al.length ? al.map(([k, t]) => `<div class="qa ${k}">${k === 'r' ? '✖' : '⚠'} ${t}</div>`).join('') : '<div class="qa g">✔ Sin problemas de calidad ni de relación entre las bases.</div>';
    const ren = Object.entries(S.renamed || {}).filter(([, l]) => l.length).map(([t, l]) => `${TIPOS[t]}: ${esc(l.join(', '))}`);
    if (ren.length) h += `<p class="status">Columnas reconocidas por sinónimo — ${ren.join(' · ')}</p>`;
  }
  $('qa').innerHTML = h;
  // Visible solo tras cargar datos nuevos, o si la carga por defecto tuvo errores o advertencias
  $('qaCard').style.display = (S.qaVisible || (S.loadErrors || []).length || (v.leidas && qaAlertas().length)) ? '' : 'none';
}


/* ---------- Filtros ---------- */
const FSEL = { fCiudad: 'ciudad', fSucursal: 'suc', fSegmento: 'seg', fCategoria: 'cat', fProducto: 'prod', fCanal: 'canal' };
function fillSelect(id, vals) {
  const cur = $(id).value;
  $(id).innerHTML = '<option value="">Todos</option>' + [...vals].sort().map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if ([...vals].includes(cur)) $(id).value = cur;
}
function initFilters() {
  for (const [id, k] of Object.entries(FSEL)) fillSelect(id, new Set(S.ventas.map(v => v[k])));
  const f = S.ventas.map(v => v.fecha).sort();
  S.fMin = f[0] || ''; S.fMax = f[f.length - 1] || '';
  $('fDesde').value = S.fMin; $('fHasta').value = S.fMax;
}
function cascade() { // sucursal y producto dependientes
  const c = $('fCiudad').value, cat = $('fCategoria').value;
  fillSelect('fSucursal', new Set(S.ventas.filter(v => !c || v.ciudad === c).map(v => v.suc)));
  fillSelect('fProducto', new Set(S.ventas.filter(v => !cat || v.cat === cat).map(v => v.prod)));
}
const selActivos = () => Object.entries(FSEL).map(([id, k]) => [k, $(id).value]).filter(x => x[1]);
function filtrar(d1, d2) {
  const sel = selActivos();
  return S.ventas.filter(v => (!d1 || v.fecha >= d1) && (!d2 || v.fecha <= d2) && sel.every(([k, val]) => v[k] === val));
}
function applyFilters() {
  S.aviso = '';
  if ($('fDesde').value && $('fHasta').value && $('fDesde').value > $('fHasta').value) { // fechas invertidas: se corrigen solas
    const a = $('fDesde').value; $('fDesde').value = $('fHasta').value; $('fHasta').value = a;
    S.aviso = '↔ “Fecha desde” era posterior a “Fecha hasta”; se intercambiaron automáticamente.';
  }
  S.rows = filtrar($('fDesde').value, $('fHasta').value);
}

/* ---------- Filtro cruzado (clic en gráficas) y chips de filtros activos ---------- */
const CHART_FILTER = { cTopProd: 'fProducto', cProdUtil: 'fProducto', cMatriz: 'fProducto', cCiudad: 'fCiudad', cSucursal: 'fSucursal',
  cSucMargen: 'fSucursal', cSucTiempo: 'fSucursal', cSegmento: 'fSegmento', cSegTicket: 'fSegmento', cCategoria: 'fCategoria', cCanal: 'fCanal' };
const FNAME = { fCiudad: 'Ciudad', fSucursal: 'Sucursal', fSegmento: 'Segmento', fCategoria: 'Categoría', fProducto: 'Producto', fCanal: 'Canal' };
function crossFilter(fid, val) {
  const s = $(fid);
  if (s.value === val) s.value = '';
  else {
    if (![...s.options].some(o => o.value === val)) { // opción oculta por un filtro padre: liberar el padre
      if (fid === 'fSucursal') $('fCiudad').value = '';
      if (fid === 'fProducto') $('fCategoria').value = '';
      cascade();
    }
    s.value = val;
  }
  if (fid === 'fCiudad' || fid === 'fCategoria') cascade();
  refresh();
}
function renderChips() {
  const f = S.ventas.map(v => v.fecha), min = S.fMin, max = S.fMax;
  const chips = Object.keys(FSEL).filter(id => $(id).value).map(id => [id, `${FNAME[id]}: ${$(id).value}`]);
  if (($('fDesde').value && $('fDesde').value !== min) || ($('fHasta').value && $('fHasta').value !== max)) chips.unshift(['fFechas', `Fechas: ${$('fDesde').value} a ${$('fHasta').value}`]);
  $('chips').innerHTML = chips.length
    ? chips.map(([id, t]) => `<span class="chip">${esc(t)}<button data-f="${id}" title="Quitar filtro">×</button></span>`).join('') + '<button class="chip clear" data-f="all">Limpiar todo</button>'
    : '<span class="hint">💡 Haga clic en una barra o sector de las gráficas para filtrar todo el dashboard por ese valor. · <a href="#" class="glink">📖 Glosario de indicadores</a></span>';
  const gl = $('chips').querySelector('.glink');
  if (gl) gl.onclick = e => { e.preventDefault(); openGlossary(); };
  if (S.aviso) $('chips').insertAdjacentHTML('afterbegin', `<span class="notice">${S.aviso}</span>`);
  if (S.ventas.length && !S.rows.length) $('chips').insertAdjacentHTML('afterbegin',
    '<span class="notice bad">⚠ Sin datos para los filtros seleccionados: los indicadores y gráficas quedan vacíos. <button data-f="all">Limpiar filtros</button></span>');
  $('chips').querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
    const id = b.dataset.f;
    if (id === 'all') return $('fReset').click();
    if (id === 'fFechas') { $('fDesde').value = min; $('fHasta').value = max; }
    else { $(id).value = ''; if (id === 'fCiudad' || id === 'fCategoria') cascade(); }
    refresh();
  });
}

/* ---------- Agregaciones ---------- */
function group(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    let g = m.get(k); if (!g) m.set(k, g = { k, venta: 0, util: 0, costo: 0, cant: 0, tx: new Set(), cli: new Set(), tEnt: 0, nEnt: 0, tPrep: 0, desc: 0, descM: 0, nDesc: 0, nLin: 0, nTarde: 0 });
    g.venta += r.venta; g.util += r.util; g.costo += r.costo; g.cant += r.cant; g.tx.add(r.id); g.cli.add(r.cli); g.nLin++;
    if (r.tEnt > 0) { g.tEnt += r.tEnt; g.nEnt++; if (r.tEnt > UMBRAL_ENTREGA) g.nTarde++; } g.tPrep += r.tPrep; g.desc += r.desc;
    if (r.desc > 0 && r.desc < 100) { g.descM += r.venta / (1 - r.desc / 100) - r.venta; g.nDesc++; } // monto cedido = precio de lista − venta neta
  }
  return [...m.values()].map(g => ({ ...g, ntx: g.tx.size, ncli: g.cli.size, margen: g.venta ? g.util / g.venta : 0, ticket: g.tx.size ? g.venta / g.tx.size : 0,
    entrega: g.nEnt ? g.tEnt / g.nEnt : 0, prep: g.ntx ? g.tPrep / g.ntx : 0, pctDesc: g.nLin ? g.nDesc / g.nLin : 0, pctTarde: g.nEnt ? g.nTarde / g.nEnt : 0 }));
}
function kpis(rows) {
  const g = group(rows, () => 'all')[0] || { venta: 0, util: 0, margen: 0, ticket: 0, ncli: 0, ntx: 0, cant: 0 };
  return g;
}

/* ---------- Render ---------- */
const FMTS = { '$': fmt$, '$2': fmt$2, n: v => fmtN(v) + ' u.', '%': v => v.toFixed(1) + '%', min: v => v.toFixed(1) + ' min', x: v => v.toFixed(1) };
const REDUCED =window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function chart(id, cfg) {
  const fid = CHART_FILTER[id];
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: REDUCED ? 0 : 700, easing: 'easeOutQuart' },
    plugins: { legend: { position: 'bottom' } } }, cfg.options || {});
  // Tooltips con formato de negocio ($, %, unidades, minutos) y % del total en gráficos circulares
  cfg.options.plugins = cfg.options.plugins || { legend: { position: 'bottom' } };
  if (!cfg.options.plugins.tooltip) cfg.options.plugins.tooltip = { callbacks: { label: c => {
    const f = FMTS[c.dataset.fmt || '$'], v = typeof c.raw === 'object' ? c.parsed.y : c.raw;
    if (['pie', 'doughnut'].includes(c.chart.config.type)) {
      const tot = c.dataset.data.reduce((s, x) => s + x, 0);
      return ` ${c.label}: ${f(v)} (${fmtP(v / (tot || 1))})`;
    }
    return ` ${c.dataset.label || c.label}: ${f(v)}`;
  } } };
  if (fid) {
    cfg.options.onClick = (e, els, ch) => {
      if (!els.length) return;
      const el = els[0], lab = ch.config.type === 'bubble' ? ch.data.datasets[el.datasetIndex].label : ch.data.labels[el.index];
      crossFilter(fid, lab);
    };
    cfg.options.onHover = (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
  }
  const old = S.charts[id];
  if (old && old.config.type === cfg.type) { old.data = cfg.data; old.options = cfg.options; old.update(); return; } // transición suave
  if (old) old.destroy();
  S.charts[id] = new Chart($(id), cfg);
}

/* ---------- KPI animados: contador, variación vs periodo anterior y mini tendencia ---------- */
const KDEF = [
  ['venta', 'Ventas totales', fmt$, 'Suma de VentaNeta (después de descuentos) del periodo filtrado'],
  ['util', 'Utilidad bruta', fmt$, 'Ventas − Costo total de los productos vendidos'],
  ['margen', 'Margen bruto', fmtP, 'Utilidad bruta ÷ Ventas totales'],
  ['ticket', 'Ticket promedio', fmt$2, 'Ventas totales ÷ N.º de transacciones'],
  ['ncli', 'N.º clientes', fmtN, 'Clientes distintos (ClienteID) con al menos una compra en el periodo'],
  ['ntx', 'N.º transacciones', fmtN, 'Ventas distintas (VentaID) en el periodo'],
  ['cant', 'Unidades vendidas', fmtN, 'Suma de Cantidad vendida'],
  ['descM', 'Descuentos otorgados', fmt$, 'Monto cedido por descuentos: precio de lista − venta neta. Más descuento = menos margen', true]];
const UMBRAL_ENTREGA = 35; // minutos; referencia definida por el equipo (el caso no fija un objetivo de entrega)
function animateNum(el, from, to, fmt) {
  if (REDUCED || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 800, tok = (el._tok = (el._tok || 0) + 1);
  const step = () => { if (el._tok !== tok) return; const p = Math.max(0, Math.min(1, (performance.now() - t0) / dur)), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { if (el._tok === tok) el.textContent = fmt(to); }, dur + 150); // respaldo si la pestaña está en segundo plano
}
const isoAdd = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
// Comparación: periodo anterior de igual duración; si no hay datos, 2.ª mitad vs 1.ª mitad del rango elegido
function comparacion() {
  const d1 = $('fDesde').value || S.fMin, d2 = $('fHasta').value || S.fMax;
  if (!d1 || !d2) return null;
  const dias = Math.round((Date.parse(d2) - Date.parse(d1)) / 864e5) + 1;
  const prev = filtrar(isoAdd(d1, -dias), isoAdd(d1, -1));
  if (prev.length) return { cur: kpis(S.rows), prev: kpis(prev), label: 'vs periodo anterior' };
  const mid = isoAdd(d1, Math.floor(dias / 2));
  const a = filtrar(d1, isoAdd(mid, -1)), b = filtrar(mid, d2);
  if (!a.length || !b.length) return null;
  return { cur: kpis(b), prev: kpis(a), label: `2.ª mitad vs 1.ª mitad del periodo` };
}
function sparkSVG(vals) {
  if (vals.length < 2) return '';
  const w = 120, h = 30, mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 3 - ((v - mn) / rg) * (h - 6)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark"><polygon points="0,${h} ${line} ${w},${h}" class="area"/><polyline points="${line}"/></svg>`;
}
function renderKPIs(K, byMes) {
  if (!$('kpis').children.length) {
    $('kpis').innerHTML = KDEF.map(([k, l, , tip]) => `<div class="kpi" data-k="${k}" title="${tip}"><div class="l">${l}<span class="i">ⓘ</span></div><div class="v">—</div><div class="d"></div><div class="sp"></div></div>`).join('');
    observeReveal($('kpis'));
    $('kpis').querySelectorAll('.kpi').forEach((box, i) => box.querySelector('.i').onclick = () => openGlossary(KDEF[i][1])); // ⓘ abre su definición
  }
  S.kPrev = S.kPrev || {};
  const cmp = comparacion();
  for (const [k, , fmt, , inv] of KDEF) {
    const box = $('kpis').querySelector(`[data-k="${k}"]`), val = K[k] || 0;
    animateNum(box.querySelector('.v'), S.kPrev[k] ?? 0, val, fmt); S.kPrev[k] = val;
    let d = '';
    if (cmp) {
      const c = cmp.cur[k] || 0, p = cmp.prev[k] || 0, cls = up => (up !== !!inv) ? 'up' : 'down'; // inv: subir es malo (descuentos)
      if (k === 'margen') { const pp = (c - p) * 100; d = `<span class="${cls(pp >= 0)}">${pp >= 0 ? '▲' : '▼'} ${Math.abs(pp).toFixed(1)} pp</span>`; }
      else if (p) { const r = (c - p) / p; d = `<span class="${cls(r >= 0)}">${r >= 0 ? '▲' : '▼'} ${Math.abs(r * 100).toFixed(1)}%</span>`; }
      if (d) d += ` <small>${cmp.label}</small>`;
    }
    if (k === 'descM') d = `<div class="x">${fmtP(K.pctDesc || 0)} de las ventas con descuento</div>` + d;
    box.querySelector('.d').innerHTML = d;
    box.querySelector('.sp').innerHTML = sparkSVG(byMes.map(m => m[k] || 0));
  }
}

/* ---------- Comparativo anual (los dos últimos años con datos; ignora el filtro de fechas) ---------- */
function renderYoY() {
  const base = filtrar('', ''), anios = [...new Set(base.map(v => v.fecha.slice(0, 4)))].sort();
  if (anios.length < 2) {
    $('yoyTitle').textContent = 'Comparativo anual';
    $('tYoY').innerHTML = '<p class="status">Se necesitan datos de al menos dos años para comparar.</p>';
    if (S.charts.cYoY) { S.charts.cYoY.destroy(); delete S.charts.cYoY; }
    return;
  }
  const [a0, a1] = anios.slice(-2), A = base.filter(v => v.fecha.startsWith(a0)), B = base.filter(v => v.fecha.startsWith(a1));
  const kA = kpis(A), kB = kpis(B);
  $('yoyTitle').textContent = `Comparativo anual ${a0} vs ${a1}`;
  const filas = [['Ventas totales', 'venta', fmt$], ['Utilidad bruta', 'util', fmt$], ['Margen bruto', 'margen', fmtP, 'pp'], ['Ticket promedio', 'ticket', fmt$2],
    ['N.º transacciones', 'ntx', fmtN], ['N.º clientes', 'ncli', fmtN], ['Unidades vendidas', 'cant', fmtN], ['Descuentos otorgados', 'descM', fmt$, '', true],
    ['Entrega media (min)', 'entrega', v => v.toFixed(1), '', true]];
  const varCel = (a, b, pp, inv) => {
    if (pp) { const d = (b - a) * 100; return `<span class="${(d >= 0) !== !!inv ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)} pp</span>`; }
    if (!a) return '—';
    const r = (b - a) / a; return `<span class="${(r >= 0) !== !!inv ? 'up' : 'down'}">${r >= 0 ? '▲' : '▼'} ${Math.abs(r * 100).toFixed(1)}%</span>`;
  };
  $('tYoY').innerHTML = `<table><thead><tr><th>Indicador</th><th>${a0}</th><th>${a1}</th><th>Variación</th></tr></thead><tbody>` +
    filas.map(([l, k, f, pp, inv]) => `<tr><td>${l}</td><td>${f(kA[k] || 0)}</td><td>${f(kB[k] || 0)}</td><td>${varCel(kA[k] || 0, kB[k] || 0, pp, inv)}</td></tr>`).join('') + '</tbody></table>';
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const serie = rows => { const m = Array(12).fill(0); rows.forEach(v => m[+v.fecha.slice(5, 7) - 1] += v.venta); return m; };
  chart('cYoY', { type: 'bar', data: { labels: MES, datasets: [
    { label: `Ventas ${a0}`, data: serie(A), backgroundColor: PAL[6] },
    { label: `Ventas ${a1}`, data: serie(B), backgroundColor: PAL[0] }] },
    options: { scales: { y: moneyAxis } } });
}

/* ---------- Hallazgos clave automáticos ---------- */
function renderInsights(R, byMes, bySuc, byProd, bySeg, K) {
  // Tendencia (banda superior) + matriz Dimensión × (mejor / a atender): responde a las preguntas 2, 3 y 4 del caso
  let trend = '';
  if (byMes.length >= 2) {
    const n = byMes.length >= 24 ? 12 : Math.floor(byMes.length / 2);
    const ult = byMes.slice(-n).reduce((s, d) => s + d.venta, 0), ant = byMes.slice(-2 * n, -n).reduce((s, d) => s + d.venta, 0);
    if (ant) {
      const r = (ult - ant) / ant;
      // Descomposición: Ventas = Transacciones × Ticket → ¿la variación viene de cuántas compras o de cuánto se gasta por compra?
      const txU = byMes.slice(-n).reduce((s, d) => s + d.ntx, 0), txA = byMes.slice(-2 * n, -n).reduce((s, d) => s + d.ntx, 0);
      const rTx = txA ? (txU - txA) / txA : 0, rTk = txA && txU ? (ult / txU - ant / txA) / (ant / txA) : 0;
      const sg = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
      const motor = Math.abs(rTx) >= Math.abs(rTk) ? 'del número de compras (transacciones)' : 'del gasto por compra (ticket promedio)';
      const causa = `<div class="causa"><b>Causa:</b> la variación viene principalmente ${motor}. Transacciones <span class="${rTx >= 0 ? 'up' : 'down'}">${sg(rTx)}</span> · Ticket promedio <span class="${rTk >= 0 ? 'up' : 'down'}">${sg(rTk)}</span></div>`;
      trend =`<div class="ins wide ${r >= 0 ? 'good' : 'bad'}"><div class="ico">${r >= 0 ? '📈' : '📉'}</div><div><div class="l">Tendencia de ventas</div>
        <div class="v ${r >= 0 ? 'up' : 'down'}">${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(1)}%</div>
        <div class="s">Últimos ${n} meses (${fmt$(ult)}) vs ${n} meses anteriores (${fmt$(ant)})</div>${causa}</div></div>`;
    }
  }
  const seg = segInfo(), byU = a => [...a].sort((x, y) => y.util - x.util), byV = a => [...a].sort((x, y) => y.venta - x.venta);
  const sB = byU(bySuc)[0], sW = byU(bySuc).at(-1), pB = byU(byProd)[0], pW = byU(byProd).at(-1), gB = byV(bySeg)[0], gW = byV(bySeg).at(-1);
  const card = (kind, ico, t, d, s, fid) => d ? `<div class="ins ${kind}" data-fid="${fid}" data-val="${esc(d.k)}" title="Clic para filtrar">
    <div class="ico">${ico}</div><div><div class="l">${t}</div><div class="v ${kind === 'bad' ? 'down' : ''}">${esc(d.k)}</div><div class="s">${s}</div></div></div>`
    : `<div class="ins empty"><div class="s">Sin comparación con el filtro actual</div></div>`;
  const solo = a => a.length < 2;
  const cols = [
    ['🏬 Sucursales', card('good', '🏆', 'Mejor desempeño', sB, sB && `${fmt$(sB.util)} de utilidad · margen ${fmtP(sB.margen)} · ticket ${fmt$2(sB.ticket)}`, 'fSucursal'),
      card('bad', '⚠️', 'Menor desempeño', solo(bySuc) ? null : sW, sW && `${fmt$(sW.util)} de utilidad · margen ${fmtP(sW.margen)} · ${fmt$(sB.util - sW.util)} menos que la mejor`, 'fSucursal')],
    ['🍕 Productos', card('good', '💰', 'Más rentable', pB, pB && `${fmt$(pB.util)} · ${fmtP(pB.util / (K.util || 1))} de la utilidad · margen ${fmtP(pB.margen)}`, 'fProducto'),
      card('bad', '🔍', 'A revisar', solo(byProd) ? null : pW, pW && `Menor utilidad: ${fmt$(pW.util)} · margen ${fmtP(pW.margen)} · ${fmtN(pW.cant)} u.`, 'fProducto')],
    ['👥 Segmentos', card('good', '⭐', 'Segmento líder', gB, gB && `${fmtP(gB.venta / (K.venta || 1))} de las ventas · ticket ${fmt$2(gB.ticket)} · ${fmtP(seg[gB.k]?.act || 0)} activos`, 'fSegmento'),
      card('bad', '📌', 'Menor participación', solo(bySeg) ? null : gW, gW && `${fmtP(gW.venta / (K.venta || 1))} de las ventas · ticket ${fmt$2(gW.ticket)} · ${fmtP(seg[gW.k]?.act || 0)} activos${seg[gW.k]?.motivo ? ' · pérdida: ' + esc(seg[gW.k].motivo) : ''}`, 'fSegmento')]
  ];
  $('insights').innerHTML = trend + cols.map(([h, a, b]) => `<div class="ins-col"><div class="ins-h">${h}</div>${a}${b}</div>`).join('');
  $('insights').querySelectorAll('[data-fid]').forEach(el => el.onclick = () => crossFilter(el.dataset.fid, el.dataset.val));
  observeReveal($('insights'));
}

/* ---------- Portada (Inicio): cifras macro de toda la base, sin filtros ---------- */
function renderHome() {
  const all = S.ventas; if (!all.length) return;
  const K = kpis(all), meses = group(all, 'mes').sort((a, b) => a.k.localeCompare(b.k));
  const n = meses.length >= 24 ? 12 : Math.floor(meses.length / 2);
  const ult = meses.slice(-n).reduce((s, d) => s + d.venta, 0), ant = meses.slice(-2 * n, -n).reduce((s, d) => s + d.venta, 0);
  const tr = ant ? (ult - ant) / ant : 0;
  // Resultado del caso (Acerca de): variación y su causa, sobre toda la base
  const txU = meses.slice(-n).reduce((s, d) => s + d.ntx, 0), txA = meses.slice(-2 * n, -n).reduce((s, d) => s + d.ntx, 0);
  if (ant && txA && txU) {
    const rTx = (txU - txA) / txA, rTk = (ult / txU - ant / txA) / (ant / txA), pc = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + ' %';
    $('abResultado').textContent = `Ventas de los últimos ${n} meses ${pc(tr)} frente a los ${n} anteriores, explicado sobre todo por ${Math.abs(rTx) >= Math.abs(rTk) ? 'el número de compras' : 'el gasto por compra'}: transacciones ${pc(rTx)} y ticket ${pc(rTk)}. El dashboard lo detecta y la IA propone acciones.`;
  }
  S.home = [
    ['Ventas totales', K.venta, fmt$, ''],
    ['Margen bruto', K.margen, fmtP, ''],
    [`Tendencia (últ. ${n} meses)`, tr, v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%', tr >= 0 ? 'up' : 'down'],
    ['Transacciones', K.ntx, fmtN, '']];
  $('heroStats').innerHTML = S.home.map(([t, , , c], i) => `<div class="hstat" style="--d:${300 + i * 120}ms"><div class="n ${c}">—</div><div class="t">${t}</div></div>`).join('');
  const cnt = k => new Set(all.map(r => r[k])).size, cats = [...new Set(all.map(r => r.cat))];
  $('heroBiz').innerHTML = [`🍕 Cadena regional de pizzerías · EE. UU.`, `📍 ${cnt('ciudad')} ciudades`, `🏬 ${cnt('suc')} sucursales`,
    `🧾 ${S.productos.size} productos: ${esc(cats.slice(0, 5).join(', '))}`, `🛵 ${esc([...new Set(all.map(r => r.canal))].join(' · '))}`].map(t => `<span>${t}</span>`).join('');
  $('heroPeriod').textContent = `Periodo analizado: ${S.fMin} a ${S.fMax} · ${fmtN(all.length)} registros de ventas · ${S.clientes.size} clientes · ${S.productos.size} productos`;
  // Curva de ventas mensuales como fondo animado
  const v = meses.map(m => m.venta), mx = Math.max(...v), mn = Math.min(...v) * .85, rg = mx - mn || 1;
  const pts = v.map((y, i) => `${(i / Math.max(1, v.length - 1)) * 1000},${(290 - ((y - mn) / rg) * 250).toFixed(1)}`);
  $('heroLine').setAttribute('d', 'M' + pts.join(' L'));
  $('heroArea').setAttribute('d', 'M0,300 L' + pts.join(' L') + ' L1000,300 Z');
  animHome();
}
function animHome() {
  if (!S.home || !$('v-home').classList.contains('on')) return;
  const els = $('heroStats').querySelectorAll('.n');
  S.home.forEach(([, val, fmt], i) => { els[i]._tok = 0; animateNum(els[i], 0, val, fmt); });
  const line = $('heroLine'); line.style.animation = 'none'; void line.getBBox(); line.style.animation = ''; // reinicia el trazo
}

/* ---------- Acerca de: glosario con buscador y categorías, navegación interna ---------- */
const GLOSARIO = [
  ['KPI', 'Ventas totales', 'Suma de la venta neta (después de descuentos) del periodo y filtros seleccionados.'],
  ['KPI', 'Utilidad bruta', 'Ventas totales − costo total de los productos vendidos.'],
  ['KPI', 'Margen bruto', 'Utilidad bruta ÷ ventas totales. Indica cuántos centavos de cada dólar vendido quedan tras el costo del producto.'],
  ['KPI', 'Ticket promedio', 'Ventas totales ÷ número de transacciones: gasto medio por compra.'],
  ['KPI', 'N.º clientes', 'Clientes distintos que compraron al menos una vez en el periodo.'],
  ['KPI', 'N.º transacciones', 'Ventas distintas (VentaID) registradas.'],
  ['KPI', 'Unidades vendidas', 'Suma de las cantidades vendidas.'],
  ['KPI', 'Descuentos otorgados', 'Monto cedido en descuentos: precio de lista − venta neta, con el % de ventas que tuvo descuento. Que suba es negativo para el margen (se muestra en rojo).'],
  ['KPI', 'Transacciones vs ticket', 'Ventas = transacciones × ticket promedio. Indica si las ventas cambian por el número de compras o por el gasto en cada compra.'],
  ['KPI', 'Entrega media (delivery)', 'Tiempo promedio de entrega de los pedidos a domicilio, en minutos.'],
  ['KPI', `Pedidos de más de ${UMBRAL_ENTREGA} min`, `% de pedidos a domicilio que superan ${UMBRAL_ENTREGA} minutos. Umbral de referencia definido por el equipo; el caso no fija un objetivo de entrega.`],
  ['KPI', 'Variación ▲▼', 'Cambio frente al periodo anterior de igual duración (o 2.ª mitad vs 1.ª mitad si no hay datos previos). Verde = mejora, rojo = empeora.'],
  ['KPI', 'pp (puntos porcentuales)', 'Diferencia absoluta entre dos porcentajes: un margen que pasa de 60 % a 59 % baja 1 pp.'],
  ['KPI', 'Tendencia de ventas', 'Ventas de los últimos 12 meses frente a los 12 meses anteriores.'],
  ['Negocio', 'Sucursal', 'Restaurante físico de la cadena; cada ciudad puede tener varias.'],
  ['Negocio', 'Segmento de cliente', 'Grupo de clientes con características similares (p. ej. Estudiante, Profesional, Familia, Corporativo).'],
  ['Negocio', 'Canal', 'Forma en que se realizó la venta: Restaurante, Pickup (recoger) o Delivery (a domicilio).'],
  ['Negocio', 'Cliente activo', 'Cliente marcado como activo en la base de clientes (sigue comprando).'],
  ['Negocio', 'Motivo de pérdida', 'Razón registrada por la que un cliente dejó de comprar (precio, tiempo de espera, mudanza…).'],
  ['Negocio', 'NPS', 'Net Promoter Score: probabilidad declarada de recomendar la marca (escala 0–10).'],
  ['Negocio', 'Tx/cliente', 'Transacciones por cliente: frecuencia de compra en el periodo.'],
  ['App', 'Comparativo anual', 'Indicadores del último año con datos frente al anterior, con los filtros activos salvo las fechas.'],
  ['App', 'Hallazgos clave', 'Mejor y peor sucursal, producto y segmento calculados automáticamente con los filtros activos.'],
  ['App', 'Filtro cruzado', 'Al hacer clic en una barra o sector, todo el dashboard se filtra por ese valor.'],
  ['App', 'Matriz de rentabilidad', 'Gráfico de burbujas de productos: volumen (eje X), margen % (eje Y) y utilidad (tamaño).'],
  ['App', 'Mini gráfica (sparkline)', 'Línea pequeña bajo cada KPI con su evolución mensual.'],
  ['App', 'Integridad referencial', '% de ventas cuyo cliente y producto existen en sus bases maestras.'],
  ['App', 'IA generativa (LLM)', 'Modelo de lenguaje que redacta recomendaciones a partir del resumen del dashboard; deben validarse críticamente.']
];
let glCat = 'Todos';
function renderGlosario() {
  const q = norm($('glQ').value);
  const items = GLOSARIO.filter(([c, t, d]) => (glCat === 'Todos' || c === glCat) && (!q || norm(t + ' ' + d).includes(q)));
  $('glList').innerHTML = items.map(([c, t, d], i) => `<details${q && i < 3 ? ' open' : ''}><summary>${esc(t)}<span class="cat c-${c}">${c}</span></summary><p>${esc(d)}</p></details>`).join('')
    || '<p class="status">No hay términos que coincidan con la búsqueda.</p>';
  $('glCount').textContent = `${items.length} de ${GLOSARIO.length} términos · clic en un término para ver su definición`;
}
function initAcercaDe() {
  $('glCats').innerHTML = ['Todos', 'KPI', 'Negocio', 'App'].map(c => `<button type="button" data-c="${c}" class="${c === glCat ? 'on' : ''}">${c}</button>`).join('');
  $('glCats').querySelectorAll('button').forEach(b => b.onclick = () => { glCat = b.dataset.c; $('glCats').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderGlosario(); });
  $('glQ').addEventListener('input', renderGlosario);
  document.querySelectorAll('.ab-nav a').forEach(a => a.onclick = e => {
    e.preventDefault(); document.querySelectorAll('.ab-nav a').forEach(x => x.classList.toggle('on', x === a));
    $(a.dataset.ab).scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  });
  renderGlosario();
  // Panel lateral: botón de la barra, tarjeta de Acerca de, Esc y clic fuera
  $('btnGl').onclick = () => openGlossary();
  document.querySelectorAll('[data-gl]').forEach(b => b.onclick = () => openGlossary());
  $('glClose').onclick = closeGlossary; $('glBack').onclick = closeGlossary;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('glPanel').hidden) closeGlossary(); });
}
let glFocus = null;
function openGlossary(term) {
  glFocus = document.activeElement;
  if (term) { glCat = 'Todos'; $('glCats').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.c === 'Todos')); }
  $('glQ').value = term || ''; renderGlosario();
  if (term) {
    const all = [...$('glList').querySelectorAll('details')];
    const d = all.find(x => norm(x.querySelector('summary').firstChild.textContent) === norm(term)) || all[0];
    if (d) { d.open = true; all.filter(x => x !== d).forEach(x => x.open = false); d.parentNode.prepend(d); }
  }
  $('glBack').hidden = false; $('glPanel').hidden = false;
  setTimeout(() => (term ? $('glClose') : $('glQ')).focus(), 50);
}
function closeGlossary() { $('glPanel').hidden = true; $('glBack').hidden = true; if (glFocus && glFocus.focus) glFocus.focus(); }

/* ---------- Animación de aparición al hacer scroll ---------- */
const IO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); IO.unobserve(e.target); }
}), { threshold: .08 }) : null;
function observeReveal(root) {
  [...root.children].forEach((el, i) => {
    if (el.classList.contains('in')) return;
    el.classList.add('reveal'); el.style.setProperty('--d', `${Math.min(i, 8) * 70}ms`);
    if (IO && !REDUCED) IO.observe(el); else el.classList.add('in');
  });
}
const moneyAxis = { ticks: { callback: v => '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } };
function barH(id, data, label, valFn = d => d.venta, color = PAL[0]) {
  chart(id, { type: 'bar', data: { labels: data.map(d => d.k), datasets: [{ label, data: data.map(valFn), backgroundColor: color, fmt: label === 'Unidades' ? 'n' : '$' }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } } });
}
function table(el, cols, data) {
  let sortK = null, asc = false;
  const draw = () => {
    const d = sortK == null ? data : [...data].sort((a, b) => { const x = cols[sortK].v(a), y = cols[sortK].v(b); return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
    $(el).innerHTML = `<table><thead><tr>${cols.map((c, i) => `<th data-i="${i}">${c.h}</th>`).join('')}</tr></thead><tbody>${d.map(r => `<tr>${cols.map(c => `<td>${c.f ? c.f(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $(el).querySelectorAll('th').forEach(th => th.onclick = () => { const i = +th.dataset.i; asc = sortK === i ? !asc : false; sortK = i; draw(); });
  };
  draw();
}
const mTag = m => `<span class="tag ${m >= .6 ? 'g' : m >= .5 ? 'y' : 'r'}">${fmtP(m)}</span>`;

function refresh() {
  applyFilters(); S.ver = (S.ver || 0) + 1;
  const aviso = '<p class="status">Los filtros o los datos cambiaron. Vuelva a generar las recomendaciones para el nuevo contexto.</p>';
  if ($('recoLocal').innerHTML) $('recoLocal').innerHTML = aviso;
  if ($('recoLLM').innerHTML) $('recoLLM').innerHTML = aviso;
  const R = S.rows, K = kpis(R);
  const byMes = group(R, 'mes').sort((a, b) => a.k.localeCompare(b.k));
  renderChips(); renderKPIs(K, byMes);
  chart('cTrend', { type: 'line', data: { labels: byMes.map(d => d.k), datasets: [
    { label: 'Ventas', data: byMes.map(d => d.venta), borderColor: PAL[0], backgroundColor: PAL[0] + '22', fill: true, tension: .25 },
    { label: 'Utilidad bruta', data: byMes.map(d => d.util), borderColor: PAL[1], tension: .25 }] }, options: { scales: { y: moneyAxis } } });

  const byProd = group(R, 'prod');
  barH('cTopProd', [...byProd].sort((a, b) => b.cant - a.cant).slice(0, 10), 'Unidades', d => d.cant, PAL[3]);
  const byCiudad = group(R, 'ciudad').sort((a, b) => b.venta - a.venta);
  chart('cCiudad', { type: 'bar', data: { labels: byCiudad.map(d => d.k), datasets: [{ label: 'Ventas', data: byCiudad.map(d => d.venta), backgroundColor: PAL[1] }] }, options: { plugins: { legend: { display: false } }, scales: { y: moneyAxis } } });
  const bySuc = group(R, 'suc').sort((a, b) => b.venta - a.venta);
  barH('cSucursal', bySuc, 'Ventas', d => d.venta, PAL[0]);
  const bySeg = group(R, 'seg').sort((a, b) => b.venta - a.venta);
  chart('cSegmento', { type: 'doughnut', data: { labels: bySeg.map(d => d.k), datasets: [{ data: bySeg.map(d => d.venta), backgroundColor: PAL }] } });
  const byCat = group(R, 'cat').sort((a, b) => b.venta - a.venta);
  chart('cCategoria', { type: 'bar', data: { labels: byCat.map(d => d.k), datasets: [{ label: 'Ventas', data: byCat.map(d => d.venta), backgroundColor: PAL[2] }, { label: 'Utilidad', data: byCat.map(d => d.util), backgroundColor: PAL[1] }] }, options: { scales: { y: moneyAxis } } });
  const byCanal = group(R, 'canal').sort((a, b) => b.venta - a.venta);
  chart('cCanal', { type: 'pie', data: { labels: byCanal.map(d => d.k), datasets: [{ data: byCanal.map(d => d.venta), backgroundColor: PAL.slice(3) }] } });

  // Productos
  chart('cMatriz', { type: 'bubble', data: { datasets: byProd.map((d, i) => ({ label: d.k, data: [{ x: d.cant, y: d.margen * 100, r: Math.max(3, Math.sqrt(d.util) / 12) }], backgroundColor: PAL[i % PAL.length] + 'aa' })) },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtN(c.raw.x)} u · ${c.raw.y.toFixed(1)}%` } } },
      scales: { x: { title: { display: true, text: 'Unidades vendidas' } }, y: { title: { display: true, text: 'Margen bruto %' } } } } });
  barH('cProdUtil', [...byProd].sort((a, b) => b.util - a.util).slice(0, 10), 'Utilidad', d => d.util, PAL[2]);
  const totV = K.venta || 1;
  table('tProd', [
    { h: 'Producto', v: d => d.k }, { h: 'Categoría', v: d => (R.find(r => r.prod === d.k) || {}).cat },
    { h: 'Unidades', v: d => d.cant, f: d => fmtN(d.cant) }, { h: 'Ventas', v: d => d.venta, f: d => fmt$(d.venta) },
    { h: '% ventas', v: d => d.venta / totV, f: d => fmtP(d.venta / totV) }, { h: 'Utilidad', v: d => d.util, f: d => fmt$(d.util) },
    { h: 'Margen', v: d => d.margen, f: d => mTag(d.margen) }], [...byProd].sort((a, b) => b.util - a.util));

  // Sucursales
  chart('cSucMargen', { type: 'bar', data: { labels: bySuc.map(d => d.k), datasets: [
    { label: 'Ventas', data: bySuc.map(d => d.venta), backgroundColor: PAL[1], yAxisID: 'y' },
    { label: 'Margen %', fmt: '%', data: bySuc.map(d => d.margen * 100), type: 'line', borderColor: PAL[0], yAxisID: 'y1' }] },
    options: { scales: { y: moneyAxis, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } } } } });
  chart('cSucTiempo', { type: 'bar', data: { labels: bySuc.map(d => d.k), datasets: [
    { label: 'Entrega (delivery)', fmt: 'min', data: bySuc.map(d => d.entrega), backgroundColor: PAL[3] }, { label: 'Preparación', fmt: 'min', data: bySuc.map(d => d.prep), backgroundColor: PAL[5] }] } });
  table('tSuc', [
    { h: 'Sucursal', v: d => d.k }, { h: 'Ventas', v: d => d.venta, f: d => fmt$(d.venta) }, { h: 'Utilidad', v: d => d.util, f: d => fmt$(d.util) },
    { h: 'Margen', v: d => d.margen, f: d => mTag(d.margen) }, { h: 'Transacciones', v: d => d.ntx, f: d => fmtN(d.ntx) },
    { h: 'Ticket', v: d => d.ticket, f: d => fmt$2(d.ticket) }, { h: 'Clientes', v: d => d.ncli, f: d => fmtN(d.ncli) },
    { h: 'Entrega min', v: d => d.entrega, f: d => d.entrega.toFixed(1) },
    { h: `% > ${UMBRAL_ENTREGA} min`, v: d => d.pctTarde, f: d => `<span class="tag ${d.pctTarde <= .25 ? 'g' : d.pctTarde <= .4 ? 'y' : 'r'}">${fmtP(d.pctTarde)}</span>` },
    { h: 'Prep. min', v: d => d.prep, f: d => d.prep.toFixed(1) }], bySuc);
  // Servicio de delivery (solo pedidos con tiempo de entrega)
  const peor = [...bySuc].filter(d => d.nEnt).sort((a, b) => b.pctTarde - a.pctTarde)[0];
  $('sucKpis').innerHTML = [
    ['Entrega media (delivery)', K.nEnt ? K.entrega.toFixed(1) + ' min' : '—', `${fmtN(K.nEnt || 0)} pedidos a domicilio en el periodo`, 'Promedio de TiempoEntregaMin de los pedidos Delivery'],
    [`Pedidos de más de ${UMBRAL_ENTREGA} min`, K.nEnt ? fmtP(K.pctTarde) : '—', peor ? `Mayor proporción: ${esc(peor.k)} (${fmtP(peor.pctTarde)})` : '', `Umbral de referencia de ${UMBRAL_ENTREGA} min definido por el equipo; el caso no fija un objetivo de entrega`]
  ].map(([l, v, s, tip]) => `<div class="kpi" title="${tip}"><div class="l">${l}<span class="i">ⓘ</span></div><div class="v">${v}</div><div class="d">${s}</div></div>`).join('') +
    `<p class="status" style="grid-column:1/-1;margin:0">Umbral de ${UMBRAL_ENTREGA} min: referencia definida por el equipo para medir el nivel de servicio (el caso no fija un objetivo).</p>`;

  // Clientes
  chart('cSegTicket', { type: 'bar', data: { labels: bySeg.map(d => d.k), datasets: [
    { label: 'Ticket promedio', fmt: '$2', data: bySeg.map(d => d.ticket), backgroundColor: PAL[1], yAxisID: 'y' },
    { label: 'Transacciones por cliente', fmt: 'x', data: bySeg.map(d => d.ncli ? d.ntx / d.ncli : 0), backgroundColor: PAL[3], yAxisID: 'y1' }] },
    options: { scales: { y: { ticks: { callback: v => '$' + v } }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
  const byPago = group(R, 'pago').sort((a, b) => b.venta - a.venta);
  chart('cPago', { type: 'doughnut', data: { labels: byPago.map(d => d.k), datasets: [{ data: byPago.map(d => d.venta), backgroundColor: PAL }] } });
  const segCli = segInfo();
  table('tSeg', [
    { h: 'Segmento', v: d => d.k }, { h: 'Ventas', v: d => d.venta, f: d => fmt$(d.venta) }, { h: '% ventas', v: d => d.venta / totV, f: d => fmtP(d.venta / totV) },
    { h: 'Margen', v: d => d.margen, f: d => mTag(d.margen) }, { h: 'Clientes', v: d => d.ncli, f: d => fmtN(d.ncli) },
    { h: 'Ventas/cliente', v: d => d.venta / (d.ncli || 1), f: d => fmt$(d.venta / (d.ncli || 1)) }, { h: 'Ticket', v: d => d.ticket, f: d => fmt$2(d.ticket) },
    { h: 'Tx/cliente', v: d => d.ntx / (d.ncli || 1), f: d => (d.ntx / (d.ncli || 1)).toFixed(1) },
    { h: '% activos', v: d => (segCli[d.k] || {}).act || 0, f: d => fmtP((segCli[d.k] || {}).act || 0) },
    { h: 'NPS medio', v: d => (segCli[d.k] || {}).nps || 0, f: d => ((segCli[d.k] || {}).nps || 0).toFixed(1) }], bySeg);

  renderInsights(R, byMes, bySuc, byProd, bySeg, K);
  renderYoY();
  S.summary = { K, byMes, byProd, byCiudad, bySuc, bySeg, byCat, byCanal, segCli };
}
function segInfo() {
  const o = {};
  for (const c of S.clientes.values()) {
    const s = o[c.seg] || (o[c.seg] = { n: 0, a: 0, nps: 0, mot: {} });
    s.n++; if (/^s/i.test(String(c.activo))) s.a++; s.nps += c.nps; if (c.motivo) s.mot[c.motivo] = (s.mot[c.motivo] || 0) + 1;
  }
  for (const k in o) { o[k].act = o[k].a / o[k].n; o[k].nps = o[k].nps / o[k].n; o[k].motivo = Object.entries(o[k].mot).sort((a, b) => b[1] - a[1])[0]?.[0]; }
  return o;
}

/* ---------- Asistente IA ---------- */
function contextoIA() {
  const s = S.summary, top = (a, n, f) => [...a].sort(f).slice(0, n);
  const pick = d => ({ nombre: d.k, ventas: Math.round(d.venta), utilidad: Math.round(d.util), margen_pct: +(d.margen * 100).toFixed(1), transacciones: d.ntx, ticket: +d.ticket.toFixed(2), unidades: d.cant, clientes: d.ncli });
  const filtros = Object.fromEntries([['desde', $('fDesde').value], ['hasta', $('fHasta').value], ...Object.entries(FSEL).map(([id, k]) => [k, $(id).value || 'Todos'])]);
  return {
    empresa: 'San Francisco Crust Pizza', filtros,
    kpis: { ventas: Math.round(s.K.venta), utilidad: Math.round(s.K.util), margen_pct: +(s.K.margen * 100).toFixed(1), ticket: +s.K.ticket.toFixed(2), clientes: s.K.ncli, transacciones: s.K.ntx,
      descuentos_otorgados: Math.round(s.K.descM || 0), pct_ventas_con_descuento: +((s.K.pctDesc || 0) * 100).toFixed(1),
      entrega_media_min: +(s.K.entrega || 0).toFixed(1), [`pct_pedidos_mas_${UMBRAL_ENTREGA}_min`]: +((s.K.pctTarde || 0) * 100).toFixed(1) },
    tendencia_mensual: s.byMes.map(d => ({ mes: d.k, ventas: Math.round(d.venta), margen_pct: +(d.margen * 100).toFixed(1) })),
    ciudades: s.byCiudad.map(pick), sucursales: s.bySuc.map(d => ({ ...pick(d), entrega_min: +d.entrega.toFixed(1), pct_entregas_tardias: +(d.pctTarde * 100).toFixed(1), prep_min: +d.prep.toFixed(1) })),
    segmentos: s.bySeg.map(d => ({ ...pick(d), pct_activos: +((s.segCli[d.k]?.act || 0) * 100).toFixed(1), nps: +(s.segCli[d.k]?.nps || 0).toFixed(1), motivo_perdida_principal: s.segCli[d.k]?.motivo })),
    categorias: s.byCat.map(pick), canales: s.byCanal.map(pick),
    top_productos_utilidad: top(s.byProd, 8, (a, b) => b.util - a.util).map(pick),
    productos_menor_utilidad: top(s.byProd, 8, (a, b) => a.util - b.util).map(pick),
    productos_menor_margen: top(s.byProd, 5, (a, b) => a.margen - b.margen).map(pick)
  };
}
function motorLocal() {
  const s = S.summary; if (!s || !S.rows.length) { $('recoLocal').innerHTML = '<p>Sin datos con los filtros actuales.</p>'; return; }
  const R = [], K = s.K, sucS = [...s.bySuc].sort((a, b) => b.util - a.util);
  const best = sucS[0], worst = sucS[sucS.length - 1];
  R.push(['Sucursales: replicar mejores prácticas', `${esc(best.k)} lidera con ${fmt$(best.util)} de utilidad (margen ${fmtP(best.margen)}, ticket ${fmt$2(best.ticket)}), mientras ${esc(worst.k)} genera ${fmt$(worst.util)} (margen ${fmtP(worst.margen)}). Brecha: ${fmt$(best.util - worst.util)}. Recomendación: auditar operación, surtido y promociones de ${esc(worst.k)} y transferir prácticas de ${esc(best.k)}.`]);
  const prodU = [...s.byProd].sort((a, b) => b.util - a.util), pTop = prodU.slice(0, 3), pLow = prodU.slice(-3);
  R.push(['Productos estrella', `${pTop.map(p => `${esc(p.k)} (${fmt$(p.util)}, ${fmtP(p.margen)})`).join('; ')} concentran la mayor utilidad. Priorizarlos en menú, combos y publicidad digital.`]);
  const lowM = [...s.byProd].sort((a, b) => a.margen - b.margen).slice(0, 3);
  R.push(['Productos a revisar', `Menor utilidad: ${pLow.map(p => `${esc(p.k)} (${fmt$(p.util)})`).join('; ')}. Menor margen: ${lowM.map(p => `${esc(p.k)} (${fmtP(p.margen)})`).join('; ')}. Evaluar ajuste de precio, renegociar costos o retirar del menú.`]);
  const seg = s.bySeg.map(d => ({ ...d, vpc: d.venta / (d.ncli || 1), info: s.segCli[d.k] || {} }));
  const sOpp = [...seg].sort((a, b) => b.ticket - a.ticket)[0], sBig = [...seg].sort((a, b) => b.venta - a.venta)[0];
  R.push(['Segmento con mayor oportunidad', `${esc(sBig.k)} es el segmento de mayor venta (${fmtP(sBig.venta / K.venta)} del total). ${esc(sOpp.k)} tiene el ticket más alto (${fmt$2(sOpp.ticket)}) con ${fmtP(sOpp.info.act || 0)} de clientes activos${sOpp.info.motivo ? '; su principal motivo de pérdida es “' + esc(sOpp.info.motivo) + '”' : ''}. Lanzar programa de fidelización y reactivación dirigido.`]);
  const canal = [...s.byCanal].sort((a, b) => b.margen - a.margen);
  R.push(['Canales de venta', canal.map(c => `${esc(c.k)}: ${fmt$(c.venta)} (margen ${fmtP(c.margen)}, ticket ${fmt$2(c.ticket)})`).join('; ') + `. Incentivar ${esc(canal[0].k)} por su mayor margen.`]);
  if (s.byMes.length >= 6) {
    const h = Math.floor(s.byMes.length / 2), a = s.byMes.slice(0, h).reduce((x, d) => x + d.venta, 0), b = s.byMes.slice(-h).reduce((x, d) => x + d.venta, 0);
    const mx = [...s.byMes].sort((x, y) => y.venta - x.venta)[0], mn = [...s.byMes].sort((x, y) => x.venta - y.venta)[0];
    R.push(['Tendencia', `Ventas del último periodo vs. primero: ${b >= a ? '+' : ''}${fmtP((b - a) / a)}. Mejor mes ${esc(mx.k)} (${fmt$(mx.venta)}), más bajo ${esc(mn.k)} (${fmt$(mn.venta)}). Planificar campañas en meses valle e inventario/personal en picos.`]);
  }
  const ciu = s.byCiudad; R.push(['Ciudades', `${esc(ciu[0].k)} aporta ${fmtP(ciu[0].venta / K.venta)} de las ventas; ${esc(ciu[ciu.length - 1].k)} solo ${fmtP(ciu[ciu.length - 1].venta / K.venta)}. Evaluar expansión en la plaza líder y plan de crecimiento local en la rezagada.`]);
  $('recoLocal').innerHTML = R.map(([t, d]) => `<div class="reco"><b>${t}</b>${d}</div>`).join('') + '<p class="status">Generado por reglas analíticas sobre los datos filtrados. Validar críticamente antes de usar.</p>';
}
// URL del Cloudflare Worker que ejecuta el modelo de IA (Workers AI, sin costo)
const PROXY_URL = 'https://sfcp-ia.dariojose-betan0901.workers.dev';
async function consultarLLM() {
  $('recoLLM').textContent = 'Consultando a la IA… (puede tardar 20-30 s)';
  const ver = S.ver;
  try {
    const r = await fetch(PROXY_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pregunta: $('q').value, contexto: contextoIA() }) });
    const j = await r.json();
    if (ver !== S.ver) return; // los filtros cambiaron mientras se esperaba la respuesta
    if (!r.ok) { $('recoLLM').textContent = 'Error: ' + (j.error?.message || r.status); return; }
    const txt = j.content.map(c => c.text || '').join('\n') + `\n\n— Modelo: ${j.modelo || 'IA'}`;
    $('recoLLM').innerHTML = txt.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#+\s*(.*)$/gm, '<b>$1</b>');
  } catch (e) { $('recoLLM').textContent = 'Error de conexión: ' + e.message; }
}

/* ---------- Eventos ---------- */
function show(v) { document.querySelectorAll('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-selected', b.dataset.v === v); }); document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  const datos = v === 'data' || v === 'about' || v === 'home';
  if (v === 'home') setTimeout(animHome, 0); $('filters').style.display = datos ? 'none' : ''; $('kpis').style.display = datos ? 'none' : ''; $('chips').style.display = datos ? 'none' : '';
  window.scrollTo(0, 0); }
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
['fDesde', 'fHasta', ...Object.keys(FSEL)].forEach(id => $(id).addEventListener('change', () => { if (id === 'fCiudad' || id === 'fCategoria') cascade(); refresh(); }));
$('fReset').onclick = () => { initFilters(); Object.keys(FSEL).forEach(id => $(id).value = ''); refresh(); };
$('upVentas').onchange = e => upload(e.target, 'v', 'Ventas');
$('upClientes').onchange = e => upload(e.target, 'c', 'Clientes');
$('upProductos').onchange = e => upload(e.target, 'p', 'Productos');
$('btnDefault').onclick = loadDefault;
$('btnLocal').onclick = motorLocal;
$('btnLLM').onclick = consultarLLM;
// PDF de una sola página continua, idéntico a la pantalla (sin cortes de paginado)
const loadScript = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
$('btnPrint').onclick = async () => {
  const b = $('btnPrint'), txt = b.textContent; b.disabled = true; b.textContent = '⏳ Generando…';
  try {
    if (!window.html2canvas) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); // mostrar todo lo que aún no apareció con el scroll
    Object.values(S.charts).forEach(c => { c.stop(); c.update('none'); c.render(); }); // gráficas terminadas, sin animación a medias
    await new Promise(r => setTimeout(r, 300));
    const de = document.documentElement, H = de.scrollHeight, W = de.clientWidth;
    const canvas = await html2canvas(document.body, {
      scale: 1.5, useCORS: true, backgroundColor: getComputedStyle(document.body).backgroundColor,
      width: W, height: H, windowWidth: W, windowHeight: H, x: 0, y: 0, scrollX: 0, scrollY: -window.scrollY,
      ignoreElements: el => el.id === 'loader' || el.classList?.contains('tools'),
      // En la copia: sin animaciones (si no, los elementos reaparecen con opacidad 0) y barra de filtros sin "sticky"
      onclone: d => { const s = d.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}.chips{position:static!important}.hero-bg .line{stroke-dashoffset:0!important}'; d.head.appendChild(s); }
    });
    const w = canvas.width / 1.5, h = canvas.height / 1.5;
    const pdf = new window.jspdf.jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'px', format: [w, h], hotfixes: ['px_scaling'], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, w, h);
    const vista = (document.querySelector('.tabs button.on')?.textContent || 'dashboard').trim().toLowerCase().replace(/\s+/g, '_');
    pdf.save(`SFCrustPizza_${vista}_${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) {
    window.print(); // respaldo si no se pudieron cargar las librerías
  } finally { b.disabled = false; b.textContent = txt; }
};
$('btnCSV').onclick = () => { // exporta las ventas con los filtros activos
  const cols = ['id', 'fecha', 'ciudad', 'suc', 'cli', 'seg', 'pid', 'prod', 'cat', 'canal', 'pago', 'cant', 'venta', 'costo', 'util'];
  const head = ['VentaID', 'Fecha', 'Ciudad', 'Sucursal', 'ClienteID', 'Segmento', 'ProductoID', 'Producto', 'Categoria', 'Canal', 'FormaPago', 'Cantidad', 'VentaNeta', 'CostoTotal', 'UtilidadBruta'];
  const q = v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = String.fromCharCode(0xFEFF) + [head.join(','), ...S.rows.map(r => cols.map(c => q(typeof r[c] === 'number' ? +r[c].toFixed(2) : r[c])).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `ventas_filtradas_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
document.querySelectorAll('.grid').forEach(observeReveal);
// Accesibilidad: descripción de cada gráfica para lectores de pantalla y pestañas con rol
document.querySelectorAll('.card').forEach(c => { const cv = c.querySelector('canvas'), h = c.querySelector('h3'); if (cv && h) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Gráfica: ' + h.textContent); } });
document.querySelector('.tabs').setAttribute('role', 'tablist');
document.querySelectorAll('.tabs button').forEach(b => { b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', b.classList.contains('on')); });
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
initAcercaDe();
// Primera visita: abre la portada; las siguientes, directo al Dashboard (preferencia guardada solo en este navegador)
let visto = false; try { visto = localStorage.getItem('sfcp_visto') === '1'; localStorage.setItem('sfcp_visto', '1'); } catch (e) { }
if (!visto) show('home');
loadDefault();
