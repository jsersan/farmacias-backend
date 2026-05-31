#!/usr/bin/env node
/**
 * scraper-runner.js  v5
 * ─────────────────────────────────────────────────────────────────
 * Se ejecuta en GitHub Actions (IPs limpias, sin bloqueo de WAF).
 * Genera  guardias-output.json  que el frontend lee vía Gist público.
 *
 * Cambios respecto a v4:
 *  ✅  Bizkaia — nueva fuente farmacias.es (listado + fichas con
 *               teléfono y coordenadas). Las webs oficiales del COF
 *               Bizkaia no son rascables. Fuente NO oficial.
 *  ✅  Álava    — selectores reales (li.fc-component-text + .ft-td)
 *  ✅  Gipuzkoa — sin cambios (API interna pretools, funciona)
 * ─────────────────────────────────────────────────────────────────
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');

const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '45000', 10);
const delay   = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ═══════════════════════════════════════════════════════════════ *
 *  HELPERS                                                          *
 * ═══════════════════════════════════════════════════════════════ */

/** Fecha YYYY-MM-DD (para la API de Gipuzkoa). */
function fechaISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha dd/mm/yyyy (por si se necesita en formularios GET). */
function fechaDMY() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Elimina duplicados según una función clave. */
function dedup(arr, keyFn) {
  const seen = new Set();
  return arr.filter(item => {
    const k = keyFn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


/* ═══════════════════════════════════════════════════════════════ *
 *  GIPUZKOA  —  API interna cofgipuzkoa.pretools.net                *
 * ═══════════════════════════════════════════════════════════════ */

async function scrapeGipuzkoa(page) {
  console.log('\n🔵 GIPUZKOA: navegando...');
  const fecha = fechaISO();

  await page.goto(
    'https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/',
    { waitUntil: 'networkidle2', timeout: TIMEOUT }
  );

  // Cerrar banner de cookies
  try {
    await page.waitForSelector(
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      { timeout: 4000 }
    );
    await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
    await delay(1000);
  } catch (_) { /* sin banner */ }

  await page.waitForSelector('#municipio', { timeout: TIMEOUT });

  const municipios = await page.evaluate(() =>
    Array.from(document.getElementById('municipio').options)
      .filter(o => o.value && o.value !== '')
      .map(o => ({ id: o.value, nombre: o.text }))
  );
  console.log(`🔵 GIPUZKOA: ${municipios.length} municipios`);

  const resultado = [];

  for (const m of municipios) {
    try {
      const farmacias = await page.evaluate(async (mId, mFecha) => {
        try {
          const r = await fetch(
            'https://cofgipuzkoa.pretools.net/buscarFarmaciasGuardia',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ municipio: mId, fecha: mFecha, festivos: [] })
            }
          );
          if (!r.ok) return [];
          const data = await r.json();
          return data.map(f => ({
            nombre:    f.nombre    || '',
            direccion: f.direccion || '',
            municipio: f.poblacion || '',
            telefono:  f.telefono  || '',
            provincia: 'GIPUZKOA'
          }));
        } catch (_) { return []; }
      }, m.id, fecha);

      resultado.push(...farmacias);
      await delay(100);                       // cortesía con el servidor
    } catch (e) {
      console.error(`   └─ Error ${m.nombre}:`, e.message);
    }
  }

  // ── Deduplicar ──
  const unicos = dedup(resultado, f =>
    `${f.nombre.toLowerCase()}|${f.direccion.toLowerCase()}|${f.municipio.toLowerCase()}`
  );

  console.log(
    `✅ GIPUZKOA: ${unicos.length} farmacias únicas ` +
    `(descartadas ${resultado.length - unicos.length} duplicadas)`
  );
  return unicos;
}


/* ═══════════════════════════════════════════════════════════════ *
 *  ÁLAVA  —  cofalava.org  (listado .ft-td del plugin WP Maps)      *
 *  El listado completo aparece sin interacción al cargar la página. *
 *  VALIDADO: 13 farmacias únicas en prueba local.                   *
 * ═══════════════════════════════════════════════════════════════ */

async function scrapeAlava(page) {
  console.log('\n🟢 ÁLAVA: navegando...');

  await page.goto('https://cofalava.org/farmacias-de-guardia/', {
    waitUntil: 'networkidle2',
    timeout: TIMEOUT
  });

  // Cookies (si aparecen)
  try {
    await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 4000 });
    await page.click('[aria-label="Aceptar todo"]');
    await delay(1500);
  } catch (_) { /* sin banner */ }

  // Esperar a que el listado de farmacias se renderice
  try {
    await page.waitForSelector('li.fc-component-text', { timeout: 20000 });
  } catch (_) {
    console.log('🟢 ÁLAVA: no aparecieron filas li.fc-component-text');
    return [];
  }
  await delay(2000); // margen para que carguen todas

  const farmacias = await page.evaluate(() => {
    const limpiarDireccion = txt =>
      txt.replace(/\s*Cómo ir\s*$/i, '').replace(/\s+/g, ' ').trim();

    const primerTelefono = txt => {
      const m = txt.match(/\d{9}/);          // primer número de 9 dígitos
      return m ? m[0] : '';
    };

    const filas = Array.from(document.querySelectorAll('li.fc-component-text'));
    const results = [];

    filas.forEach(li => {
      const celdas = Array.from(li.querySelectorAll('.ft-td'))
        .map(td => td.textContent.replace(/\s+/g, ' ').trim());

      // Estructura: [Farmacia, Dirección, Población, Teléfono, Horario, extra]
      if (celdas.length < 4) return;

      const nombre = celdas[0];
      if (!nombre || /^farmacia$/i.test(nombre)) return;   // descartar cabecera

      results.push({
        nombre,
        direccion: limpiarDireccion(celdas[1] || ''),
        municipio: celdas[2] || 'Álava',
        telefono:  primerTelefono(celdas[3] || ''),
        provincia: 'ARABA'
      });
    });

    return results;
  });

  // Deduplicar farmacias que aparecen por varios turnos (mismo nombre+municipio)
  const unicos = dedup(farmacias, f =>
    `${f.nombre.toLowerCase()}|${f.municipio.toLowerCase()}`
  );

  console.log(
    `✅ ÁLAVA: ${unicos.length} farmacias únicas ` +
    `(descartadas ${farmacias.length - unicos.length} duplicadas por turno)`
  );
  return unicos;
}


/* ═══════════════════════════════════════════════════════════════ *
 *  BIZKAIA  —  v5  (fuente: farmacias.es)                           *
 *                                                                   *
 *  Las webs oficiales del COF Bizkaia no exponen los datos de forma *
 *  rascable (la .net da timeout; la .eus carga por JS sin datos en  *
 *  el HTML). Usamos farmacias.es/12-horas/bizkaia como fuente       *
 *  alternativa (NO oficial): su HTML es estático y cada farmacia    *
 *  enlaza a una ficha con teléfono y coordenadas.                   *
 *                                                                   *
 *  Estrategia:                                                      *
 *   1) Leer el listado (nombre, dirección, municipio, CP, enlace).  *
 *   2) Entrar en cada ficha → teléfono (tel:) + lat/lon (iframe).   *
 *                                                                   *
 *  El teléfono permite que el frontend cruce con el directorio de   *
 *  842 farmacias y coloque el marcador. lat/lon van como respaldo.  *
 * ═══════════════════════════════════════════════════════════════ */

async function scrapeBizkaia(page) {
  console.log('\n🔴 BIZKAIA: navegando a farmacias.es...');

  await page.goto('https://www.farmacias.es/12-horas/bizkaia', {
    waitUntil: 'networkidle2',
    timeout: TIMEOUT
  });

  // Cookies (si aparecen)
  try {
    await page.waitForSelector('a.acepto, .cookie-accept, #aceptar-cookies', { timeout: 3000 });
    await page.click('a.acepto, .cookie-accept, #aceptar-cookies');
    await delay(1000);
  } catch (_) { /* sin banner o distinto */ }

  // 1) Extraer el listado: nombre, dirección, municipio, CP y enlace a la ficha
  const listado = await page.evaluate(() => {
    const limpiar = t => (t || '').replace(/\s+/g, ' ').trim();
    const items = [];

    document.querySelectorAll('a[href*="/bizkaia/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      // Solo fichas de farmacia: /bizkaia/{municipio}/{slug-NUMERO}
      if (!/\/bizkaia\/[^/]+\/[^/]+-\d+$/.test(href)) return;

      const nombre = limpiar(a.textContent);
      if (!nombre || nombre.length < 3) return;

      const bloque = a.closest('div, article, li');
      const texto  = bloque ? limpiar(bloque.innerText) : '';

      // "48011 BILBAO - Bizkaia"
      const m = texto.match(/(\d{5})\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\-\/ ]+?)\s*-\s*Bizkaia/);
      const cp        = m ? m[1] : '';
      const municipio = m ? m[2].trim() : '';

      let direccion = '';
      if (m) {
        const idx    = texto.indexOf(m[1]);
        const previo = texto.slice(0, idx);
        direccion = limpiar(previo.replace(nombre, '').replace(/Abierta ahora.*/i, ''));
      }

      items.push({
        nombre,
        direccion,
        municipio,
        cp,
        url: href.startsWith('http') ? href : `https://www.farmacias.es${href}`
      });
    });

    return items;
  });

  const unicas = dedup(listado, f => f.url);
  console.log(`🔴 BIZKAIA: ${unicas.length} farmacias en el listado`);

  if (unicas.length === 0) {
    console.warn('🔴 BIZKAIA: listado vacío (¿cambió la estructura de farmacias.es?)');
    return [];
  }

  // 2) Entrar en cada ficha para sacar teléfono y coordenadas
  const resultado = [];
  for (const f of unicas) {
    try {
      await page.goto(f.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await delay(250);   // cortesía con el servidor

      const detalle = await page.evaluate(() => {
        const html = document.body.innerHTML;

        // Teléfono: <a href="tel:+34XXXXXXXXX">
        // Quitamos el prefijo internacional y nos quedamos con los 9 dígitos finales.
        let telefono = '';
        const telLink = document.querySelector('a[href^="tel:"]');
        if (telLink) {
          let soloDigitos = (telLink.getAttribute('href') || '').replace(/\D/g, '');
          if (soloDigitos.startsWith('34') && soloDigitos.length > 9) {
            soloDigitos = soloDigitos.slice(2);   // quitar prefijo de España
          }
          telefono = soloDigitos.slice(-9);        // últimos 9 dígitos
        }

        // Coordenadas: iframemapa1.php?lat=XX.XX&lon=YY.YY  (el & puede venir como &amp;)
        let lat = null, lon = null;
        const mc = html.match(/lat=(-?\d+\.\d+)&(?:amp;)?lon=(-?\d+\.\d+)/);
        if (mc) { lat = parseFloat(mc[1]); lon = parseFloat(mc[2]); }

        return { telefono, lat, lon };
      });

      resultado.push({
        nombre:    f.nombre,
        direccion: f.direccion || `${f.municipio} (${f.cp})`,
        municipio: f.municipio,
        telefono:  detalle.telefono,
        provincia: 'BIZKAIA',
        lat: detalle.lat,
        lon: detalle.lon
      });
    } catch (e) {
      console.error(`   └─ Error en ${f.nombre}: ${e.message}`);
    }
  }

  const unicos = dedup(resultado, f =>
    `${f.nombre.toLowerCase()}|${f.municipio.toLowerCase()}`
  );

  const conTel = unicos.filter(f => f.telefono).length;
  console.log(
    `✅ BIZKAIA: ${unicos.length} farmacias ` +
    `(${conTel} con teléfono, ${unicos.length - conTel} sin teléfono)`
  );
  return unicos;
}


/* ═══════════════════════════════════════════════════════════════ *
 *  MAIN                                                             *
 * ═══════════════════════════════════════════════════════════════ */

(async () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SCRAPER GUARDIAS v5 — GitHub Actions             ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Fecha: ${fechaISO()}  ·  ${new Date().toISOString()}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const errores = [];

  async function run(nombre, fn) {
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    try {
      return await fn(page);
    } catch (e) {
      errores.push(`${nombre}: ${e.message}`);
      console.error(`❌ ${nombre} ERROR:`, e.message);
      return [];
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Secuencial para no consumir demasiada RAM en Actions
  const gipuzkoa = await run('Gipuzkoa', scrapeGipuzkoa);
  const alava    = await run('Álava',    scrapeAlava);
  const bizkaia  = await run('Bizkaia',  scrapeBizkaia);

  await browser.close();

  const output = {
    tipo:     'farmacias-guardia',
    fecha:    new Date().toISOString(),
    total:    gipuzkoa.length + alava.length + bizkaia.length,
    gipuzkoa,
    alava,
    bizkaia,
    errores
  };

  console.log('\n📊 RESUMEN:');
  console.log(`   🔵 Gipuzkoa: ${gipuzkoa.length}`);
  console.log(`   🟢 Álava:    ${alava.length}`);
  console.log(`   🔴 Bizkaia:  ${bizkaia.length}`);
  console.log(`   📦 Total:    ${output.total}`);
  if (errores.length) console.log(`   ⚠️  Errores:  ${errores.join(' | ')}`);

  fs.writeFileSync('guardias-output.json', JSON.stringify(output, null, 2));
  console.log('\n✅ guardias-output.json generado');

  // Exit 0 si hay datos aunque haya algún error parcial
  process.exit(output.total > 0 ? 0 : 1);
})();
