// server-proxy.js — VERSIÓN SIN PUPPETEER
// ─────────────────────────────────────────────────────────────────────────────
// Los scrapers se ejecutan en GitHub Actions (IPs no bloqueadas por el WAF).
// El resultado se publica en un Gist público y este servidor lo lee con axios.
//
// Endpoints:
//   GET  /api/farmacias              → directorio completo (OpenData Euskadi)
//   GET  /api/farmacias-guardia      → guardias HOY (desde Gist de GitHub)
//   POST /api/farmacias-guardia/refresh → fuerza recarga del Gist
//   GET  /health                     → estado del servidor
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Configuración ─────────────────────────────────────────────────────────────
const OPENDATA_URL =
  'https://opendata.euskadi.eus/contenidos/ds_localizaciones/' +
  'farmacias_y_botiquines_euskadi/opendata/farmaziak.geojson';

// URL raw del Gist — reemplaza GIST_ID con tu ID real tras crearlo
// Formato: https://gist.githubusercontent.com/TU_USUARIO/GIST_ID/raw/guardias-output.json
const GIST_RAW_URL = process.env.GIST_RAW_URL ||
  'https://gist.githubusercontent.com/jsersan/GIST_ID/raw/guardias-output.json';

const CACHE_DIRECTORIO = 'cache-farmaziak.json';
const CACHE_GUARDIAS   = 'cache-guardias.json';
const CACHE_DIRECTORIO_DIAS    = 7;   // días antes de refrescar el directorio
const CACHE_GUARDIAS_HORAS     = 6;   // horas antes de refrescar las guardias

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:4200',
    'http://localhost:3000',
    'https://txemaserrano.com',
    'https://www.txemaserrano.com',
    'http://txemaserrano.com',
    'http://www.txemaserrano.com',
    'https://*.github.io'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors());

// ── Caché en disco ────────────────────────────────────────────────────────────
function leerCache(archivo) {
  try {
    if (!fs.existsSync(archivo)) return null;
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    console.warn(`⚠️  Error leyendo caché ${archivo}:`, e.message);
    return null;
  }
}

function escribirCache(archivo, datos) {
  try {
    fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
    console.log(`💾 Caché guardado: ${archivo}`);
  } catch (e) {
    console.warn(`⚠️  Error escribiendo caché ${archivo}:`, e.message);
  }
}

function edadCacheDias(archivo) {
  if (!fs.existsSync(archivo)) return Infinity;
  return (Date.now() - fs.statSync(archivo).mtimeMs) / 86400000;
}

// ── Descargar directorio (OpenData Euskadi) ───────────────────────────────────
async function descargarDirectorio() {
  console.log('\n🌐 Descargando directorio desde OpenData Euskadi...');
  const response = await axios.get(OPENDATA_URL, {
    timeout: 60000,
    headers: {
      'Accept':          'application/json, application/geo+json, */*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Referer':         'https://opendata.euskadi.eus/',
      'Origin':          'https://opendata.euskadi.eus'
    }
  });

  if (!response.data?.features) throw new Error('Respuesta inválida de OpenData');

  response.data.features = response.data.features.map(f => {
    const [longitude, latitude] = f.geometry.coordinates;
    return { ...f, properties: { ...f.properties, longitude, latitude } };
  });

  console.log(`✅ Directorio: ${response.data.features.length} farmacias`);
  escribirCache(CACHE_DIRECTORIO, response.data);
  return response.data;
}

// ── Leer guardias desde el Gist público ──────────────────────────────────────
async function leerGuardiasDesdeGist() {
  console.log('\n🔗 Leyendo guardias desde Gist...');

  // Añadir timestamp para evitar caché del CDN de GitHub
  const url = `${GIST_RAW_URL}?t=${Date.now()}`;

  const r = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'farmacias-backend/1.0' }
  });

  const datos = r.data;
  if (!datos || typeof datos !== 'object') throw new Error('Gist vacío o inválido');

  console.log(`✅ Gist leído — total: ${datos.total}, fecha: ${datos.fecha}`);
  escribirCache(CACHE_GUARDIAS, datos);
  return datos;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function filtrarPorProvincia(datos, provincia) {
  if (!provincia) return datos;
  const mapa = { GIPUZKOA: 'gipuzkoa', ARABA: 'alava', BIZKAIA: 'bizkaia' };
  const clave = mapa[provincia];
  if (!clave) return datos;
  return {
    ...datos,
    gipuzkoa: clave === 'gipuzkoa' ? datos.gipuzkoa : [],
    alava:     clave === 'alava'    ? datos.alava    : [],
    bizkaia:   clave === 'bizkaia'  ? datos.bizkaia  : [],
    total:     datos[clave]?.length ?? 0
  };
}

function formatearRespuesta(datos, fecha) {
  return {
    tipo:     'farmacias-guardia',
    fecha:    fecha ?? datos.fecha,
    total:    datos.total ?? ((datos.gipuzkoa?.length || 0) + (datos.alava?.length || 0) + (datos.bizkaia?.length || 0)),
    gipuzkoa: datos.gipuzkoa ?? [],
    alava:    datos.alava    ?? [],
    bizkaia:  datos.bizkaia  ?? [],
    errores:  datos.errores  ?? []
  };
}

// ── Endpoint: GET /api/farmacias ──────────────────────────────────────────────
app.get('/api/farmacias', async (req, res) => {
  console.log('\n📥 GET /api/farmacias —', new Date().toISOString());
  try {
    if (edadCacheDias(CACHE_DIRECTORIO) < CACHE_DIRECTORIO_DIAS) {
      const cached = leerCache(CACHE_DIRECTORIO);
      if (cached) {
        console.log('✅ Directorio desde caché');
        return res.json(cached);
      }
    }
    res.json(await descargarDirectorio());
  } catch (error) {
    console.error('❌ Error /api/farmacias:', error.message);
    const cached = leerCache(CACHE_DIRECTORIO);
    if (cached) return res.set('X-Cache','emergency').json(cached);
    res.status(500).json({ error: 'No se pudo obtener el directorio', message: error.message });
  }
});

// ── Endpoint: GET /api/farmacias-guardia ──────────────────────────────────────
app.get('/api/farmacias-guardia', async (req, res) => {
  console.log('\n📥 GET /api/farmacias-guardia —', new Date().toISOString());
  const provincia = req.query.provincia?.toUpperCase();

  try {
    const cached    = leerCache(CACHE_GUARDIAS);
    const edadHoras = edadCacheDias(CACHE_GUARDIAS) * 24;
    const esDeHoy   = cached?.fecha
      ? new Date(cached.fecha).toDateString() === new Date().toDateString()
      : false;

    // Servir caché si es de hoy y tiene menos de 6 horas
    if (cached && cached.total > 0 && esDeHoy && edadHoras < CACHE_GUARDIAS_HORAS) {
      console.log(`✅ Guardias desde caché (${Math.round(edadHoras)}h)`);
      return res.set('X-Cache','hit').json(formatearRespuesta(filtrarPorProvincia(cached, provincia)));
    }

    // Intentar leer del Gist
    const datos = await leerGuardiasDesdeGist();
    return res.json(formatearRespuesta(filtrarPorProvincia(datos, provincia)));

  } catch (error) {
    console.error('❌ Error /api/farmacias-guardia:', error.message);

    // Fallback al caché local aunque sea antiguo
    const cached = leerCache(CACHE_GUARDIAS);
    if (cached) {
      console.log('♻️  Fallback a caché local');
      return res.set('X-Cache','emergency').json(
        formatearRespuesta(filtrarPorProvincia(cached, provincia))
      );
    }

    // Sin caché: devolver vacío con mensaje claro
    res.status(503).json({
      tipo:     'farmacias-guardia',
      fecha:    new Date().toISOString(),
      total:    0,
      gipuzkoa: [],
      alava:    [],
      bizkaia:  [],
      errores:  [
        'Los datos de guardia aún no están disponibles.',
        'El scraper de GitHub Actions se ejecuta cada 6 horas.',
        error.message
      ]
    });
  }
});

// ── Endpoint: POST /api/farmacias-guardia/refresh ─────────────────────────────
app.post('/api/farmacias-guardia/refresh', async (req, res) => {
  console.log('\n🔄 POST /api/farmacias-guardia/refresh');
  try {
    const datos = await leerGuardiasDesdeGist();
    res.json({ ok: true, total: datos.total, fecha: datos.fecha });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Endpoint: GET /health ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const cachedDir   = leerCache(CACHE_DIRECTORIO);
  const cachedGuard = leerCache(CACHE_GUARDIAS);
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    gistUrl:   GIST_RAW_URL,
    directorio: {
      disponible: !!cachedDir,
      farmacias:  cachedDir?.features?.length ?? 0,
      edadHoras:  Math.round(edadCacheDias(CACHE_DIRECTORIO) * 24)
    },
    guardias: {
      disponible: !!cachedGuard,
      total:      cachedGuard?.total ?? 0,
      gipuzkoa:   cachedGuard?.gipuzkoa?.length ?? 0,
      alava:      cachedGuard?.alava?.length ?? 0,
      bizkaia:    cachedGuard?.bizkaia?.length ?? 0,
      fecha:      cachedGuard?.fecha ?? null,
      edadHoras:  Math.round(edadCacheDias(CACHE_GUARDIAS) * 24)
    }
  });
});

// ── Arranque ──────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  🚀 SERVIDOR PROXY - FARMACIAS EUSKADI (sin Chrome) ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`   📍 http://localhost:${PORT}`);
  console.log(`   📍 Directorio:    GET /api/farmacias`);
  console.log(`   📍 Guardias:      GET /api/farmacias-guardia`);
  console.log(`   📍 Refresh:       POST /api/farmacias-guardia/refresh`);
  console.log(`   📍 Health:        GET /health`);
  console.log(`   🔗 Gist URL:      ${GIST_RAW_URL}\n`);

  // Refrescar directorio si es antiguo
  if (edadCacheDias(CACHE_DIRECTORIO) > CACHE_DIRECTORIO_DIAS) {
    descargarDirectorio().catch(e => console.error('Error descarga directorio:', e.message));
  }

  // Intentar leer guardias del Gist al arrancar
  try {
    await leerGuardiasDesdeGist();
  } catch (e) {
    console.warn('⚠️  No se pudo leer Gist al arrancar:', e.message);
  }
});
