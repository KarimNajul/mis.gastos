'use strict';

/* ================= Configuración ================= */

const CATEGORIAS = [
  { id: 'comida', nombre: 'Comida', color: '#f97316' },
  { id: 'super', nombre: 'Supermercado', color: '#22c55e' },
  { id: 'transporte', nombre: 'Transporte', color: '#3b82f6' },
  { id: 'servicios', nombre: 'Servicios', color: '#eab308' },
  { id: 'hogar', nombre: 'Hogar', color: '#a855f7' },
  { id: 'salud', nombre: 'Salud', color: '#ef4444' },
  { id: 'ocio', nombre: 'Ocio', color: '#ec4899' },
  { id: 'ropa', nombre: 'Ropa', color: '#14b8a6' },
  { id: 'educacion', nombre: 'Educación', color: '#6366f1' },
  { id: 'otros', nombre: 'Otros', color: '#94a3b8' },
];
const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));
const catDe = id => CAT[id] || CAT.otros;

// Paleta para el gráfico "por gasto" (agrupado por nombre).
const PALETA = ['#0f766e', '#3b82f6', '#f97316', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#ec4899', '#6366f1', '#14b8a6'];

const STORAGE_KEY = 'mis-gastos-v1';

// Capacitor = APK de Android; Electron = EXE de Windows. Si no, es la versión web.
const ES_ANDROID = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const ES_ESCRITORIO = navigator.userAgent.includes('Electron');
const ES_NATIVA = ES_ANDROID || ES_ESCRITORIO;

const dinero = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const fmtFecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtFechaHora = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fecha = iso => fmtFecha.format(new Date(iso));
const fechaHora = iso => fmtFechaHora.format(new Date(iso));

/* ================= Datos ================= */

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nuevoPeriodo = () => ({ id: nuevoId(), inicio: new Date().toISOString(), gastos: [] });

function esEstadoValido(d) {
  return d && typeof d === 'object' && d.activo && Array.isArray(d.activo.gastos) && Array.isArray(d.historial);
}

function cargar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (esEstadoValido(d)) return d;
    }
  } catch (e) {
    console.warn('No se pudieron leer los datos guardados', e);
  }
  return { activo: nuevoPeriodo(), historial: [] };
}

let estado = cargar();

function guardar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  } catch (e) {
    alert('No se pudieron guardar los datos: ' + e.message);
  }
}

const total = gastos => gastos.reduce((s, g) => s + g.costo, 0);

// Acepta "1500", "1500,50", "1.500,50", "1500.50" y "$ 1.500".
function parseMonto(txt) {
  let s = String(txt).trim().replace(/[\s$]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function agrupar(gastos, claveFn) {
  const mapa = new Map();
  for (const g of gastos) {
    const { clave, label, color } = claveFn(g);
    const item = mapa.get(clave) || { label, color, valor: 0, cantidad: 0 };
    item.valor += g.costo;
    item.cantidad++;
    mapa.set(clave, item);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/* ================= Utilidades de UI ================= */

const $app = document.getElementById('app');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

function itemGasto(g, borrable) {
  const c = catDe(g.categoria);
  return `
    <li>
      <span class="punto" style="background:${c.color}"></span>
      <div class="info">
        <div class="nombre">${esc(g.nombre)}</div>
        ${g.descripcion ? `<div class="detalle">${esc(g.descripcion)}</div>` : ''}
        <div class="detalle">${esc(c.nombre)} · ${fechaHora(g.fecha)}</div>
      </div>
      <span class="costo">${dinero.format(g.costo)}</span>
      ${borrable ? `<button class="btn-borrar" data-accion="borrar-gasto" data-id="${g.id}" aria-label="Borrar ${esc(g.nombre)}">×</button>` : ''}
    </li>`;
}

/* ================= Gráficos (SVG / HTML, sin librerías) ================= */

function graficoTorta(items) {
  const suma = items.reduce((s, i) => s + i.valor, 0);
  const r = 70;
  const C = 2 * Math.PI * r;
  let acumulado = 0;
  const segmentos = items.map(i => {
    const largo = (i.valor / suma) * C;
    const seg = `<circle r="${r}" cx="100" cy="100" fill="none" stroke="${i.color}" stroke-width="36"
      stroke-dasharray="${largo} ${C - largo}" stroke-dashoffset="${-acumulado}"><title>${esc(i.label)}: ${dinero.format(i.valor)}</title></circle>`;
    acumulado += largo;
    return seg;
  }).join('');

  const leyenda = items.map(i => `
    <li>
      <span class="punto" style="background:${i.color}"></span>
      <span class="nombre">${esc(i.label)}</span>
      <span class="pct">${Math.round((i.valor / suma) * 100)}%</span>
      <span class="val">${dinero.format(i.valor)}</span>
    </li>`).join('');

  return `
    <div class="torta-wrap">
      <svg class="torta" viewBox="0 0 200 200" role="img" aria-label="Gráfico de torta por categoría">
        <g transform="rotate(-90 100 100)">${segmentos}</g>
        <text x="100" y="94" text-anchor="middle" class="centro-label">Total</text>
        <text x="100" y="114" text-anchor="middle" class="centro-valor">${esc(dinero.format(suma))}</text>
      </svg>
      <ul class="leyenda">${leyenda}</ul>
    </div>`;
}

function graficoBarras(items) {
  const max = Math.max(...items.map(i => i.valor));
  return `<div class="barras">${items.map(i => `
    <div class="barra-fila">
      <div class="cabecera"><span>${esc(i.label)}${i.cantidad > 1 ? ` <span class="etiqueta">(${i.cantidad})</span>` : ''}</span><span>${dinero.format(i.valor)}</span></div>
      <div class="barra-fondo"><div class="barra" style="width:${Math.max(2, (i.valor / max) * 100)}%;background:${i.color}"></div></div>
    </div>`).join('')}</div>`;
}

/* ================= Vistas ================= */

function vistaInicio() {
  const p = estado.activo;
  const gastos = [...p.gastos].reverse();
  const opciones = CATEGORIAS.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  return `
    <section class="card destacado">
      <div class="etiqueta">Periodo actual · desde ${fecha(p.inicio)}</div>
      <div class="monto-grande">${dinero.format(total(p.gastos))}</div>
      <div class="etiqueta">${p.gastos.length} ${p.gastos.length === 1 ? 'gasto' : 'gastos'}</div>
    </section>

    <form class="card" id="form-gasto" autocomplete="off">
      <h2>Nuevo gasto</h2>
      <label>Nombre del gasto
        <input name="nombre" required maxlength="60" placeholder="Ej: Almuerzo">
      </label>
      <label>Descripción
        <input name="descripcion" maxlength="200" placeholder="Opcional">
      </label>
      <div class="fila">
        <label>Costo ($)
          <input name="costo" required inputmode="decimal" placeholder="0,00">
        </label>
        <label>Categoría
          <select name="categoria">${opciones}</select>
        </label>
      </div>
      <button class="btn primario" type="submit">Agregar gasto</button>
    </form>

    <section class="card">
      <h2>Gastos del periodo</h2>
      ${gastos.length
        ? `<ul class="lista">${gastos.map(g => itemGasto(g, true)).join('')}</ul>`
        : '<p class="vacio">Todavía no cargaste gastos en este periodo.</p>'}
    </section>

    <div class="acciones">
      <a class="btn borde" href="#/periodo/actual">Ver resumen parcial</a>
      <button class="btn peligro" data-accion="finalizar" ${p.gastos.length ? '' : 'disabled'}>Finalizar periodo</button>
    </div>`;
}

function vistaResumen(id) {
  const esActual = id === 'actual';
  const p = esActual ? estado.activo : estado.historial.find(h => h.id === id);
  if (!p) return `<p class="vacio">Ese periodo no existe.</p><a class="btn" href="#/historial">Ir al historial</a>`;

  const gastos = p.gastos;
  const t = total(gastos);
  const titulo = esActual
    ? `Periodo actual (desde ${fecha(p.inicio)})`
    : `${fecha(p.inicio)} — ${fecha(p.fin)}`;

  let contenido;
  if (!gastos.length) {
    contenido = '<p class="card vacio">No hay gastos en este periodo.</p>';
  } else {
    const mayor = gastos.reduce((a, b) => (b.costo > a.costo ? b : a));
    const porCategoria = agrupar(gastos, g => {
      const c = catDe(g.categoria);
      return { clave: c.id, label: c.nombre, color: c.color };
    });
    const porNombre = agrupar(gastos, g => ({ clave: g.nombre.trim().toLowerCase(), label: g.nombre.trim(), color: '' }))
      .slice(0, 10)
      .map((i, n) => ({ ...i, color: PALETA[n % PALETA.length] }));
    const ordenados = [...gastos].sort((a, b) => b.costo - a.costo);

    contenido = `
      <div class="stats">
        <div class="stat total"><div class="etiqueta">Total gastado</div><div class="valor">${dinero.format(t)}</div></div>
        <div class="stat"><div class="etiqueta">Cantidad de gastos</div><div class="valor">${gastos.length}</div></div>
        <div class="stat"><div class="etiqueta">Promedio por gasto</div><div class="valor">${dinero.format(t / gastos.length)}</div></div>
        <div class="stat"><div class="etiqueta">Gasto más grande</div><div class="valor">${dinero.format(mayor.costo)}</div><div class="etiqueta">${esc(mayor.nombre)}</div></div>
      </div>

      <section class="card">
        <h2>Por categoría</h2>
        ${graficoTorta(porCategoria)}
      </section>

      <section class="card">
        <h2>¿En qué gastaste?</h2>
        ${graficoBarras(porNombre)}
      </section>

      <section class="card">
        <h2>Detalle (de mayor a menor)</h2>
        <ul class="lista">${ordenados.map(g => itemGasto(g, false)).join('')}</ul>
      </section>`;
  }

  return `
    <a class="volver" href="${esActual ? '#/' : '#/historial'}">‹ Volver</a>
    <section class="card destacado">
      <div class="etiqueta">${esActual ? 'Resumen parcial' : 'Resumen del periodo'}</div>
      <h2 style="margin:4px 0 0">${titulo}</h2>
    </section>
    ${contenido}
    ${esActual ? '' : `<button class="btn borde" data-accion="borrar-periodo" data-id="${p.id}">Eliminar este periodo</button>`}`;
}

function vistaHistorial() {
  if (!estado.historial.length) {
    return `<section class="card"><h2>Historial</h2><p class="vacio">Todavía no finalizaste ningún periodo.</p></section>`;
  }
  const totalGeneral = estado.historial.reduce((s, p) => s + total(p.gastos), 0);
  return `
    <section class="card destacado">
      <div class="etiqueta">${estado.historial.length} ${estado.historial.length === 1 ? 'periodo finalizado' : 'periodos finalizados'}</div>
      <div class="monto-grande">${dinero.format(totalGeneral)}</div>
      <div class="etiqueta">gastado en total</div>
    </section>
    <section class="card">
      <h2>Periodos</h2>
      <ul class="lista">
        ${estado.historial.map(p => `
          <li>
            <a class="periodo info" href="#/periodo/${p.id}">
              <div>
                <div class="nombre">${fecha(p.inicio)} — ${fecha(p.fin)}</div>
                <div class="detalle">${p.gastos.length} ${p.gastos.length === 1 ? 'gasto' : 'gastos'}</div>
              </div>
              <span class="costo">${dinero.format(total(p.gastos))} ›</span>
            </a>
          </li>`).join('')}
      </ul>
    </section>`;
}

function vistaAjustes() {
  return `
    <section class="card">
      <h2>Copia de seguridad</h2>
      <p class="etiqueta">Los datos se guardan solo en este dispositivo. Exportalos para tener un respaldo o para pasarlos a otro dispositivo (importar reemplaza los datos actuales).</p>
      <div class="acciones">
        <button class="btn primario" data-accion="exportar">Exportar datos</button>
        <button class="btn borde" data-accion="importar">Importar datos</button>
        <input type="file" id="archivo-importar" ${ES_ANDROID ? '' : 'accept="application/json,.json"'} hidden>
      </div>
    </section>

    ${ES_NATIVA ? '' : `
    <section class="card">
      <h2>Instalar la app</h2>
      <p class="etiqueta">
        <strong>PC (Chrome/Edge):</strong> ícono de instalar en la barra de direcciones o el botón "Instalar app" de arriba.<br>
        <strong>Android (Chrome):</strong> menú ⋮ → "Instalar aplicación" / "Agregar a pantalla principal".<br>
        <strong>iPhone (Safari):</strong> botón Compartir → "Agregar a inicio".
      </p>
    </section>`}

    <section class="card">
      <h2>Zona peligrosa</h2>
      <button class="btn peligro" data-accion="borrar-todo">Borrar todos los datos</button>
    </section>`;
}

/* ================= Router ================= */

function render() {
  const [vista = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  let html, tab;
  switch (vista) {
    case 'historial': html = vistaHistorial(); tab = 'historial'; break;
    case 'periodo': html = vistaResumen(id); tab = id === 'actual' ? 'inicio' : 'historial'; break;
    case 'ajustes': html = vistaAjustes(); tab = 'ajustes'; break;
    default: html = vistaInicio(); tab = 'inicio';
  }
  $app.innerHTML = html;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('activo', a.dataset.tab === tab));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

/* ================= Acciones ================= */

$app.addEventListener('submit', e => {
  if (e.target.id !== 'form-gasto') return;
  e.preventDefault();
  const f = e.target;
  const costo = parseMonto(f.costo.value);
  if (costo === null) {
    f.costo.setCustomValidity('Ingresá un monto válido mayor a 0');
    f.costo.reportValidity();
    return;
  }
  estado.activo.gastos.push({
    id: nuevoId(),
    nombre: f.nombre.value.trim(),
    descripcion: f.descripcion.value.trim(),
    costo,
    categoria: f.categoria.value,
    fecha: new Date().toISOString(),
  });
  guardar();
  const categoria = f.categoria.value;
  render();
  // Dejamos la categoría elegida para cargar varios gastos seguidos.
  const nuevoForm = document.getElementById('form-gasto');
  nuevoForm.categoria.value = categoria;
  nuevoForm.nombre.focus();
  toast('Gasto agregado');
});

$app.addEventListener('input', e => {
  if (e.target.name === 'costo') e.target.setCustomValidity('');
});

$app.addEventListener('change', e => {
  if (e.target.id === 'archivo-importar') importar(e.target.files[0]);
});

$app.addEventListener('click', e => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const { accion, id } = btn.dataset;

  switch (accion) {
    case 'borrar-gasto': {
      const g = estado.activo.gastos.find(x => x.id === id);
      if (g && confirm(`¿Borrar "${g.nombre}" (${dinero.format(g.costo)})?`)) {
        estado.activo.gastos = estado.activo.gastos.filter(x => x.id !== id);
        guardar();
        render();
      }
      break;
    }
    case 'finalizar': {
      const p = estado.activo;
      if (!p.gastos.length) return;
      if (!confirm(`¿Finalizar el periodo? Total: ${dinero.format(total(p.gastos))}. Se guardará en el historial y empezará uno nuevo.`)) return;
      estado.historial.unshift({ ...p, fin: new Date().toISOString() });
      estado.activo = nuevoPeriodo();
      guardar();
      location.hash = '#/periodo/' + p.id;
      break;
    }
    case 'borrar-periodo': {
      if (!confirm('¿Eliminar este periodo del historial? No se puede deshacer.')) return;
      estado.historial = estado.historial.filter(p => p.id !== id);
      guardar();
      location.hash = '#/historial';
      break;
    }
    case 'exportar':
      exportar();
      break;
    case 'importar':
      document.getElementById('archivo-importar').click();
      break;
    case 'borrar-todo': {
      if (!confirm('¿Borrar TODOS los gastos y periodos? No se puede deshacer.')) return;
      estado = { activo: nuevoPeriodo(), historial: [] };
      guardar();
      toast('Datos borrados');
      location.hash = '#/';
      render();
      break;
    }
  }
});

async function exportar() {
  const json = JSON.stringify({ app: 'mis-gastos', version: 1, ...estado }, null, 2);
  const nombreArchivo = `mis-gastos-${new Date().toISOString().slice(0, 10)}.json`;

  // En Android no hay descargas del navegador: se guarda el archivo y se abre "Compartir"
  // (para mandarlo por WhatsApp, Drive, mail, guardarlo en Archivos, etc.).
  if (ES_ANDROID) {
    try {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const { uri } = await Filesystem.writeFile({ path: nombreArchivo, data: json, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: 'Copia de Mis Gastos', url: uri, dialogTitle: 'Guardar o enviar la copia' });
    } catch (err) {
      if (!/cancel/i.test(err.message || '')) alert('No se pudo exportar: ' + err.message);
    }
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importar(archivo) {
  if (!archivo) return;
  try {
    const d = JSON.parse(await archivo.text());
    if (!esEstadoValido(d)) throw new Error('El archivo no tiene el formato de Mis Gastos.');
    if (!confirm('Esto reemplaza todos los datos actuales por los del archivo. ¿Continuar?')) return;
    estado = { activo: d.activo, historial: d.historial };
    guardar();
    toast('Datos importados');
    location.hash = '#/';
    render();
  } catch (err) {
    alert('No se pudo importar: ' + err.message);
  }
}

/* ================= PWA: instalación y modo offline ================= */

let eventoInstalar = null;
const $btnInstalar = document.getElementById('btn-instalar');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  eventoInstalar = e;
  $btnInstalar.hidden = false;
});

$btnInstalar.addEventListener('click', async () => {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
  $btnInstalar.hidden = true;
});

window.addEventListener('appinstalled', () => { $btnInstalar.hidden = true; });

if (!ES_NATIVA && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker no registrado', err));
}

render();
