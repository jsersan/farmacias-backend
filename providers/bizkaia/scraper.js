// providers/bizkaia/scraper.js
const puppeteer = require('puppeteer');

const URL = 'https://www.cofbizkaia.eus/farmacia_de_guardia/';

/**
 * Scraper para farmacias de guardia de Bizkaia
 * Web con formulario de filtros
 */
async function scrapeFarmaciasBizkaia() {
  console.log('🔍 [Scraper Bizkaia] Iniciando navegador...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    console.log('✅ [Scraper Bizkaia] Navegador iniciado');
    
    console.log(`🌐 [Scraper Bizkaia] Navegando a ${URL}`);
    await page.goto(URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    console.log('⏳ [Scraper Bizkaia] Esperando carga de contenido...');

    // Esperar a que aparezcan las farmacias
    const selectors = [
      '.farmacia',
      '.pharmacy',
      'article.farmacia',
      '[class*="guardia"]'
    ];

    let selectedSelector = null;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        selectedSelector = selector;
        console.log(`✅ [Scraper Bizkaia] Selector encontrado: ${selector}`);
        break;
      } catch (error) {
        console.log(`⚠️  [Scraper Bizkaia] Selector ${selector} no encontrado`);
      }
    }

    if (!selectedSelector) {
      throw new Error('No se encontró ningún selector válido para farmacias');
    }

    // Extraer datos
    console.log('📊 [Scraper Bizkaia] Extrayendo datos...');
    const farmacias = await page.evaluate((selector) => {
      const elementos = document.querySelectorAll(selector);
      const results = [];

      elementos.forEach(el => {
        try {
          const nombre = 
            el.querySelector('.nombre')?.textContent?.trim() ||
            el.querySelector('h3')?.textContent?.trim() ||
            el.querySelector('h2')?.textContent?.trim() ||
            el.querySelector('.title')?.textContent?.trim() ||
            '';

          const direccion = 
            el.querySelector('.direccion')?.textContent?.trim() ||
            el.querySelector('.address')?.textContent?.trim() ||
            '';

          const telefono = 
            el.querySelector('.telefono')?.textContent?.trim() ||
            el.querySelector('.phone')?.textContent?.trim() ||
            '';

          const municipio = 
            el.querySelector('.municipio')?.textContent?.trim() ||
            el.querySelector('.localidad')?.textContent?.trim() ||
            el.querySelector('.location')?.textContent?.trim() ||
            '';

          if (nombre) {
            results.push({
              nombre,
              direccion,
              telefono,
              municipio,
              tipoGuardia: 'diurna'
            });
          }
        } catch (error) {
          console.error('Error extrayendo farmacia:', error);
        }
      });

      return results;
    }, selectedSelector);

    console.log(`✅ [Scraper Bizkaia] ${farmacias.length} farmacias extraídas`);
    
    await browser.close();
    return farmacias;

  } catch (error) {
    console.error('❌ [Scraper Bizkaia] Error:', error.message);
    await browser.close();
    throw error;
  }
}

module.exports = { scrapeFarmaciasBizkaia };
