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
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');                              // 12,50
  else s = s.replace(/,/g, '');                                                           // 1,234.56
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
};
function toISO(v) {
  let d = null;
  if (v instanceof Date) d = new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 864e5));
  else {
    const s = String(v ?? '').trim(); if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) {
      let a = +m[1], b = +m[2]; const [mes, dia] = a > 12 ? [b, a] : [a, b]; // d/m/a si el primero > 12
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
async function fetchBuf(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(url.split('/').pop()); return r.arrayBuffer(); }
async function loadDefault() {
  $('loader').style.display = 'flex';
  try { const cfg = await fetch('data/config.json', { cache: 'no-store' }); if (cfg.ok) FILES = Object.assign(FILES, await cfg.json()); } catch (e) { }
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
  initFilters(); refresh(); renderQA();
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
    S.raw[t] = canon; S.src[t] = `${TIPOS[t]} (${f.name})`;
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
}


/* ---------- Filtros ---------- */
const FSEL = { fCiudad: 'ciudad', fSucursal: 'suc', fSegmento: 'seg', fCategoria: 'cat', fProducto: 'prod', fCanal: 'canal' };
function fillSelect(id, vals) {
  const cur = $(id).value;
  $(id).innerHTML = '<option value="">Todos</option>' + [...vals].sort().map(v => `<option>${v}</option>`).join('');
  if ([...vals].includes(cur)) $(id).value = cur;
}
function initFilters() {
  for (const [id, k] of Object.entries(FSEL)) fillSelect(id, new Set(S.ventas.map(v => v[k])));
  const f = S.ventas.map(v => v.fecha).sort();
  $('fDesde').value = f[0] || ''; $('fHasta').value = f[f.length - 1] || '';
}
function cascade() { // sucursal y producto dependientes
  const c = $('fCiudad').value, cat = $('fCategoria').value;
  fillSelect('fSucursal', new Set(S.ventas.filter(v => !c || v.ciudad === c).map(v => v.suc)));
  fillSelect('fProducto', new Set(S.ventas.filter(v => !cat || v.cat === cat).map(v => v.prod)));
}
function applyFilters() {
  const d1 = $('fDesde').value, d2 = $('fHasta').value;
  const sel = Object.entries(FSEL).map(([id, k]) => [k, $(id).value]).filter(x => x[1]);
  S.rows = S.ventas.filter(v => (!d1 || v.fecha >= d1) && (!d2 || v.fecha <= d2) && sel.every(([k, val]) => v[k] === val));
}

/* ---------- Agregaciones ---------- */
function group(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    let g = m.get(k); if (!g) m.set(k, g = { k, venta: 0, util: 0, costo: 0, cant: 0, tx: new Set(), cli: new Set(), tEnt: 0, nEnt: 0, tPrep: 0, desc: 0 });
    g.venta += r.venta; g.util += r.util; g.costo += r.costo; g.cant += r.cant; g.tx.add(r.id); g.cli.add(r.cli);
    if (r.tEnt > 0) { g.tEnt += r.tEnt; g.nEnt++; } g.tPrep += r.tPrep; g.desc += r.desc;
  }
  return [...m.values()].map(g => ({ ...g, ntx: g.tx.size, ncli: g.cli.size, margen: g.venta ? g.util / g.venta : 0, ticket: g.tx.size ? g.venta / g.tx.size : 0,
    entrega: g.nEnt ? g.tEnt / g.nEnt : 0, prep: g.ntx ? g.tPrep / g.ntx : 0 }));
}
function kpis(rows) {
  const g = group(rows, () => 'all')[0] || { venta: 0, util: 0, margen: 0, ticket: 0, ncli: 0, ntx: 0, cant: 0 };
  return g;
}

/* ---------- Render ---------- */
function chart(id, cfg) {
  if (S.charts[id]) S.charts[id].destroy();
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }, cfg.options || {});
  S.charts[id] = new Chart($(id), cfg);
}
const moneyAxis = { ticks: { callback: v => '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } };
function barH(id, data, label, valFn = d => d.venta, color = PAL[0]) {
  chart(id, { type: 'bar', data: { labels: data.map(d => d.k), datasets: [{ label, data: data.map(valFn), backgroundColor: color }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } } });
}
function table(el, cols, data) {
  let sortK = null, asc = false;
  const draw = () => {
    const d = sortK == null ? data : [...data].sort((a, b) => { const x = cols[sortK].v(a), y = cols[sortK].v(b); return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
    $(el).innerHTML = `<table><thead><tr>${cols.map((c, i) => `<th data-i="${i}">${c.h}</th>`).join('')}</tr></thead><tbody>${d.map(r => `<tr>${cols.map(c => `<td>${c.f ? c.f(r) : c.v(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
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
  const items = [['Ventas totales', fmt$(K.venta)], ['Utilidad bruta', fmt$(K.util)], ['Margen bruto', fmtP(K.margen)], ['Ticket promedio', fmt$2(K.ticket)],
    ['N.º clientes', fmtN(K.ncli)], ['N.º transacciones', fmtN(K.ntx)], ['Unidades vendidas', fmtN(K.cant)]];
  $('kpis').innerHTML = items.map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');

  const byMes = group(R, 'mes').sort((a, b) => a.k.localeCompare(b.k));
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
    { label: 'Margen %', data: bySuc.map(d => d.margen * 100), type: 'line', borderColor: PAL[0], yAxisID: 'y1' }] },
    options: { scales: { y: moneyAxis, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } } } } });
  chart('cSucTiempo', { type: 'bar', data: { labels: bySuc.map(d => d.k), datasets: [
    { label: 'Entrega (delivery)', data: bySuc.map(d => d.entrega), backgroundColor: PAL[3] }, { label: 'Preparación', data: bySuc.map(d => d.prep), backgroundColor: PAL[5] }] } });
  table('tSuc', [
    { h: 'Sucursal', v: d => d.k }, { h: 'Ventas', v: d => d.venta, f: d => fmt$(d.venta) }, { h: 'Utilidad', v: d => d.util, f: d => fmt$(d.util) },
    { h: 'Margen', v: d => d.margen, f: d => mTag(d.margen) }, { h: 'Transacciones', v: d => d.ntx, f: d => fmtN(d.ntx) },
    { h: 'Ticket', v: d => d.ticket, f: d => fmt$2(d.ticket) }, { h: 'Clientes', v: d => d.ncli, f: d => fmtN(d.ncli) },
    { h: 'Entrega min', v: d => d.entrega, f: d => d.entrega.toFixed(1) }, { h: 'Prep. min', v: d => d.prep, f: d => d.prep.toFixed(1) }], bySuc);

  // Clientes
  chart('cSegTicket', { type: 'bar', data: { labels: bySeg.map(d => d.k), datasets: [
    { label: 'Ticket promedio', data: bySeg.map(d => d.ticket), backgroundColor: PAL[1], yAxisID: 'y' },
    { label: 'Transacciones por cliente', data: bySeg.map(d => d.ncli ? d.ntx / d.ncli : 0), backgroundColor: PAL[3], yAxisID: 'y1' }] },
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
    kpis: { ventas: Math.round(s.K.venta), utilidad: Math.round(s.K.util), margen_pct: +(s.K.margen * 100).toFixed(1), ticket: +s.K.ticket.toFixed(2), clientes: s.K.ncli, transacciones: s.K.ntx },
    tendencia_mensual: s.byMes.map(d => ({ mes: d.k, ventas: Math.round(d.venta), margen_pct: +(d.margen * 100).toFixed(1) })),
    ciudades: s.byCiudad.map(pick), sucursales: s.bySuc.map(d => ({ ...pick(d), entrega_min: +d.entrega.toFixed(1), prep_min: +d.prep.toFixed(1) })),
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
  R.push(['Sucursales: replicar mejores prácticas', `${best.k} lidera con ${fmt$(best.util)} de utilidad (margen ${fmtP(best.margen)}, ticket ${fmt$2(best.ticket)}), mientras ${worst.k} genera ${fmt$(worst.util)} (margen ${fmtP(worst.margen)}). Brecha: ${fmt$(best.util - worst.util)}. Recomendación: auditar operación, surtido y promociones de ${worst.k} y transferir prácticas de ${best.k}.`]);
  const prodU = [...s.byProd].sort((a, b) => b.util - a.util), pTop = prodU.slice(0, 3), pLow = prodU.slice(-3);
  R.push(['Productos estrella', `${pTop.map(p => `${p.k} (${fmt$(p.util)}, ${fmtP(p.margen)})`).join('; ')} concentran la mayor utilidad. Priorizarlos en menú, combos y publicidad digital.`]);
  const lowM = [...s.byProd].sort((a, b) => a.margen - b.margen).slice(0, 3);
  R.push(['Productos a revisar', `Menor utilidad: ${pLow.map(p => `${p.k} (${fmt$(p.util)})`).join('; ')}. Menor margen: ${lowM.map(p => `${p.k} (${fmtP(p.margen)})`).join('; ')}. Evaluar ajuste de precio, renegociar costos o retirar del menú.`]);
  const seg = s.bySeg.map(d => ({ ...d, vpc: d.venta / (d.ncli || 1), info: s.segCli[d.k] || {} }));
  const sOpp = [...seg].sort((a, b) => b.ticket - a.ticket)[0], sBig = [...seg].sort((a, b) => b.venta - a.venta)[0];
  R.push(['Segmento con mayor oportunidad', `${sBig.k} es el segmento de mayor venta (${fmtP(sBig.venta / K.venta)} del total). ${sOpp.k} tiene el ticket más alto (${fmt$2(sOpp.ticket)}) con ${fmtP(sOpp.info.act || 0)} de clientes activos${sOpp.info.motivo ? '; su principal motivo de pérdida es “' + sOpp.info.motivo + '”' : ''}. Lanzar programa de fidelización y reactivación dirigido.`]);
  const canal = [...s.byCanal].sort((a, b) => b.margen - a.margen);
  R.push(['Canales de venta', canal.map(c => `${c.k}: ${fmt$(c.venta)} (margen ${fmtP(c.margen)}, ticket ${fmt$2(c.ticket)})`).join('; ') + `. Incentivar ${canal[0].k} por su mayor margen.`]);
  if (s.byMes.length >= 6) {
    const h = Math.floor(s.byMes.length / 2), a = s.byMes.slice(0, h).reduce((x, d) => x + d.venta, 0), b = s.byMes.slice(-h).reduce((x, d) => x + d.venta, 0);
    const mx = [...s.byMes].sort((x, y) => y.venta - x.venta)[0], mn = [...s.byMes].sort((x, y) => x.venta - y.venta)[0];
    R.push(['Tendencia', `Ventas del último periodo vs. primero: ${b >= a ? '+' : ''}${fmtP((b - a) / a)}. Mejor mes ${mx.k} (${fmt$(mx.venta)}), más bajo ${mn.k} (${fmt$(mn.venta)}). Planificar campañas en meses valle e inventario/personal en picos.`]);
  }
  const ciu = s.byCiudad; R.push(['Ciudades', `${ciu[0].k} aporta ${fmtP(ciu[0].venta / K.venta)} de las ventas; ${ciu[ciu.length - 1].k} solo ${fmtP(ciu[ciu.length - 1].venta / K.venta)}. Evaluar expansión en la plaza líder y plan de crecimiento local en la rezagada.`]);
  $('recoLocal').innerHTML = R.map(([t, d]) => `<div class="reco"><b>${t}</b>${d}</div>`).join('') + '<p class="status">Generado por reglas analíticas sobre los datos filtrados. Validar críticamente antes de usar.</p>';
}
// URL del Cloudflare Worker (proxy con la API key guardada en secreto). Vacío = solo modo con API key propia.
const PROXY_URL = 'https://sfcp-ia.dariojose-betan0901.workers.dev';
async function consultarLLM() {
  const key = $('apiKey').value.trim();
  if (!key && !PROXY_URL) { $('recoLLM').textContent = 'Ingrese su API key de Anthropic.'; return; }
  $('recoLLM').textContent = 'Consultando a la IA… (puede tardar 20-30 s)';
  const ver = S.ver;
  if (!key) {
    try {
      const r = await fetch(PROXY_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: $('model').value, pregunta: $('q').value, contexto: contextoIA() }) });
      const j = await r.json();
      if (ver !== S.ver) return; // los filtros cambiaron mientras se esperaba la respuesta
      if (!r.ok) { $('recoLLM').textContent = 'Error: ' + (j.error?.message || r.status); return; }
      const txt = j.content.map(c => c.text || '').join('\n') + `\n\n— Modelo: ${j.modelo || 'IA'}`;
      $('recoLLM').innerHTML = txt.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#+\s*(.*)$/gm, '<b>$1</b>');
    } catch (e) { $('recoLLM').textContent = 'Error de conexión: ' + e.message; }
    return;
  }
  try { localStorage.setItem('sfcp_key', key); } catch (e) { }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: $('model').value, max_tokens: 2000,
        system: 'Eres un consultor senior de Inteligencia de Negocios para una cadena de pizzerías. Responde en español, de forma estructurada, citando cifras exactas del contexto JSON. No inventes datos que no estén en el contexto.',
        messages: [{ role: 'user', content: `Datos del dashboard (con filtros aplicados):\n${JSON.stringify(contextoIA())}\n\nPregunta: ${$('q').value}` }] })
    });
    const j = await r.json();
    $('recoLLM').textContent = r.ok ? j.content.map(c => c.text || '').join('\n') : 'Error: ' + (j.error?.message || r.status);
  } catch (e) { $('recoLLM').textContent = 'Error de conexión: ' + e.message; }
}

/* ---------- Eventos ---------- */
function show(v) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  const datos = v === 'data' || v === 'about'; $('filters').style.display = datos ? 'none' : ''; $('kpis').style.display = datos ? 'none' : '';
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
try { $('apiKey').value = localStorage.getItem('sfcp_key') || ''; } catch (e) { }
loadDefault();
