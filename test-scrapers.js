#!/usr/bin/env node
/**
 * Test independiente de scrapers - NO depende de archivos externos
 * Copiar y ejecutar: node test-scrapers-standalone.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

// ============================================================
// SCRAPER ÁLAVA
// ============================================================
async function scrapeFarmaciasAlava() {
  console.log('\n🟢 ÁLAVA: Iniciando...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    
    console.log('🟢 ÁLAVA: Navegando a cofalava.org...');
    await page.goto('https://cofalava.org/farmacias-de-guardia/', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    // Aceptar cookies
    try {
      await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 3000 });
      await page.click('[aria-label="Aceptar todo"]');
      console.log('🟢 ÁLAVA: Cookies aceptadas');
      await page.waitForTimeout(2000);
    } catch (e) {}

    await page.waitForTimeout(5000);
    console.log('🟢 ÁLAVA: Extrayendo farmacias...');

    const farmacias = await page.evaluate(() => {
      const results = [];
      const selectors = ['.farmacia', '.pharmacy', 'article', '[class*="farmacia"]'];
      
      let elementos = [];
      for (const sel of selectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          elementos = Array.from(found);
          break;
        }
      }

      if (elementos.length === 0) {
        const tables = document.querySelectorAll('table tr');
        if (tables.length > 1) elementos = Array.from(tables).slice(1);
      }

      if (elementos.length === 0) {
        const divs = document.querySelectorAll('p, div');
        elementos = Array.from(divs).filter(el => 
          el.textContent.includes('FARMACIA') && 
          el.textContent.length > 20 && 
          el.textContent.length < 500
        );
      }

      elementos.forEach(el => {
        const text = el.textContent.trim();
        let nombre = '';
        
        if (el.tagName === 'TR') {
          nombre = el.querySelectorAll('td')[0]?.textContent?.trim() || '';
        } else {
          nombre = el.querySelector('h2, h3, strong')?.textContent?.trim() || '';
          if (!nombre && text.includes('FARMACIA')) {
            const lines = text.split('\n').filter(l => l.trim());
            nombre = lines[0] || '';
          }
        }

        if (nombre && nombre.length > 3) {
          results.push({
            nombre: nombre.replace(/\s+/g, ' ').trim(),
            direccion: '',
            telefono: (text.match(/\d{9}/) || [''])[0],
            municipio: 'Álava'
          });
        }
      });

      return results;
    });

    console.log(`✅ ÁLAVA: ${farmacias.length} farmacias encontradas`);
    await browser.close();
    return farmacias;

  } catch (error) {
    console.error(`❌ ÁLAVA ERROR: ${error.message}`);
    await browser.close();
    return [];
  }
}

// ============================================================
// SCRAPER BIZKAIA
// ============================================================
async function scrapeFarmaciasBizkaia() {
  console.log('\n🔴 BIZKAIA: Iniciando...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();

    // Bloquear recursos pesados
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultTimeout(120000);
    
    console.log('🔴 BIZKAIA: Navegando (puede tardar 60s)...');
    await page.goto('https://www.cofbizkaia.eus/farmacia_de_guardia/', { 
      waitUntil: 'domcontentloaded',
      timeout: 120000 
    });

    console.log('🔴 BIZKAIA: Esperando contenido...');
    await page.waitForTimeout(8000);
    console.log('🔴 BIZKAIA: Extrayendo farmacias...');

    const farmacias = await page.evaluate(() => {
      const results = [];
      const selectors = [
        '.farmacia_de_guardia', '.farmacia-guardia', 
        'article.farmacia', '[class*="farmacia"]'
      ];

      let elementos = [];
      for (const sel of selectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          elementos = Array.from(found);
          break;
        }
      }

      if (elementos.length === 0) {
        const tables = document.querySelectorAll('table tbody tr');
        if (tables.length > 1) elementos = Array.from(tables);
      }

      if (elementos.length === 0) {
        const divs = document.querySelectorAll('div, article');
        elementos = Array.from(divs).filter(el => {
          const text = el.textContent;
          return text.includes('FARMACIA') && 
                 text.length > 30 && 
                 text.length < 800 &&
                 el.children.length < 10;
        });
      }

      elementos.forEach(el => {
        const text = el.textContent.trim();
        let nombre = '';

        if (el.tagName === 'TR') {
          nombre = el.querySelectorAll('td')[0]?.textContent?.trim() || '';
        } else {
          nombre = el.querySelector('h2, h3, strong')?.textContent?.trim() || '';
          if (!nombre && text.includes('FARMACIA')) {
            const lines = text.split('\n').filter(l => l.trim());
            for (const line of lines) {
              if (line.includes('FARMACIA') && line.length < 100) {
                nombre = line;
                break;
              }
            }
          }
        }

        if (nombre && nombre.length > 3 && nombre !== 'FARMACIA') {
          results.push({
            nombre: nombre.replace(/\s+/g, ' ').trim(),
            direccion: '',
            telefono: (text.match(/\d{9}/) || [''])[0],
            municipio: 'Bizkaia'
          });
        }
      });

      return results.filter((item, index, self) =>
        index === self.findIndex(t => t.nombre === item.nombre)
      );
    });

    console.log(`✅ BIZKAIA: ${farmacias.length} farmacias encontradas`);
    await browser.close();
    return farmacias;

  } catch (error) {
    console.error(`❌ BIZKAIA ERROR: ${error.message}`);
    await browser.close();
    return [];
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  🧪 TEST SCRAPERS STANDALONE                      ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const [alava, bizkaia] = await Promise.all([
    scrapeFarmaciasAlava(),
    scrapeFarmaciasBizkaia()
  ]);

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  📊 RESUMEN                                       ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`\n   🟢 ÁLAVA: ${alava.length} farmacias`);
  console.log(`   🔴 BIZKAIA: ${bizkaia.length} farmacias`);
  console.log(`   📦 TOTAL: ${alava.length + bizkaia.length} farmacias\n`);

  const data = { alava, bizkaia };
  fs.writeFileSync('./test-standalone.json', JSON.stringify(data, null, 2));
  console.log('✅ Guardado en ./test-standalone.json\n');
}

main().catch(console.error);