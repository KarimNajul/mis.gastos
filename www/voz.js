'use strict';

/* =====================================================================
   Carga de gastos por voz.
   - interpretarGasto(texto): convierte una frase en { nombre, costo, categoria }.
   - Voz: reconocimiento de voz (plugin nativo en el APK, Web Speech API en el navegador).
   ===================================================================== */

const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- Números (con dígitos o en palabras) ---------- */

const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
};

// "8500", "8.500", "8,500", "$8.500", "1.500.000", "90.000,00", "1500,50" → número; si no, null.
function numeroDeDigitos(tok) {
  let s = tok.replace(/^\$/, '').replace(/[.,]$/, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;
  if (puntos && comas) {
    // Con los dos, el último es el decimal: "90.000,00" o "90,000.00".
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = s.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');
  } else if (puntos + comas > 1 || /^\d{1,3}[.,]\d{3}$/.test(s)) {
    s = s.replace(/[.,]/g, ''); // separador de miles: "1.500.000", "90.000"
  } else {
    s = s.replace(',', '.'); // decimal: "2500,50"
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const esMiles = t => t === 'mil' || t === 'k';
const esParteDeNumero = t => numeroDeDigitos(t) !== null || t in NUMEROS || esMiles(t) || /^millon(es)?$/.test(t);

// Busca todas las secuencias numéricas ("20 mil", "dos mil quinientos", "8500")
// y devuelve [{ valor, desde, hasta }] con los índices de tokens que ocupan.
function buscarNumeros(tokens) {
  const encontrados = [];
  let i = 0;
  while (i < tokens.length) {
    if (!esParteDeNumero(tokens[i]) || tokens[i] === 'k') { i++; continue; }
    let total = 0, actual = 0, j = i;
    while (j < tokens.length) {
      const t = tokens[j];
      const d = numeroDeDigitos(t);
      // Dos cifras seguidas son números distintos ("play 5 600 mil" → 5 y 600 mil).
      if (d !== null && j > i && numeroDeDigitos(tokens[j - 1]) !== null) break;
      if (d !== null) actual += d;
      else if (t in NUMEROS) actual += NUMEROS[t];
      else if (esMiles(t)) { total += (actual || 1) * 1000; actual = 0; }
      else if (/^millon(es)?$/.test(t)) { total = (total + (actual || 1)) * 1e6; actual = 0; }
      else if (t === 'y' && j > i && tokens[j + 1] in NUMEROS) { /* "treinta y cinco" */ }
      else break;
      j++;
    }
    encontrados.push({ valor: total + actual, desde: i, hasta: j });
    i = j;
  }
  return encontrados;
}

/* ---------- Categorías por palabra clave ---------- */

const PALABRAS_CATEGORIA = {
  comida: 'comida almuerzo almuerzos cena cenas desayuno merienda restaurante restaurant resto pizza pizzas empanada empanadas hamburguesa hamburguesas delivery cafe helado kiosco sushi parrilla asado rotiseria panaderia facturas pedidosya rappi milanesa comer',
  super: 'super supermercado mercado almacen verduleria carniceria chino compras coto carrefour jumbo changomas',
  transporte: 'transporte nafta combustible gasoil sube colectivo bondi tren subte taxi uber cabify didi remis peaje estacionamiento cochera mecanico gomeria pasaje pasajes',
  servicios: 'servicios servicio luz gas agua internet wifi telefono celular cable netflix spotify abono expensas seguro suscripcion disney youtube',
  hogar: 'hogar alquiler muebles mueble limpieza ferreteria casa reparacion plomero electricista',
  salud: 'salud farmacia remedio remedios medicamento medicamentos medico doctor dentista odontologo prepaga analisis consulta gimnasio gym',
  ocio: 'ocio cine salida salidas bar boliche cerveza birra juego juegos recital teatro viaje vacaciones entrada entradas futbol regalo',
  ropa: 'ropa zapatillas remera pantalon campera zapatos vestido buzo medias jean',
  educacion: 'educacion libro libros curso cursos facultad universidad colegio escuela utiles fotocopias apuntes clase clases',
  tecnologia: 'tecnologia electronica monitor computadora compu notebook laptop pc placa teclado mouse auriculares tablet impresora cargador memoria disco ssd procesador consola play playstation xbox nintendo joystick televisor tele tv parlante camara router smartwatch',
  otros: 'otros otro',
};
// Nombres de categoría dichos directamente ("pizza 12000 ocio"): se usan como categoría
// y no quedan en el nombre.
const CATEGORIA_POR_NOMBRE = {
  comida: 'comida', super: 'super', supermercado: 'super', transporte: 'transporte',
  servicios: 'servicios', servicio: 'servicios', hogar: 'hogar', salud: 'salud', ocio: 'ocio',
  ropa: 'ropa', educacion: 'educacion', tecnologia: 'tecnologia', otros: 'otros',
};
const CATEGORIA_DE_PALABRA = {};
for (const [cat, palabras] of Object.entries(PALABRAS_CATEGORIA)) {
  for (const p of palabras.split(' ')) CATEGORIA_DE_PALABRA[p] = cat;
}

/* ---------- Interpretación de la frase ---------- */

const RELLENO_INICIAL = new Set('gaste gastamos gasto pague pagamos pago compre compramos salio salieron costo fue fueron me nos en de del el la los las un una unos unas por al y'.split(' '));
const RELLENO = new Set(['pesos', 'peso', '$', 'mangos', 'lucas']);
const RELLENO_FINAL = new Set(['de', 'del', 'en', 'por', 'el', 'la', 'un', 'una', 'y', 'a']);

const capitalizar = s => s.charAt(0).toUpperCase() + s.slice(1);

function interpretarGasto(texto) {
  const limpio = String(texto)
    // Miles separados con espacio: "90 000" → "90000", "1 500 000" → "1500000"
    // (pero no "5 600 mil", que son dos números).
    .replace(/(\d)[\s  ](?=\d{3}(?!\d)(?![\s  ]*(mil|k)\b))/gi, '$1')
    // Pegados: "100mil" / "100k" → "100 mil" / "100 k".
    .replace(/(\d)(mil|k)\b/gi, '$1 $2');

  // Separa en palabras y les quita la puntuación de los bordes (no la de "$8.500").
  const originales = limpio.trim().split(/\s+/).map(t => t.replace(/^[¿¡"'(]+|[?!"'),;:]+$|\.$/g, '')).filter(Boolean);
  const norm = originales.map(t => sinAcentos(t.toLowerCase()));

  // Monto: la cifra más grande dicha ("gasté 8500 en un almuerzo" → 8500, no 1).
  const numeros = buscarNumeros(norm);
  const monto = numeros.reduce((max, n) => (!max || n.valor > max.valor ? n : max), null);
  // "lucas" = miles ("20 lucas").
  let costo = monto ? monto.valor : null;
  if (monto && norm[monto.hasta] === 'lucas') costo *= 1000;

  // Categoría: "categoría X" explícito o la primera palabra clave reconocida.
  let categoria = null;
  const quitar = new Set();
  const iCat = norm.indexOf('categoria');
  if (iCat !== -1 && CATEGORIA_DE_PALABRA[norm[iCat + 1]]) {
    categoria = CATEGORIA_DE_PALABRA[norm[iCat + 1]];
    quitar.add(iCat).add(iCat + 1);
  }
  if (!categoria) {
    // La primera palabra se respeta como nombre ("Comida 5000" → nombre "Comida").
    const k = norm.findIndex((t, i) => i > 0 && CATEGORIA_POR_NOMBRE[t]);
    if (k !== -1) {
      categoria = CATEGORIA_POR_NOMBRE[norm[k]];
      quitar.add(k);
      if (norm[k - 1] === 'en' && k - 1 > 0) quitar.add(k - 1);
    }
  }
  if (!categoria) {
    const palabra = norm.find(t => CATEGORIA_DE_PALABRA[t]);
    if (palabra) categoria = CATEGORIA_DE_PALABRA[palabra];
  }

  // Lo que queda (sin el monto, la categoría, "pesos", etc.) es el nombre.
  if (monto) for (let k = monto.desde; k < monto.hasta; k++) quitar.add(k);
  const resto = originales
    .map((t, k) => ({ t, n: norm[k], k }))
    .filter(x => !quitar.has(x.k) && !RELLENO.has(x.n));

  while (resto.length && RELLENO_INICIAL.has(resto[0].n)) resto.shift();
  while (resto.length && RELLENO_FINAL.has(resto[resto.length - 1].n)) resto.pop();

  return {
    nombre: capitalizar(resto.map(x => x.t).join(' ')),
    costo: costo && costo > 0 ? Math.round(costo * 100) / 100 : null,
    categoria,
  };
}

/* ---------- Respuesta a "¿Lo confirmás?" ---------- */

// Devuelve 'si', 'no', 'cancelar' o null si no se entendió.
function interpretarRespuesta(texto) {
  const t = ` ${sinAcentos(String(texto).toLowerCase()).replace(/[^a-z\s]/g, ' ')} `;
  const tiene = palabras => palabras.some(p => t.includes(` ${p} `));
  if (tiene(['cancelar', 'cancela', 'cancelalo', 'salir', 'olvidalo', 'dejalo', 'basta', 'nada'])) return 'cancelar';
  if (tiene(['no', 'nop', 'negativo', 'incorrecto', 'mal', 'otra vez', 'de nuevo', 'repetir'])) return 'no';
  if (tiene(['si', 'sip', 'dale', 'ok', 'okay', 'okey', 'confirmo', 'confirmar', 'confirma', 'confirmado',
    'listo', 'correcto', 'exacto', 'perfecto', 'bien', 'claro', 'obvio', 'agregalo', 'agrega', 'agregar',
    'va', 'joya', 'de una', 'afirmativo', 'yes'])) return 'si';
  return null;
}

/* ---------- Reconocimiento de voz y voz hablada ---------- */

const Voz = (() => {
  const capacitor = window.Capacitor;
  const esNativa = !!(capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform() && capacitor.Plugins);
  const plugin = esNativa && capacitor.Plugins.SpeechRecognition;
  const pluginHabla = esNativa && capacitor.Plugins.TextToSpeech;
  const ReconocimientoWeb = window.SpeechRecognition || window.webkitSpeechRecognition;
  const esElectron = navigator.userAgent.includes('Electron');
  // Opera y Brave tienen la API pero sin el servicio de Google detrás: termina sin resultado.
  const navegadorSinVoz = /OPR\/|OPX\/|Opera/.test(navigator.userAgent) || !!navigator.brave;

  let reconocedorWeb = null;

  const mensajes = {
    'not-allowed': 'Permití el uso del micrófono para cargar por voz.',
    'service-not-allowed': 'Permití el uso del micrófono para cargar por voz.',
    'no-speech': 'No se detectó voz. Revisá en el ícono del micrófono de la barra de direcciones que esté elegido el micrófono correcto.',
    'sin-audio': 'El micrófono no está mandando sonido. Revisá que no esté silenciado.',
    'no-match': 'No entendí lo que dijiste. Probá de nuevo, hablando más cerca.',
    'network': 'El reconocimiento de voz necesita internet.',
    'audio-capture': 'No se encontró un micrófono.',
    'en-uso': 'El micrófono está siendo usado por otra aplicación.',
    'navegador': 'Este navegador (Opera/Brave) no permite reconocer voz. Abrí la app en Chrome o Edge, o usá la app de Android.',
  };
  const error = codigo => Object.assign(new Error(mensajes[codigo] || 'No se pudo usar el micrófono.'), { codigo });

  async function escucharNativo(prompt) {
    const { available } = await plugin.available();
    if (!available) throw new Error('Este celular no tiene reconocimiento de voz disponible.');
    let permiso = await plugin.checkPermissions();
    if (permiso.speechRecognition !== 'granted') permiso = await plugin.requestPermissions();
    if (permiso.speechRecognition !== 'granted') throw error('not-allowed');
    try {
      const { matches } = await plugin.start({
        language: 'es-AR', maxResults: 1, partialResults: false, popup: true,
        prompt: prompt || 'Decí el gasto, por ejemplo: pizza 12 mil',
      });
      return (matches && matches[0]) || '';
    } catch (e) {
      if (/no match|didn't understand|no speech/i.test(e.message || '')) throw error('no-speech');
      throw e;
    }
  }

  // Pide el permiso del micrófono y comprueba que exista antes de reconocer.
  async function verificarMicrofono() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.warn('getUserMedia:', e.name, e.message);
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw error('not-allowed');
      if (e.name === 'NotReadableError') throw error('en-uso');
      throw error('audio-capture');
    }
  }

  async function escucharWeb() {
    if (navegadorSinVoz) throw error('navegador');
    await verificarMicrofono();
    return new Promise((resolve, reject) => {
      const r = new ReconocimientoWeb();
      reconocedorWeb = r;
      r.lang = 'es-AR';
      r.interimResults = false;
      r.maxAlternatives = 1;
      let texto = '';
      let huboAudio = false;
      let huboVoz = false;
      let detenido = false;
      r.onaudiostart = () => { huboAudio = true; };
      r.onspeechstart = () => { huboVoz = true; };
      r.onresult = e => { texto = e.results[0][0].transcript; };
      r.onerror = e => {
        console.warn('SpeechRecognition error:', e.error, e.message);
        if (e.error !== 'aborted') reject(error(e.error));
      };
      r.onend = () => {
        reconocedorWeb = null;
        if (texto || detenido) resolve(texto);
        else reject(error(!huboAudio ? 'sin-audio' : !huboVoz ? 'no-speech' : 'no-match'));
      };
      r.detener = () => { detenido = true; r.stop(); };
      r.start();
    });
  }

  /* --- Voz hablada: plugin en el APK, speechSynthesis en el navegador --- */

  // Preferencias de la voz (por dispositivo).
  const CLAVE_PREFERENCIAS = 'mis-gastos-voz';
  const PREFERENCIAS_INICIALES = { voz: '', vozLang: '', tono: 'normal', estilo: 'neutro' };
  function preferencias() {
    try {
      return { ...PREFERENCIAS_INICIALES, ...JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) || '{}') };
    } catch (e) {
      return { ...PREFERENCIAS_INICIALES };
    }
  }
  function guardarPreferencias(cambios) {
    try { localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify({ ...preferencias(), ...cambios })); } catch (e) { /* sin storage */ }
  }

  const TONOS = {
    normal: { nombre: 'Normal', pitch: 1, rate: 1.05 },
    grave: { nombre: 'Grave', pitch: 0.55, rate: 0.95 },
    agudo: { nombre: 'Agudo', pitch: 1.5, rate: 1.1 },
    ardilla: { nombre: 'Ardilla 🐿️', pitch: 2, rate: 1.45 },
    robot: { nombre: 'Robot 🤖', pitch: 0.1, rate: 0.85 },
    apurado: { nombre: 'Apurado ⚡', pitch: 1.1, rate: 1.8 },
    tranqui: { nombre: 'Tranqui 😴', pitch: 0.9, rate: 0.7 },
  };

  const PAISES = {
    AR: 'Argentina', MX: 'México', ES: 'España', US: 'Estados Unidos', CO: 'Colombia', CL: 'Chile',
    PE: 'Perú', UY: 'Uruguay', VE: 'Venezuela', 419: 'Latinoamérica', BO: 'Bolivia', PY: 'Paraguay',
    EC: 'Ecuador', CR: 'Costa Rica', CU: 'Cuba', DO: 'Rep. Dominicana', GT: 'Guatemala', HN: 'Honduras',
    NI: 'Nicaragua', PA: 'Panamá', PR: 'Puerto Rico', SV: 'El Salvador', GQ: 'Guinea Ecuatorial',
  };
  const pais = lang => PAISES[(lang.split(/[-_]/)[1] || '').toUpperCase()] || lang;

  // El navegador no informa el género: se deduce por el nombre de la voz.
  const HOMBRES = 'tomas alvaro jorge pablo raul arnau dario elias nil saul teo cecilio gerardo liberto luciano pelayo yago alonso gonzalo andres emilio lorenzo mateo diego carlos juan miguel manuel sebastian alex rodrigo federico victor'.split(' ');
  const MUJERES = 'elena elvira abril estrella irene laia lia triana vera ximena dalia beatriz candela carlota larissa marina nuria renata paloma helena laura sabina salome camila catalina lucia sofia valentina monica paulina isabela angelica'.split(' ');
  function genero(nombre) {
    const palabras = sinAcentos(nombre.toLowerCase()).split(/[^a-z]+/);
    if (palabras.some(p => HOMBRES.includes(p))) return 'hombre';
    if (palabras.some(p => MUJERES.includes(p)) || palabras.includes('google')) return 'mujer';
    return null;
  }
  // "Microsoft Tomas Online (Natural) - Spanish (Argentina)" → "Tomas".
  function nombreCorto(nombre) {
    if (/^Google\b/i.test(nombre)) return 'Google'; // "Google español de Estados Unidos"
    const limpio = nombre.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s+(Online|Desktop|\(|-).*$/i, '').trim();
    return limpio || nombre;
  }

  function vocesWeb() {
    return new Promise(resolve => {
      const listar = () => speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang));
      if (listar().length) return resolve(listar());
      // Algunas voces cargan un rato después.
      speechSynthesis.addEventListener('voiceschanged', () => resolve(listar()), { once: true });
      setTimeout(() => resolve(listar()), 1500);
    });
  }

  // [{ id, nombre, lang, pais, genero, online }] de las voces en español del dispositivo.
  async function listarVoces() {
    const primeroArgentina = (a, b) => (b.lang === 'es-AR') - (a.lang === 'es-AR') || a.pais.localeCompare(b.pais);
    if (pluginHabla) return listarVocesAndroid(primeroArgentina);
    if (!window.speechSynthesis) return [];
    return (await vocesWeb())
      .map(v => ({ id: v.voiceURI, nombre: nombreCorto(v.name), lang: v.lang, pais: pais(v.lang), genero: genero(v.name) }))
      .sort((a, b) => primeroArgentina(a, b) || a.nombre.localeCompare(b.nombre));
  }

  // Android no da nombre ni género: solo un código ("es-us-x-esd-local") y el país.
  // Cada voz viene repetida (sin internet y online): se deja una, preferentemente la local.
  async function listarVocesAndroid(orden) {
    const { voices } = await pluginHabla.getSupportedVoices();
    const porVoz = new Map();
    voices.forEach((v, i) => {
      if (!/^es/i.test(v.lang)) return;
      const codigo = String(v.voiceURI || v.name || i);
      const m = codigo.match(/^(.*?)-(local|network)$/);
      const clave = m ? m[1] : codigo;
      const online = !!m && m[2] === 'network';
      const actual = porVoz.get(clave);
      if (!actual || (actual.online && !online)) {
        porVoz.set(clave, { id: String(i), clave, lang: v.lang, pais: pais(v.lang), genero: null, online });
      }
    });
    const lista = [...porVoz.values()].sort((a, b) => orden(a, b) || a.clave.localeCompare(b.clave));
    // Numeradas por país: "Voz 1 · Estados Unidos", "Voz 2 · Estados Unidos"...
    const contador = {};
    return lista.map(v => {
      contador[v.pais] = (contador[v.pais] || 0) + 1;
      return { ...v, nombre: `Voz ${contador[v.pais]}` };
    });
  }

  // Voz automática: la primera en español, prefiriendo acentos latinoamericanos.
  let vozEspanol = null;
  function elegirVoz() {
    const voces = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang));
    const preferencia = ['es-AR', 'es-US', 'es-419', 'es-MX', 'es-ES'];
    vozEspanol = voces.sort((a, b) => {
      const pa = preferencia.indexOf(a.lang), pb = preferencia.indexOf(b.lang);
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    })[0] || null;
  }
  if (!pluginHabla && window.speechSynthesis) {
    elegirVoz();
    speechSynthesis.addEventListener('voiceschanged', elegirVoz);
  }

  async function hablar(texto) {
    const prefs = preferencias();
    const tono = TONOS[prefs.tono] || TONOS.normal;

    if (pluginHabla) {
      const opciones = { text: texto, lang: prefs.vozLang || 'es-AR', rate: tono.rate, pitch: tono.pitch };
      if (prefs.voz !== '') opciones.voice = Number(prefs.voz);
      try { await pluginHabla.speak(opciones); }
      catch (e) {
        try { await pluginHabla.speak({ text: texto, lang: 'es-ES', rate: tono.rate, pitch: tono.pitch }); }
        catch (e2) { console.warn('TTS:', e2); }
      }
      return;
    }
    if (!window.speechSynthesis) return;
    const elegida = prefs.voz && speechSynthesis.getVoices().find(v => v.voiceURI === prefs.voz);
    const voz = elegida || vozEspanol;
    await new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = voz ? voz.lang : 'es-AR';
      if (voz) u.voice = voz;
      u.rate = tono.rate;
      u.pitch = tono.pitch;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      // Por si el navegador nunca avisa que terminó.
      setTimeout(resolve, 3000 + (texto.length * 100) / tono.rate);
    });
  }

  function callar() {
    if (pluginHabla) pluginHabla.stop().catch(() => {});
    else if (window.speechSynthesis) speechSynthesis.cancel();
  }

  return {
    // El EXE (Electron) no trae reconocimiento de voz: ahí no se muestra el botón.
    disponible: !!plugin || (!!ReconocimientoWeb && !esElectron),
    // El popup nativo de Android tiene su propio botón; en la web se puede cortar a mano.
    sePuedeDetener: !plugin,
    esAndroid: !!pluginHabla,
    // prompt: texto del cartel de Android mientras escucha.
    escuchar: prompt => (plugin ? escucharNativo(prompt) : escucharWeb()),
    hablar,
    listarVoces,
    TONOS,
    preferencias,
    guardarPreferencias,
    detener: () => {
      callar();
      if (reconocedorWeb) reconocedorWeb.detener();
    },
  };
})();
