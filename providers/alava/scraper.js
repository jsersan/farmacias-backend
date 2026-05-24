// providers/alava/scraper.js - VERSIÓN CORREGIDA FINAL
const puppeteer = require('puppeteer');

const URL = 'https://cofalava.org/farmacias-de-guardia/';

/**
 * Scraper para farmacias de guardia de Álava
 * Extrae datos del plugin WP Google Maps Pro
 */
async function scrapeFarmaciasAlava() {
  console.log('🟢 ÁLAVA: Iniciando scraper (versión mapa Google)...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    
    console.log('🟢 ÁLAVA: Navegando...');
    await page.goto(URL, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // Aceptar cookies
    console.log('🟢 ÁLAVA: Buscando botón de cookies...');
    try {
      await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 3000 });
      await page.click('[aria-label="Aceptar todo"]');
      console.log('🟢 ÁLAVA: Cookies aceptadas');
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('🟢 ÁLAVA: Sin banner de cookies');
    }

    // CLAVE: Esperar a que cargue el mapa de Google
    console.log('🟢 ÁLAVA: Esperando a que cargue el mapa de Google...');
    await page.waitForSelector('.wpgmp_locations', { timeout: 30000 });
    await page.waitForTimeout(3000); // Esperar a que se rendericen todas

    console.log('🟢 ÁLAVA: Extrayendo farmacias del mapa...');

    const farmacias = await page.evaluate(() => {
      const results = [];
      
      // Extraer de los elementos del mapa
      const elementos = document.querySelectorAll('.wpgmp_locations');
      
      elementos.forEach(el => {
        try {
          // Dentro de cada .wpgmp_locations hay información de la farmacia
          const textoCompleto = el.textContent.trim();
          
          // Buscar elementos específicos dentro
          const titulo = el.querySelector('.place_title, h3, h4, strong, .location_name');
          const direccionEl = el.querySelector('.location_address, .address');
          const telefonoEl = el.querySelector('.location_phone, .phone');
          
          let nombre = titulo ? titulo.textContent.trim() : '';
          let direccion = direccionEl ? direccionEl.textContent.trim() : '';
          let telefono = telefonoEl ? telefonoEl.textContent.trim() : '';
          
          // Si no encontró con selectores, extraer del texto
          if (!nombre) {
            // El nombre suele ser la primera línea o el texto más destacado
            const lineas = textoCompleto.split('\n').filter(l => l.trim().length > 0);
            nombre = lineas[0] || '';
          }
          
          // Extraer teléfono si no se encontró
          if (!telefono) {
            const telMatch = textoCompleto.match(/\d{9}/);
            telefono = telMatch ? telMatch[0] : '';
          }
          
          // Extraer municipio de la clase (ej: "wpgmp_locations vitoria-gasteiz")
          let municipio = '';
          const clases = el.className.split(' ');
          for (const clase of clases) {
            if (clase !== 'wpgmp_locations') {
              // Convertir "vitoria-gasteiz" a "Vitoria Gasteiz"
              municipio = clase
                .split('-')
                .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
                .join(' ');
              break;
            }
          }
          
          if (nombre && nombre.length > 3) {
            results.push({
              nombre: nombre.replace(/\s+/g, ' ').trim(),
              direccion: direccion.replace(/\s+/g, ' ').trim(),
              telefono: telefono.replace(/[^\d]/g, ''),
              municipio: municipio || 'Álava',
              tipoGuardia: 'diurna'
            });
          }
        } catch (error) {
          console.error('Error procesando elemento:', error);
        }
      });

      return results;
    });

    console.log(`✅ ÁLAVA: ${farmacias.length} farmacias extraídas`);
    
    // Si no encontró nada, guardar screenshot para debugging
    if (farmacias.length === 0) {
      await page.screenshot({ 
        path: '/home/claude/alava-debug.png', 
        fullPage: true 
      });
      console.log('📸 ÁLAVA: Screenshot guardado en alava-debug.png');
    }
    
    await browser.close();
    return farmacias;

  } catch (error) {
    console.error(`❌ ÁLAVA ERROR: ${error.message}`);
    await browser.close();
    return [];
  }
}

module.exports = { scrapeFarmaciasAlava };