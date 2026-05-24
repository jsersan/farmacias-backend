// providers/alava/scraper.js
const puppeteer = require('puppeteer');

const URL = 'https://cofalava.org/farmacias-de-guardia/';

/**
 * Scraper para farmacias de guardia de Álava
 */
async function scrapeFarmaciasAlava() {
  console.log('🔍 [Scraper Álava] Iniciando navegador...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    console.log('✅ [Scraper Álava] Navegador iniciado');
    
    console.log(`🌐 [Scraper Álava] Navegando a ${URL}`);
    await page.goto(URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    console.log('⏳ [Scraper Álava] Esperando carga de contenido...');

    // Esperar a que aparezcan las farmacias
    const selectors = [
      '.farmacia',
      '.pharmacy',
      'article',
      '[class*="guardia"]',
      '.entry-content table tr'
    ];

    let selectedSelector = null;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        selectedSelector = selector;
        console.log(`✅ [Scraper Álava] Selector encontrado: ${selector}`);
        break;
      } catch (error) {
        console.log(`⚠️  [Scraper Álava] Selector ${selector} no encontrado`);
      }
    }

    if (!selectedSelector) {
      throw new Error('No se encontró ningún selector válido para farmacias');
    }

    // Extraer datos
    console.log('📊 [Scraper Álava] Extrayendo datos...');
    const farmacias = await page.evaluate((selector) => {
      const elementos = document.querySelectorAll(selector);
      const results = [];

      elementos.forEach(el => {
        try {
          const nombre = 
            el.querySelector('.nombre')?.textContent?.trim() ||
            el.querySelector('h3')?.textContent?.trim() ||
            el.querySelector('h2')?.textContent?.trim() ||
            el.querySelector('td:first-child')?.textContent?.trim() ||
            '';

          const direccion = 
            el.querySelector('.direccion')?.textContent?.trim() ||
            el.querySelector('td:nth-child(2)')?.textContent?.trim() ||
            '';

          const telefono = 
            el.querySelector('.telefono')?.textContent?.trim() ||
            el.querySelector('td:nth-child(3)')?.textContent?.trim() ||
            '';

          const municipio = 
            el.querySelector('.municipio')?.textContent?.trim() ||
            el.querySelector('.localidad')?.textContent?.trim() ||
            '';

          if (nombre && nombre.length > 3) {
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

    console.log(`✅ [Scraper Álava] ${farmacias.length} farmacias extraídas`);
    
    await browser.close();
    return farmacias;

  } catch (error) {
    console.error('❌ [Scraper Álava] Error:', error.message);
    await browser.close();
    throw error;
  }
}

module.exports = { scrapeFarmaciasAlava };
