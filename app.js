/* San Francisco Crust Pizza – Sistema Inteligente de Apoyo a la Toma de Decisiones */
const FILES = {
  ventas: 'data/San_Francisco_Crust_Pizza_Ventas.xlsx',
  clientes: 'data/San_Francisco_Crust_Pizza_Clientes.xlsx',
  productos: 'data/San_Francisco_Crust_Pizza_Productos.xlsx'
};
const S = { ventas: [], clientes: new Map(), productos: new Map(), rows: [], charts: {}, src: {}, raw: {} };
const $ = id => document.getElementById(id);
const fmt$ = v => '$' + Math.round(v).toLocaleString('en-US');
const fmt$2 = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = v => Math.round(v).toLocaleString('en-US');
const fmtP = v => (v * 100).toFixed(1) + '%';
const PAL = ['#c0392b', '#2c7be5', '#1a9e5c', '#d98a00', '#7b3fbf', '#00a3a3', '#e05297', '#5d6d7e', '#8e5b2d', '#3d9970'];

/* ---------- Lectura de archivos ---------- */
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
function readWB(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null }).map(r => {
    const o = {}; for (const k in r) o[norm(k)] = r[k]; return o;
  });
}
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(/[$,]/g, '')); return isNaN(n) ? 0 : n; };
function toISO(v) {
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function setProductos(rows) {
  S.productos = new Map(rows.filter(r => r.productoid).map(r => [String(r.productoid), {
    id: String(r.productoid), cat: r.categoria || 'Sin categoría', nombre: r.producto || r.productoid,
    tam: r.tamano || '', costo: num(r.costousd), precio: num(r.precioventausd), activo: r.activo
  }]));
}
function setClientes(rows) {
  S.clientes = new Map(rows.filter(r => r.clienteid).map(r => [String(r.clienteid), {
    id: String(r.clienteid), seg: r.segmento || 'Sin segmento', ciudad: r.ciudad, edad: num(r.edad),
    activo: r.clienteactivo, nps: num(r.nps), motivo: r.motivoperdida, canalFav: r.canalfavorito
  }]));
}
function setVentas(rows) {
  S.ventas = rows.filter(r => r.ventaid || r.fecha).map(r => {
    const p = S.productos.get(String(r.productoid)) || {};
    const c = S.clientes.get(String(r.clienteid)) || {};
    const cant = num(r.cantidad) || 1;
    const venta = r.ventaneta != null ? num(r.ventaneta) : num(r.preciounitario || p.precio) * cant * (1 - num(r.descuentopct) / 100);
    const costo = r.costototal != null ? num(r.costototal) : num(r.costounitario || p.costo) * cant;
    const util = r.utilidadbruta != null ? num(r.utilidadbruta) : venta - costo;
    const fecha = toISO(r.fecha);
    return {
      id: String(r.ventaid ?? ''), fecha, mes: fecha ? fecha.slice(0, 7) : 'NA', ciudad: r.ciudad || 'NA', suc: r.sucursal || 'NA',
      cli: String(r.clienteid ?? ''), seg: c.seg || 'Sin segmento', pid: String(r.productoid ?? ''),
      prod: p.nombre ? `${p.nombre}${p.tam ? ' (' + p.tam + ')' : ''}` : String(r.productoid), cat: p.cat || 'Sin categoría',
      cant, venta, costo, util, desc: num(r.descuentopct), canal: r.canal || 'NA', pago: r.formapago || 'NA',
      tEnt: num(r.tiempoentregamin), tPrep: num(r.tiempopreparacionmin)
    };
  }).filter(v => v.fecha);
}

async function fetchBuf(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(url); return r.arrayBuffer(); }
async function loadDefault() {
  $('loader').style.display = 'flex';
  try {
    const [p, c, v] = await Promise.all([FILES.productos, FILES.clientes, FILES.ventas].map(fetchBuf));
    S.raw = { p: readWB(p), c: readWB(c), v: readWB(v) };
    S.src = { p: 'Productos (original)', c: 'Clientes (original)', v: 'Ventas (original)' };
    rebuild();
  } catch (e) {
    $('loader').innerHTML = 'No se pudieron leer los archivos de <code>data/</code>. Abra la app desde un servidor web o cargue los archivos en “Cargar datos”.';
    setTimeout(() => $('loader').style.display = 'none', 3500); show('data');
  }
  $('loader').style.display = 'none';
}
function rebuild() {
  setProductos(S.raw.p || []); setClientes(S.raw.c || []); setVentas(S.raw.v || []);
  initFilters(); refresh();
  const f = S.ventas.map(v => v.fecha).sort();
  $('dsinfo').textContent = `${S.src.v} · ${fmtN(S.ventas.length)} registros · ${f[0] || ''} a ${f[f.length - 1] || ''} · ${S.clientes.size} clientes · ${S.productos.size} productos`;
}
async function upload(input, key, label) {
  const f = input.files[0]; if (!f) return;
  $('upStatus').textContent = 'Procesando ' + f.name + '…';
  try {
    const rows = readWB(await f.arrayBuffer());
    if (!rows.length) throw new Error('archivo vacío');
    S.raw[key] = rows; S.src[key] = `${label} (${f.name})`; rebuild();
    $('upStatus').textContent = `✔ ${f.name}: ${fmtN(rows.length)} filas cargadas. Indicadores actualizados.`;
  } catch (e) { $('upStatus').textContent = '✖ Error al leer ' + f.name + ': ' + e.message; }
  input.value = '';
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
  applyFilters();
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
async function consultarLLM() {
  const key = $('apiKey').value.trim(); if (!key) { $('recoLLM').textContent = 'Ingrese su API key de Anthropic.'; return; }
  try { localStorage.setItem('sfcp_key', key); } catch (e) { }
  $('recoLLM').textContent = 'Consultando a Claude…';
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
function show(v) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v)); }
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
