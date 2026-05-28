// server-proxy.js - CON SCRAPERS INTEGRADOS Y REFRESCO PERIÓDICO
// Sirve:
//   GET /api/farmacias          → directorio completo (OpenData Euskadi)
//   GET /api/farmacias-guardia  → guardias HOY (scrapers colegios)
//   GET /health                 → estado del servidor

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────────────────
// URLs
// ─────────────────────────────────────────────────────────────────────────────
const OPENDATA_URL =
  'https://opendata.euskadi.eus/contenidos/ds_localizaciones/' +
  'farmacias_y_botiquines_euskadi/opendata/farmaziak.geojson';

// Archivos de caché
const CACHE_DIRECTORIO = 'cache-farmaziak.json';       // directorio completo
const CACHE_GUARDIAS   = 'cache-guardias.json';         // guardias de HOY

// Cada cuánto refrescar las guardias (ms). Por defecto 6 horas.
const INTERVALO_GUARDIAS_MS = 6 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES DE CACHÉ
// ─────────────────────────────────────────────────────────────────────────────
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

/** Devuelve la edad del archivo en días, o Infinity si no existe */
function edadCacheDias(archivo) {
  if (!fs.existsSync(archivo)) return Infinity;
  const stats = fs.statSync(archivo);
  return (Date.now() - stats.mtimeMs) / 1000 / 60 / 60 / 24;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPER GIPUZKOA  (API interna del colegio)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeGipuzkoa() {
  console.log('\n🔵 GIPUZKOA: Iniciando scraper...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    await page.goto(
      'https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/',
      { waitUntil: 'networkidle2', timeout: 60000 }
    );

    // Cerrar cookies si aparecen
    try {
      await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 3000 });
      await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
      await page.waitForTimeout(1000);
    } catch (_) {}

    await page.waitForSelector('#municipio', { timeout: 10000 });

    // Obtener lista de municipios
    const municipios = await page.evaluate(() => {
      const select = document.getElementById('municipio');
      return Array.from(select.options)
        .filter(o => o.value && o.value !== '')
        .map(o => ({ id: o.value, nombre: o.text }));
    });

    console.log(`🔵 GIPUZKOA: ${municipios.length} municipios`);

    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    const resultado = [];

    for (const municipio of municipios) {
      try {
        await page.select('#municipio', municipio.id);
        await page.waitForTimeout(300);

        const farmacias = await page.evaluate(async (mId, mFecha) => {
          try {
            const r = await fetch('https://cofgipuzkoa.pretools.net/buscarFarmaciasGuardia', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ municipio: mId, fecha: mFecha, festivos: [] })
            });
            const data = await r.json();
            return data.map(f => ({
              nombre:    f.nombre    || '',
              direccion: f.direccion || '',
              municipio: f.poblacion || '',
              telefono:  f.telefono  || '',
              provincia: 'GIPUZKOA'
            }));
          } catch (_) { return []; }
        }, municipio.id, fecha);

        if (farmacias.length > 0) {
          console.log(`   └─ ${municipio.nombre}: ${farmacias.length} farmacias`);
          resultado.push(...farmacias);
        }

        await page.waitForTimeout(200);
      } catch (e) {
        console.error(`   └─ Error ${municipio.nombre}:`, e.message);
      }
    }

    await browser.close();
    console.log(`✅ GIPUZKOA: ${resultado.length} farmacias de guardia`);
    return resultado;

  } catch (e) {
    await browser.close();
    console.error('❌ GIPUZKOA ERROR:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPER ÁLAVA  (plugin WP Google Maps en cofalava.org)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeAlava() {
  console.log('\n🟢 ÁLAVA: Iniciando scraper...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    await page.goto('https://cofalava.org/farmacias-de-guardia/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Aceptar cookies
    try {
      await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 3000 });
      await page.click('[aria-label="Aceptar todo"]');
      await page.waitForTimeout(2000);
    } catch (_) {}

    // Intentar hacer clic en cualquier botón "Aceptar"
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, a'))
          .find(b => b.textContent.includes('Aceptar') || b.textContent.includes('Accept'));
        if (btn) btn.click();
      });
      await page.waitForTimeout(2000);
    } catch (_) {}

    // Esperar a que el plugin de mapas cargue
    try {
      await page.waitForSelector('.wpgmp_locations, .place_title', { timeout: 20000 });
    } catch (_) {
      console.log('🟢 ÁLAVA: No se encontró el mapa, intentando extracción genérica...');
    }

    await page.waitForTimeout(3000);

    const farmacias = await page.evaluate(() => {
      const results = [];

      // Estrategia 1: plugin WP Google Maps
      const items = document.querySelectorAll('.wpgmp_locations');
      items.forEach(item => {
        const nombreEl = item.querySelector('.place_title');
        if (!nombreEl) return;
        const nombre = nombreEl.textContent.trim();
        const tds    = item.querySelectorAll('.ft-td');
        results.push({
          nombre,
          direccion: tds[1] ? tds[1].textContent.replace(/\s+/g,' ').replace(/Cómo ir/g,'').trim() : '',
          municipio: tds[2] ? tds[2].textContent.trim() : '',
          telefono:  tds[3] ? tds[3].textContent.replace(/\D/g,'') : '',
          provincia: 'ARABA'
        });
      });

      if (results.length > 0) return results;

      // Estrategia 2: tablas genéricas
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const nombre = cells[0].textContent.trim();
          if (nombre.length > 3 && nombre.toUpperCase().includes('FARMACIA')) {
            results.push({
              nombre,
              direccion: cells[1]?.textContent.trim() || '',
              municipio: cells[2]?.textContent.trim() || '',
              telefono:  (cells[3]?.textContent.replace(/\D/g,'')) || '',
              provincia: 'ARABA'
            });
          }
        }
      });

      return results;
    });

    await browser.close();
    console.log(`✅ ÁLAVA: ${farmacias.length} farmacias de guardia`);
    return farmacias;

  } catch (e) {
    await browser.close();
    console.error('❌ ÁLAVA ERROR:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPER BIZKAIA  (formulario en cofbizkaia)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeBizkaia() {
  console.log('\n🔴 BIZKAIA: Iniciando scraper...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // Bloquear imágenes/fuentes para ir más rápido
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image','font','media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    // Intentar primero la URL del COF Bizkaia (.net)
    const urlsBizkaia = [
      'https://www.cofbizkaia.net/Sec_DF/wf_DirectorioFarmaciaGuardialst.aspx?IdMenu=52',
      'https://www.cofbizkaia.eus/farmacia_de_guardia/'
    ];

    let cargado = false;
    for (const url of urlsBizkaia) {
      try {
        console.log(`🔴 BIZKAIA: Probando ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        cargado = true;
        break;
      } catch (e) {
        console.warn(`🔴 BIZKAIA: Falló ${url}`);
      }
    }

    if (!cargado) {
      await browser.close();
      return [];
    }

    await page.waitForTimeout(5000);

    // Buscar selector de municipios
    const selectoresEsperados = [
      '#ddlMunicipio',
      '#ctl00_cphMainContent_ddlMunicipio',
      '#municipio_farmacias_guardia',
      'select'
    ];
    let selectorMunicipio = null;
    for (const sel of selectoresEsperados) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        selectorMunicipio = sel;
        console.log(`🔴 BIZKAIA: Selector encontrado → ${sel}`);
        break;
      } catch (_) {}
    }

    // Sin selector: scraping directo de la tabla visible
    if (!selectorMunicipio) {
      console.log('🔴 BIZKAIA: Sin selector, extrayendo tabla directamente...');
      const farmacias = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('table tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const nombre = cells[0].textContent.trim();
            if (nombre.length > 3 && !nombre.includes('Nombre')) {
              results.push({
                nombre,
                direccion: cells[1]?.textContent.trim() || '',
                municipio: cells[2]?.textContent.trim() || '',
                telefono:  cells[3]?.textContent.replace(/\D/g,'') || '',
                provincia: 'BIZKAIA'
              });
            }
          }
        });
        return results;
      });
      await browser.close();
      console.log(`✅ BIZKAIA: ${farmacias.length} farmacias (tabla directa)`);
      return farmacias;
    }

    // Con selector: iterar municipios
    const municipios = await page.evaluate(sel => {
      const select = document.querySelector(sel);
      if (!select) return [];
      return Array.from(select.options)
        .filter(o => o.value && o.value !== '' && o.value !== '0')
        .map(o => ({ id: o.value, nombre: o.text }));
    }, selectorMunicipio);

    console.log(`🔴 BIZKAIA: ${municipios.length} municipios`);

    const resultado = [];
    for (const municipio of municipios) {
      try {
        await page.select(selectorMunicipio, municipio.id);
        await page.waitForTimeout(1500);

        const farmacias = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('table tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const nombre = cells[0].textContent.trim();
              if (nombre.length > 3 && !nombre.includes('Dirección') && !nombre.includes('Nombre')) {
                results.push({
                  nombre,
                  direccion: cells[1]?.textContent.trim() || '',
                  municipio: cells[2]?.textContent.trim() || '',
                  telefono:  cells[3]?.textContent.replace(/\D/g,'') || '',
                  provincia: 'BIZKAIA'
                });
              }
            }
          });
          return results;
        });

        if (farmacias.length > 0) {
          console.log(`   └─ ${municipio.nombre}: ${farmacias.length} farmacias`);
          resultado.push(...farmacias);
        }
      } catch (e) {
        console.error(`   └─ Error ${municipio.nombre}:`, e.message);
      }
    }

    await browser.close();
    console.log(`✅ BIZKAIA: ${resultado.length} farmacias de guardia`);
    return resultado;

  } catch (e) {
    await browser.close();
    console.error('❌ BIZKAIA ERROR:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORQUESTADOR: lanza los 3 scrapers y guarda el resultado
// ─────────────────────────────────────────────────────────────────────────────
let scraperEnEjecucion = false;

async function ejecutarScrapers() {
  if (scraperEnEjecucion) {
    console.log('⏳ Scraper ya en ejecución, saltando...');
    return;
  }
  scraperEnEjecucion = true;
  console.log('\n════════════════════════════════════════════════════');
  console.log('🚀 INICIANDO SCRAPING DE GUARDIAS');
  console.log('════════════════════════════════════════════════════');

  // Ejecutar en paralelo
  const [gipuzkoa, alava, bizkaia] = await Promise.allSettled([
    scrapeGipuzkoa(),
    scrapeAlava(),
    scrapeBizkaia()
  ]);

  const datos = {
    gipuzkoa: gipuzkoa.status === 'fulfilled' ? gipuzkoa.value : [],
    alava:     alava.status    === 'fulfilled' ? alava.value    : [],
    bizkaia:   bizkaia.status  === 'fulfilled' ? bizkaia.value  : [],
    fecha:     new Date().toISOString(),
    errores: [
      ...(gipuzkoa.status === 'rejected' ? [`Gipuzkoa: ${gipuzkoa.reason?.message}`] : []),
      ...(alava.status    === 'rejected' ? [`Álava: ${alava.reason?.message}`]        : []),
      ...(bizkaia.status  === 'rejected' ? [`Bizkaia: ${bizkaia.reason?.message}`]    : [])
    ]
  };

  datos.total = datos.gipuzkoa.length + datos.alava.length + datos.bizkaia.length;

  console.log('\n📊 RESUMEN:');
  console.log(`   🔵 Gipuzkoa: ${datos.gipuzkoa.length}`);
  console.log(`   🟢 Álava:    ${datos.alava.length}`);
  console.log(`   🔴 Bizkaia:  ${datos.bizkaia.length}`);
  console.log(`   📦 Total:    ${datos.total}`);

  if (datos.errores.length > 0) {
    console.log(`   ⚠️  Errores: ${datos.errores.join(' | ')}`);
  }

  escribirCache(CACHE_GUARDIAS, datos);
  scraperEnEjecucion = false;
  return datos;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESCARGA DIRECTORIO COMPLETO (OpenData Euskadi)
// ─────────────────────────────────────────────────────────────────────────────
async function descargarDirectorio() {
  console.log('\n🌐 Descargando directorio desde OpenData Euskadi...');
  const response = await axios.get(OPENDATA_URL, {
    timeout: 60000,
    headers: {
      'Accept': 'application/json, application/geo+json, */*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://opendata.euskadi.eus/',
      'Origin': 'https://opendata.euskadi.eus',
      'Connection': 'keep-alive'
    }
  });

  if (!response.data || !response.data.features) {
    throw new Error('Respuesta inválida de OpenData');
  }

  // Añadir lat/lng a properties para compatibilidad con el frontend
  response.data.features = response.data.features.map(f => {
    const [longitude, latitude] = f.geometry.coordinates;
    return { ...f, properties: { ...f.properties, longitude, latitude } };
  });

  console.log(`✅ Directorio descargado: ${response.data.features.length} farmacias`);
  escribirCache(CACHE_DIRECTORIO, response.data);
  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/farmacias  (directorio completo)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/farmacias', async (req, res) => {
  console.log('\n📥 GET /api/farmacias —', new Date().toISOString());

  try {
    // Usar caché si tiene menos de 7 días
    const edad = edadCacheDias(CACHE_DIRECTORIO);
    if (edad < 7) {
      const cached = leerCache(CACHE_DIRECTORIO);
      if (cached) {
        console.log(`✅ Sirviendo directorio desde caché (${Math.round(edad * 24)}h)`);
        return res.json(cached);
      }
    }

    const datos = await descargarDirectorio();
    res.json(datos);

  } catch (error) {
    console.error('❌ Error /api/farmacias:', error.message);

    const cached = leerCache(CACHE_DIRECTORIO);
    if (cached) {
      console.log('♻️  Sirviendo directorio desde caché de emergencia');
      return res.set('X-Cache', 'emergency').json(cached);
    }

    res.status(500).json({ error: 'No se pudo obtener el directorio', message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/farmacias-guardia  (guardias de HOY)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/farmacias-guardia', async (req, res) => {
  console.log('\n📥 GET /api/farmacias-guardia —', new Date().toISOString());

  // Parámetro ?provincia=GIPUZKOA|ARABA|BIZKAIA  (opcional)
  const provincia = req.query.provincia?.toUpperCase();

  try {
    const cached = leerCache(CACHE_GUARDIAS);
    const edadHoras = edadCacheDias(CACHE_GUARDIAS) * 24;

    // Si el caché tiene menos de 6 horas y tiene datos, servir directamente
    if (cached && edadHoras < 6 && cached.total > 0) {
      console.log(`✅ Sirviendo guardias desde caché (${Math.round(edadHoras)}h)`);
      const datos = filtrarPorProvincia(cached, provincia);
      return res.set('X-Cache', 'hit').json(formatearRespuestaGuardias(datos, cached.fecha));
    }

    // Si hay caché antiguo, devolver inmediatamente y refrescar en segundo plano
    if (cached && cached.total > 0) {
      console.log('♻️  Caché antiguo, sirviendo y refrescando en segundo plano...');
      ejecutarScrapers().catch(e => console.error('Error scraper BG:', e.message));
      const datos = filtrarPorProvincia(cached, provincia);
      return res.set('X-Cache', 'stale').json(formatearRespuestaGuardias(datos, cached.fecha));
    }

    // Sin caché: ejecutar scrapers ahora (puede tardar)
    console.log('⚡ Sin caché de guardias, ejecutando scrapers...');
    const nuevosDatos = await ejecutarScrapers();
    const datos = filtrarPorProvincia(nuevosDatos, provincia);
    res.json(formatearRespuestaGuardias(datos, nuevosDatos.fecha));

  } catch (error) {
    console.error('❌ Error /api/farmacias-guardia:', error.message);

    const cached = leerCache(CACHE_GUARDIAS);
    if (cached) {
      const datos = filtrarPorProvincia(cached, provincia);
      return res.set('X-Cache', 'emergency').json(formatearRespuestaGuardias(datos, cached.fecha));
    }

    res.status(500).json({ error: 'No se pudieron obtener las guardias', message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/farmacias-guardia/refresh  (forzar actualización)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/farmacias-guardia/refresh', async (req, res) => {
  console.log('\n🔄 POST /api/farmacias-guardia/refresh');
  res.json({ ok: true, mensaje: 'Scraping iniciado en segundo plano' });
  ejecutarScrapers().catch(e => console.error('Error scraper forzado:', e.message));
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /health
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const cachedDir    = leerCache(CACHE_DIRECTORIO);
  const cachedGuard  = leerCache(CACHE_GUARDIAS);

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scraperEnEjecucion,
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
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
    total: datos[clave]?.length ?? 0
  };
}

function formatearRespuestaGuardias(datos, fecha) {
  return {
    tipo: 'farmacias-guardia',
    fecha,
    total:    datos.total ?? (datos.gipuzkoa?.length + datos.alava?.length + datos.bizkaia?.length),
    gipuzkoa: datos.gipuzkoa ?? [],
    alava:    datos.alava    ?? [],
    bizkaia:  datos.bizkaia  ?? [],
    errores:  datos.errores  ?? []
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REFRESCO PERIÓDICO (cada 6 horas)
// ─────────────────────────────────────────────────────────────────────────────
function programarRefresco() {
  console.log(`\n⏰ Refresco periódico de guardias cada ${INTERVALO_GUARDIAS_MS / 3600000}h`);
  setInterval(() => {
    console.log('\n⏰ Refresco periódico activado');
    ejecutarScrapers().catch(e => console.error('Error refresco periódico:', e.message));
  }, INTERVALO_GUARDIAS_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  🚀 SERVIDOR PROXY - FARMACIAS EUSKADI              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`   📍 http://localhost:${PORT}`);
  console.log(`   📍 Directorio:  GET /api/farmacias`);
  console.log(`   📍 Guardias:    GET /api/farmacias-guardia`);
  console.log(`   📍 Guardia/prov:GET /api/farmacias-guardia?provincia=GIPUZKOA`);
  console.log(`   📍 Forzar ref:  POST /api/farmacias-guardia/refresh`);
  console.log(`   📍 Estado:      GET /health\n`);

  // Arrancar refresco periódico
  programarRefresco();

  // Si no hay caché de guardias o es de otro día, lanzar scrapers al inicio
  const cached = leerCache(CACHE_GUARDIAS);
  const esDeHoy = cached?.fecha
    ? new Date(cached.fecha).toDateString() === new Date().toDateString()
    : false;

  if (!cached || !esDeHoy || cached.total === 0) {
    console.log('🔍 Caché de guardias ausente o antiguo → lanzando scrapers al inicio...');
    ejecutarScrapers().catch(e => console.error('Error scrapers inicio:', e.message));
  } else {
    console.log(`♻️  Caché de guardias de HOY disponible (${cached.total} farmacias)`);
  }

  // Si no hay caché del directorio, descargarlo
  if (edadCacheDias(CACHE_DIRECTORIO) > 7) {
    descargarDirectorio().catch(e => console.error('Error descarga directorio:', e.message));
  }
});