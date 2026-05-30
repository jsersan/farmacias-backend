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
 *  BIZKAIA  —  v3c                                               *
 *                                                                *
 *  Intenta cofbizkaia.net (ASP.NET con tablas) primero y cae     *
 *  a cofbizkaia.eus como fallback.                               *
 *  Busca cualquier elemento del DOM que contenga "Dirección:"    *
 *  y "Teléfono:", lo extrae y lo parsea con las etiquetas.       *
 * ═══════════════════════════════════════════════════════════════ */

async function scrapeBizkaia(page) {
  console.log('\n🔴 BIZKAIA: navegando...');

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // 1) Intentar .net (ASP.NET) primero, luego .eus (WordPress)
  const sitios = [
    { url: 'https://www.cofbizkaia.net/Sec_DF/wf_DirectorioFarmaciaGuardialst.aspx?IdMenu=52', tipo: 'net' },
    { url: 'https://www.cofbizkaia.eus/farmacia_de_guardia/', tipo: 'eus' }
  ];

  let sitioTipo = null;
  for (const s of sitios) {
    try {
      await page.goto(s.url, { waitUntil: 'networkidle2', timeout: 30000 });
      sitioTipo = s.tipo;
      console.log(`🔴 BIZKAIA: cargado (${s.tipo}) ${s.url}`);
      break;
    } catch (_) {
      console.log(`🔴 BIZKAIA: falló ${s.url}`);
    }
  }
  if (!sitioTipo) { console.warn('🔴 BIZKAIA: ninguna URL disponible'); return []; }
  await delay(4000);

  // 2) Encontrar dropdown de municipios
  const posiblesDropdowns = [
    '#ddlMunicipio',
    '#ctl00_cphMainContent_ddlMunicipio',
    '#municipio_farmacias_guardia',
    'select[name*="municipio" i]',
    'select[name*="Municipio" i]'
  ];
  let dropdownSel = null;
  for (const s of posiblesDropdowns) {
    try { await page.waitForSelector(s, { timeout: 3000 }); dropdownSel = s; break; }
    catch (_) {}
  }
  if (!dropdownSel) { console.warn('🔴 BIZKAIA: dropdown no encontrado'); return []; }
  console.log(`🔴 BIZKAIA: dropdown → ${dropdownSel}`);

  // 3) Lista de municipios
  const municipios = await page.evaluate(sel => {
    const dd = document.querySelector(sel);
    if (!dd) return [];
    return Array.from(dd.options)
      .filter(o => o.value && o.value !== '' && o.value !== '0')
      .map(o => ({ id: o.value, nombre: o.textContent.trim() }));
  }, dropdownSel);
  console.log(`🔴 BIZKAIA: ${municipios.length} municipios`);

  const resultado = [];

  for (let i = 0; i < municipios.length; i++) {
    const m = municipios[i];
    try {
      // Seleccionar municipio
      await page.select(dropdownSel, m.id);

      // ASP.NET hace postback automático al cambiar el select;
      // WordPress necesita clic en submit + navegación.
      if (sitioTipo === 'eus') {
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
            page.click('#submitForm')
          ]);
        } catch (_) {}
      } else {
        // .net: esperar postback automático o manual
        try { await page.waitForNavigation({ timeout: 8000 }); }
        catch (_) {}
      }
      await delay(1500);

      // 4) Extraer — buscar CUALQUIER elemento con "Dirección:" + "Teléfono:"
      const { bloques, debug } = await page.evaluate((municipioNombre, isFirst) => {
        const bloques = [];

        // Recorrer todos los td, div, article, li, p, section
        const candidatos = document.querySelectorAll('td, div, article, li, p, section, span');
        for (const el of candidatos) {
          const t = (el.innerText || el.textContent || '');
          if (t.includes('Dirección:') && t.includes('Teléfono:') &&
              t.length > 30 && t.length < 2000 && el.children.length < 20) {
            bloques.push(t.replace(/\t+/g, ' ').trim());
          }
        }

        // Deduplicar: quedarse con los bloques más cortos (hijos, no padres)
        let unicos = bloques;
        if (bloques.length > 1) {
          bloques.sort((a, b) => a.length - b.length);
          unicos = [];
          for (const b of bloques) {
            if (!unicos.some(u => b.includes(u) && b.length > u.length + 10)) {
              unicos.push(b);
            }
          }
        }

        // Debug para el primer municipio
        let debug = '';
        if (isFirst) {
          const body = document.querySelector('#content, .farmaciasGuardia, body');
          const txt  = (body?.innerText || '').replace(/\s+/g, ' ');
          debug = `[len=${txt.length}] ${txt.substring(0, 600)}`;
        }

        return { bloques: unicos, debug };
      }, m.nombre, i === 0);

      // Log debug del primer municipio
      if (debug) console.log(`🔍 DEBUG primer municipio (${m.nombre}):\n   ${debug}\n`);

      // 5) Parsear cada bloque
      for (const raw of bloques) {
        const parsed = parseBizkaiaTexto(raw, m.nombre);
        if (parsed) resultado.push(parsed);
      }

      if (bloques.length > 0) {
        console.log(`   └─ ${m.nombre}: ${bloques.length}`);
      }
    } catch (e) {
      if (i === 0) console.error(`   └─ Error ${m.nombre}:`, e.message);
    }
  }

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
