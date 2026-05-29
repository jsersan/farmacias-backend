// backend/scraper-runner.js
const puppeteer = require('puppeteer');
const fs        = require('fs');

const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '30000');

function fechaHoy() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
}

async function scrapeGipuzkoa(page) {
  console.log('\n🔵 GIPUZKOA: navegando...');
  const fecha = fechaHoy();

  await page.goto(
    'https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/',
    { waitUntil: 'networkidle2', timeout: TIMEOUT }
  );

  try {
    await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 4000 });
    await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
    await page.waitForTimeout(1000);
  } catch (_) {}

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
          const r = await fetch('https://cofgipuzkoa.pretools.net/buscarFarmaciasGuardia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ municipio: mId, fecha: mFecha, festivos: [] })
          });
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

      if (farmacias.length > 0) {
        console.log(`   └─ ${m.nombre}: ${farmacias.length}`);
        resultado.push(...farmacias);
      }
      await page.waitForTimeout(150);
    } catch (e) {
      console.error(`   └─ Error ${m.nombre}:`, e.message);
    }
  }

  console.log(`✅ GIPUZKOA: ${resultado.length} farmacias`);
  return resultado;
}

async function scrapeAlava(page) {
  console.log('\n🟢 ÁLAVA: navegando...');

  await page.goto('https://cofalava.org/farmacias-de-guardia/', {
    waitUntil: 'networkidle2', timeout: TIMEOUT
  });

  try {
    await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 4000 });
    await page.click('[aria-label="Aceptar todo"]');
    await page.waitForTimeout(2000);
  } catch (_) {}

  try {
    await page.waitForSelector('.wpgmp_locations, .place_title, table tr td', { timeout: 20000 });
  } catch (_) {
    console.log('🟢 ÁLAVA: Sin selector estándar...');
  }

  await page.waitForTimeout(3000);

  const farmacias = await page.evaluate(() => {
    const results = [];

    document.querySelectorAll('.wpgmp_locations').forEach(item => {
      const nombreEl = item.querySelector('.place_title');
      if (!nombreEl) return;
      const tds = item.querySelectorAll('.ft-td');
      results.push({
        nombre:    nombreEl.textContent.trim(),
        direccion: tds[1] ? tds[1].textContent.replace(/\s+/g,' ').replace(/Cómo ir/g,'').trim() : '',
        municipio: tds[2] ? tds[2].textContent.trim() : '',
        telefono:  tds[3] ? tds[3].textContent.replace(/\D/g,'') : '',
        provincia: 'ARABA'
      });
    });
    if (results.length > 0) return results;

    document.querySelectorAll('table tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const nombre = cells[0].textContent.trim();
        if (nombre.length > 3 && nombre.match(/farmacia/i)) {
          results.push({
            nombre,
            direccion: cells[1]?.textContent.trim() || '',
            municipio: cells[2]?.textContent.trim() || 'Álava',
            telefono:  cells[3]?.textContent.replace(/\D/g,'') || '',
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

async function scrapeBizkaia(page) {
  console.log('\n🔴 BIZKAIA: navegando...');

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','font','media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const urls = [
    'https://www.cofbizkaia.net/Sec_DF/wf_DirectorioFarmaciaGuardialst.aspx?IdMenu=52',
    'https://www.cofbizkaia.eus/farmacia_de_guardia/'
  ];

  let cargado = false;
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      cargado = true;
      console.log(`🔴 BIZKAIA: cargado ${url}`);
      break;
    } catch (_) {}
  }

  if (!cargado) {
    console.warn('❌ BIZKAIA: no se pudo cargar ninguna URL');
    return [];
  }

  await page.waitForTimeout(4000);

  const selectores = ['#ddlMunicipio', '#ctl00_cphMainContent_ddlMunicipio', '#municipio_farmacias_guardia', 'select'];
  let selMunicipio = null;
  for (const sel of selectores) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      selMunicipio = sel;
      break;
    } catch (_) {}
  }

  if (!selMunicipio) {
    console.log('🔴 BIZKAIA: sin selector, extrayendo tabla directa...');
    const farmacias = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const nombre = cells[0].textContent.trim();
          if (nombre.length > 3 && !nombre.includes('Nombre') && !nombre.includes('Dirección')) {
            results.push({
              nombre,
              direccion: cells[1]?.textContent.trim() || '',
              municipio: cells[2]?.textContent.trim() || 'Bizkaia',
              telefono:  cells[3]?.textContent.replace(/\D/g,'') || '',
              provincia: 'BIZKAIA'
            });
          }
        }
      });
      return results;
    });
    console.log(`✅ BIZKAIA: ${farmacias.length} farmacias (tabla directa)`);
    return farmacias;
  }

  const municipios = await page.evaluate(sel => {
    const select = document.querySelector(sel);
    if (!select) return [];
    return Array.from(select.options)
      .filter(o => o.value && o.value !== '' && o.value !== '0')
      .map(o => ({ id: o.value, nombre: o.text }));
  }, selMunicipio);

  console.log(`🔴 BIZKAIA: ${municipios.length} municipios`);
  const resultado = [];

  for (const m of municipios) {
    try {
      await page.select(selMunicipio, m.id);
      await page.waitForTimeout(1200);

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
        console.log(`   └─ ${m.nombre}: ${farmacias.length}`);
        resultado.push(...farmacias);
      }
    } catch (e) {
      console.error(`   └─ Error ${m.nombre}:`, e.message);
    }
  }

  const vistos = new Set();
  const deduplicado = resultado.filter(f => {
    const key = `${f.nombre}|${f.municipio}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });

  console.log(`✅ BIZKAIA: ${deduplicado.length} farmacias`);
  return deduplicado;
}

(async () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SCRAPER GUARDIAS - GitHub Actions               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Fecha: ${fechaHoy()}  |  ${new Date().toISOString()}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const errores = [];

  async function runScraper(nombre, fn) {
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    try {
      const result = await fn(page);
      await page.close();
      return result;
    } catch (e) {
      errores.push(`${nombre}: ${e.message}`);
      console.error(`❌ ${nombre} ERROR:`, e.message);
      await page.close().catch(() => {});
      return [];
    }
  }

  const gipuzkoa = await runScraper('Gipuzkoa', scrapeGipuzkoa);
  const alava    = await runScraper('Álava',    scrapeAlava);
  const bizkaia  = await runScraper('Bizkaia',  scrapeBizkaia);

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

  console.log('\n📊 RESUMEN FINAL:');
  console.log(`   🔵 Gipuzkoa: ${gipuzkoa.length}`);
  console.log(`   🟢 Álava:    ${alava.length}`);
  console.log(`   🔴 Bizkaia:  ${bizkaia.length}`);
  console.log(`   📦 Total:    ${output.total}`);
  if (errores.length) console.log(`   ⚠️  Errores: ${errores.join(' | ')}`);

  fs.writeFileSync('guardias-output.json', JSON.stringify(output, null, 2));
  console.log('\n✅ guardias-output.json generado correctamente');
  process.exit(0);
})();
