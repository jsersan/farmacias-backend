#!/usr/bin/env node
/**
 * scraper-runner.js  v3
 * ─────────────────────────────────────────────────────────────────
 * Se ejecuta en GitHub Actions (IPs limpias, sin bloqueo de WAF).
 * Genera  guardias-output.json  que el backend lee vía Gist público.
 *
 * Correcciones respecto a v2:
 *  ✅  Bizkaia  — parsing correcto (nombre/dirección/teléfono separados)
 *  ✅  Gipuzkoa — deduplicación (eliminados ~73 % de entradas repetidas)
 *  ✅  Usa setTimeout estándar (waitForTimeout eliminado en Puppeteer 22+)
 * ─────────────────────────────────────────────────────────────────
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');

const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '45000', 10);
const delay   = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ═══════════════════════════════════════════════════════════════ *
 *  HELPERS                                                       *
 * ═══════════════════════════════════════════════════════════════ */

/** Fecha YYYY-MM-DD (para la API de Gipuzkoa). */
function fechaISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha dd/mm/yyyy (para el formulario GET de Bizkaia). */
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

/**
 * Parsea un bloque de texto de Bizkaia con esta estructura:
 *
 *   APELLIDO APELLIDO, NOMBRE
 *   Dirección: CALLE, NÚM
 *   Población: MUNICIPIO
 *   Horario:   09:00 - 22:00
 *   Teléfono:  94 XXXXXXX
 *   Zona:      ZONA-NOMBRE
 *
 * Devuelve un objeto normalizado o null si el bloque no es válido.
 */
function parseBizkaiaTexto(texto, municipioFallback) {
  const limpio = texto
    .replace(/\t+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const lineas = limpio.split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length < 2) return null;

  // La primera línea que NO sea una etiqueta es el nombre
  let nombre = '';
  for (const l of lineas) {
    if (!/^(Dirección|Población|Horario|Teléfono|Zona):/i.test(l)) {
      nombre = l;
      break;
    }
  }
  if (!nombre || nombre.length < 4) return null;

  const campo = etiqueta => {
    const m = limpio.match(new RegExp(etiqueta + ':\\s*(.+)', 'i'));
    return m ? m[1].trim() : '';
  };

  return {
    nombre,
    direccion: campo('Dirección'),
    municipio: campo('Población') || municipioFallback,
    telefono:  campo('Teléfono').replace(/[^\d]/g, ''),
    provincia: 'BIZKAIA'
  };
}


/* ═══════════════════════════════════════════════════════════════ *
 *  GIPUZKOA  —  API interna cofgipuzkoa.pretools.net             *
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
 *  ÁLAVA  —  plugin WP Google Maps en cofalava.org               *
 * ═══════════════════════════════════════════════════════════════ */

async function scrapeAlava(page) {
  console.log('\n🟢 ÁLAVA: navegando...');

  await page.goto('https://cofalava.org/farmacias-de-guardia/', {
    waitUntil: 'networkidle2',
    timeout: TIMEOUT
  });

  // Cookies
  try {
    await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 4000 });
    await page.click('[aria-label="Aceptar todo"]');
    await delay(2000);
  } catch (_) {}

  // Esperar a que el mapa cargue
  try {
    await page.waitForSelector(
      '.wpgmp_locations, .place_title, table tr td',
      { timeout: 20000 }
    );
  } catch (_) {
    console.log('🟢 ÁLAVA: sin selector estándar, intento genérico...');
  }
  await delay(3000);

  const farmacias = await page.evaluate(() => {
    const results = [];

    // Estrategia 1: plugin WP Google Maps Pro
    document.querySelectorAll('.wpgmp_locations').forEach(item => {
      const nombreEl = item.querySelector('.place_title');
      if (!nombreEl) return;
      const tds = item.querySelectorAll('.ft-td');
      results.push({
        nombre:    nombreEl.textContent.trim(),
        direccion: tds[1]
          ? tds[1].textContent.replace(/\s+/g, ' ').replace(/Cómo ir/g, '').trim()
          : '',
        municipio: tds[2] ? tds[2].textContent.trim() : '',
        telefono:  tds[3] ? tds[3].textContent.replace(/\D/g, '') : '',
        provincia: 'ARABA'
      });
    });
    if (results.length > 0) return results;

    // Estrategia 2: tabla HTML genérica
    document.querySelectorAll('table tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const nombre = cells[0].textContent.trim();
        if (nombre.length > 3 && /farmacia/i.test(nombre)) {
          results.push({
            nombre,
            direccion: cells[1]?.textContent.trim() || '',
            municipio: cells[2]?.textContent.trim() || 'Álava',
            telefono:  cells[3]?.textContent.replace(/\D/g, '') || '',
            provincia: 'ARABA'
          });
        }
      }
    });
    return results;
  });

  console.log(`✅ ÁLAVA: ${farmacias.length} farmacias`);
  return farmacias;
}


/* ═══════════════════════════════════════════════════════════════ *
 *  BIZKAIA  —  formulario GET en cofbizkaia.eus                  *
 *                                                                *
 *  v3: navega directamente a la URL de resultados (GET) para     *
 *  cada municipio y parsea los bloques de texto con etiquetas     *
 *  «Dirección: / Población: / Teléfono:» en vez de depender de  *
 *  celdas de tabla (que no existen en la web actual).             *
 * ═══════════════════════════════════════════════════════════════ */

async function scrapeBizkaia(page) {
  console.log('\n🔴 BIZKAIA: navegando...');

  // Bloquear recursos pesados
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // 1) Cargar página del formulario para obtener la lista de municipios
  await page.goto('https://www.cofbizkaia.eus/farmacia_de_guardia/', {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT
  });
  await delay(3000);

  const municipios = await page.evaluate(() => {
    const sel = document.querySelector('#municipio_farmacias_guardia');
    if (!sel) return [];
    return Array.from(sel.options)
      .filter(o => o.value && o.value !== '')
      .map(o => ({
        id:     o.value,
        nombre: o.getAttribute('data_municipio') || o.textContent.trim()
      }));
  });

  if (municipios.length === 0) {
    console.warn('🔴 BIZKAIA: selector de municipios no encontrado');
    return [];
  }

  console.log(`🔴 BIZKAIA: ${municipios.length} municipios`);

  const resultado = [];
  const fecha     = fechaDMY();

  // 2) Para cada municipio, navegar a la URL de resultados y parsear
  for (let i = 0; i < municipios.length; i++) {
    const m = municipios[i];
    try {
      const url =
        'https://www.cofbizkaia.eus/farmacia_de_guardia/' +
        '?idmunicipio=' + encodeURIComponent(m.id) +
        '&fecha_guardia=' + encodeURIComponent(fecha) +
        '&submitForm=1' +
        '&orderby=farmacia&order=desc' +
        '&pagetype=farmacias_de_guardia';

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await delay(1000);

      // 3) Extraer bloques de texto con datos de farmacia
      const bloques = await page.evaluate(() => {
        const el = document.querySelector('#content, .farmaciasGuardia');
        if (!el) return [];

        const texto  = el.innerText || '';
        const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

        // Cada farmacia sigue el patrón:
        //   NOMBRE
        //   Dirección: …
        //   Población: …
        //   Horario: …
        //   Teléfono: …
        //   Zona: …
        const etiquetas = /^(Dirección|Población|Horario|Teléfono|Zona):/;
        const ignorar   = /^(Municipio|Fecha|Buscar|Selecciona|COFBI|cookie|Acceso|©|Colegiación|Farmacias Bizkaia|Farmacias de guardia|Farmacias y Servicios|Quienes somos|Ventanilla|Noticias|Espacios|Canal|Publicaciones|Contacto|Colegio Oficial|Aviso Legal|Politica|Dónde Estamos|Cómo llegar|Horario:|Tfno|colegio@|Junta|Equipo|Comisiones|Solicitud|Qué te ofrecemos|Formación|Biblioteca|Consejo sanitario|Directorio|Sugerencias|Estatutos|Memoria|Cuentas|Registro|Compromiso|Nuestro equipo|Transparencia|Información|Misión|Bolsa|Actividades|Calendario|Servicios|Recuérdame|Acceder|Username|E-mail|Password|Confirm|REGISTER|Contraseña|OBTENER|Volver|Obtener)/i;

        const bloques   = [];
        let   bloque    = [];

        for (let i = 0; i < lineas.length; i++) {
          const l = lineas[i];

          if (l.startsWith('Dirección:') && bloque.length > 0) {
            // Acumular esta línea y las siguientes etiquetadas
            bloque.push(l);
            for (let j = i + 1; j < lineas.length; j++) {
              if (etiquetas.test(lineas[j])) {
                bloque.push(lineas[j]);
                i = j;
              } else {
                break;
              }
            }
            bloques.push(bloque.join('\n'));
            bloque = [];

          } else if (!etiquetas.test(l) && !ignorar.test(l) && l.length > 4) {
            // Posible nombre de farmacia → empieza nuevo bloque
            bloque = [l];
          }
        }
        return bloques;
      });

      // 4) Parsear cada bloque en Node
      for (const raw of bloques) {
        const parsed = parseBizkaiaTexto(raw, m.nombre);
        if (parsed) resultado.push(parsed);
      }

      if (bloques.length > 0) {
        console.log(`   └─ ${m.nombre}: ${bloques.length}`);
      }
    } catch (e) {
      if (!e.message.includes('Timeout') && !e.message.includes('ERR_ABORTED')) {
        console.error(`   └─ Error ${m.nombre}:`, e.message);
      }
    }
  }

  // 5) Deduplicar
  const unicos = dedup(resultado, f => `${f.nombre}|${f.municipio}`);
  console.log(
    `✅ BIZKAIA: ${unicos.length} farmacias únicas ` +
    `(descartadas ${resultado.length - unicos.length} duplicadas)`
  );
  return unicos;
}


/* ═══════════════════════════════════════════════════════════════ *
 *  MAIN                                                          *
 * ═══════════════════════════════════════════════════════════════ */

(async () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SCRAPER GUARDIAS v3 — GitHub Actions            ║');
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
