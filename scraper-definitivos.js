// =====================================================================
// SCRAPERS DEFINITIVOS v3 - FINAL FUNCIONAL
// =====================================================================

const puppeteer = require('puppeteer');
const fs = require('fs');

// =====================================================================
// SCRAPER ÁLAVA - CON ACEPTACIÓN DE COOKIES
// =====================================================================
async function scrapeAlava() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  console.log('🟢 ÁLAVA: Navegando...');
  await page.goto('https://cofalava.org/farmacias/', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // ACEPTAR COOKIES
  try {
    console.log('🟢 ÁLAVA: Buscando botón de cookies...');
    const cookieButtons = [
      'button:has-text("Aceptar todo")',
      'button:has-text("Aceptar")',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '.cookie-accept',
      '[aria-label="Aceptar todo"]'
    ];
    
    for (const selector of cookieButtons) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          console.log(`🟢 ÁLAVA: Cookies aceptadas con: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    
    // Buscar y hacer clic en cualquier botón visible que contenga "Aceptar"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const aceptarBtn = buttons.find(btn => 
        btn.textContent.includes('Aceptar') || 
        btn.textContent.includes('Accept')
      );
      if (aceptarBtn) aceptarBtn.click();
    });
    
    await page.waitForTimeout(3000);
    
  } catch (e) {
    console.log('🟢 ÁLAVA: No se encontró diálogo de cookies o ya aceptadas');
  }
  
  // Esperar a que cargue el contenido
  await page.waitForTimeout(5000);
  
  console.log('🟢 ÁLAVA: Buscando farmacias...');
  
  // Esperar a que aparezcan las farmacias
  await page.waitForSelector('.wpgmp_locations, .place_title, .location_listing3', { timeout: 30000 });
  
  const farmacias = await page.evaluate(() => {
    const results = [];
    const items = document.querySelectorAll('.wpgmp_locations');
    
    items.forEach(item => {
      try {
        const nombreEl = item.querySelector('.place_title');
        if (!nombreEl) return;
        
        const nombre = nombreEl.textContent.trim();
        const ftTds = item.querySelectorAll('.ft-td');
        
        const direccion = ftTds[1] ? ftTds[1].textContent.replace(/\s+/g, ' ').replace(/Cómo ir/g, '').trim() : '';
        const poblacion = ftTds[2] ? ftTds[2].textContent.trim() : '';
        const telefono = ftTds[3] ? ftTds[3].textContent.trim() : '';
        const horario = ftTds[4] ? ftTds[4].textContent.trim() : '';
        
        if (nombre && nombre.length > 3) {
          results.push({
            nombre,
            direccion,
            poblacion,
            telefono,
            horario,
            provincia: 'Álava'
          });
        }
      } catch (err) {}
    });
    
    return results;
  });

  await browser.close();
  
  console.log(`✅ ÁLAVA: ${farmacias.length} farmacias extraídas`);
  return farmacias;
}

// =====================================================================
// SCRAPER GIPUZKOA - SIN CAMBIOS (FUNCIONA PERFECTAMENTE)
// =====================================================================
async function scrapeGipuzkoa() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  console.log('🔵 GIPUZKOA: Navegando...');
  await page.goto('https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  try {
    await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 3000 });
    await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
    await page.waitForTimeout(1000);
  } catch (e) {}

  await page.waitForSelector('#municipio', { timeout: 10000 });
  
  console.log('🔵 GIPUZKOA: Obteniendo municipios...');
  
  const municipios = await page.evaluate(() => {
    const select = document.getElementById('municipio');
    const opciones = Array.from(select.options);
    return opciones
      .filter(opt => opt.value && opt.value !== '')
      .map(opt => ({
        id: opt.value,
        nombre: opt.text
      }));
  });

  console.log(`🔵 GIPUZKOA: ${municipios.length} municipios encontrados`);
  
  const todasLasFarmacias = [];
  const municipiosAUsar = municipios.slice(0, 20);
  
  for (const municipio of municipiosAUsar) {
    try {
      console.log(`🔵 GIPUZKOA: Buscando en ${municipio.nombre}...`);
      
      await page.select('#municipio', municipio.id);
      await page.waitForTimeout(500);
      
      const fecha = await page.evaluate(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      });
      
      const farmacias = await page.evaluate(async (municipioId, fecha) => {
        try {
          const response = await fetch('https://cofgipuzkoa.pretools.net/buscarFarmaciasGuardia', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              municipio: municipioId,
              fecha: fecha,
              festivos: []
            }),
          });
          
          const data = await response.json();
          return data.map(f => ({
            nombre: f.nombre || '',
            direccion: f.direccion || '',
            poblacion: f.poblacion || '',
            telefono: f.telefono || '',
            horario: '',
            provincia: 'Gipuzkoa'
          }));
        } catch (err) {
          return [];
        }
      }, municipio.id, fecha);
      
      console.log(`   └─ ${farmacias.length} farmacias encontradas`);
      todasLasFarmacias.push(...farmacias);
      
      await page.waitForTimeout(500);
      
    } catch (err) {
      console.error(`❌ Error en ${municipio.nombre}:`, err.message);
    }
  }

  await browser.close();
  
  console.log(`✅ GIPUZKOA: ${todasLasFarmacias.length} farmacias extraídas`);
  return todasLasFarmacias;
}

// =====================================================================
// SCRAPER BIZKAIA - URL CORREGIDA
// =====================================================================
async function scrapeBizkaia() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  console.log('🔴 BIZKAIA: Navegando...');
  
  // URL CORRECTA del Colegio Oficial de Farmacéuticos de Bizkaia
  await page.goto('https://www.cofbizkaia.net/Sec_DF/wf_DirectorioFarmaciaGuardialst.aspx?IdMenu=52', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForTimeout(5000);
  
  console.log('🔴 BIZKAIA: Buscando selector de municipios...');
  
  // Buscar el select de municipios
  const selectores = ['#ddlMunicipio', '#ctl00_cphMainContent_ddlMunicipio', 'select'];
  let selectorEncontrado = null;
  
  for (const selector of selectores) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      selectorEncontrado = selector;
      console.log(`🔴 BIZKAIA: Selector encontrado: ${selector}`);
      break;
    } catch (e) {}
  }
  
  if (!selectorEncontrado) {
    console.log('🔴 BIZKAIA: No se encontró selector de municipios');
    
    // Intentar scraping directo de la tabla visible
    const farmacias = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tr, .farmacia-item, .GridViewStyle tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const nombre = cells[0]?.textContent.trim();
          const direccion = cells[1]?.textContent.trim();
          const poblacion = cells[2]?.textContent.trim();
          
          if (nombre && nombre.length > 3) {
            results.push({
              nombre,
              direccion: direccion || '',
              poblacion: poblacion || '',
              telefono: '',
              horario: '',
              provincia: 'Bizkaia'
            });
          }
        }
      });
      
      return results;
    });
    
    await browser.close();
    console.log(`✅ BIZKAIA: ${farmacias.length} farmacias extraídas (scraping directo)`);
    return farmacias;
  }

  const municipios = await page.evaluate((selector) => {
    const select = document.querySelector(selector);
    if (!select) return [];
    
    const opciones = Array.from(select.options);
    return opciones
      .filter(opt => opt.value && opt.value !== '' && opt.value !== '0')
      .map(opt => ({
        id: opt.value,
        nombre: opt.text
      }));
  }, selectorEncontrado);

  console.log(`🔴 BIZKAIA: ${municipios.length} municipios encontrados`);
  
  const todasLasFarmacias = [];
  const municipiosAUsar = municipios.slice(0, 10);
  
  for (const municipio of municipiosAUsar) {
    try {
      console.log(`🔴 BIZKAIA: Buscando en ${municipio.nombre}...`);
      
      await page.select(selectorEncontrado, municipio.id);
      await page.waitForTimeout(2000);
      
      const farmacias = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('table tr, .GridViewStyle tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const nombre = cells[0]?.textContent.trim();
            const direccion = cells[1]?.textContent.trim();
            
            if (nombre && nombre.length > 3 && !nombre.includes('Dirección')) {
              results.push({
                nombre,
                direccion: direccion || '',
                poblacion: '',
                telefono: '',
                horario: '',
                provincia: 'Bizkaia'
              });
            }
          }
        });
        
        return results;
      });
      
      console.log(`   └─ ${farmacias.length} farmacias encontradas`);
      todasLasFarmacias.push(...farmacias);
      
      await page.waitForTimeout(500);
      
    } catch (err) {
      console.error(`❌ Error en ${municipio.nombre}:`, err.message);
    }
  }

  await browser.close();
  
  console.log(`✅ BIZKAIA: ${todasLasFarmacias.length} farmacias extraídas`);
  return todasLasFarmacias;
}

// =====================================================================
// FUNCIÓN PRINCIPAL
// =====================================================================
async function main() {
  console.log('🚀 INICIANDO SCRAPING DE LAS 3 PROVINCIAS...\n');
  
  let alava = [];
  let gipuzkoa = [];
  let bizkaia = [];
  
  // ÁLAVA
  try {
    alava = await scrapeAlava();
  } catch (error) {
    console.error('❌ ERROR EN ÁLAVA:', error.message);
  }
  
  // GIPUZKOA
  try {
    gipuzkoa = await scrapeGipuzkoa();
  } catch (error) {
    console.error('❌ ERROR EN GIPUZKOA:', error.message);
  }
  
  // BIZKAIA
  try {
    bizkaia = await scrapeBizkaia();
  } catch (error) {
    console.error('❌ ERROR EN BIZKAIA:', error.message);
  }
  
  const total = alava.length + gipuzkoa.length + bizkaia.length;
    
  console.log('\n📊 RESUMEN FINAL:');
  console.log(`   🟢 ÁLAVA: ${alava.length} farmacias`);
  console.log(`   🔵 GIPUZKOA: ${gipuzkoa.length} farmacias`);
  console.log(`   🔴 BIZKAIA: ${bizkaia.length} farmacias`);
  console.log(`   📦 TOTAL: ${total} farmacias`);
  
  const resultado = {
    alava,
    gipuzkoa,
    bizkaia,
    total,
    fecha: new Date().toISOString()
  };
  
  fs.writeFileSync('./farmacias-euskadi.json', JSON.stringify(resultado, null, 2));
  console.log('\n✅ Datos guardados en ./farmacias-euskadi.json');
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { scrapeAlava, scrapeGipuzkoa, scrapeBizkaia };