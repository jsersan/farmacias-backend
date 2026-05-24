// providers/gipuzkoa/scraper.js
const puppeteer = require('puppeteer');

const URL = 'https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/';

/**
 * Scraper para farmacias de guardia de Gipuzkoa  
 * VERSIÓN MEJORADA con múltiples estrategias
 */
async function scrapeFarmaciasGipuzkoa() {
  console.log('🔍 [Scraper Gipuzkoa] Iniciando navegador...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    console.log('✅ [Scraper Gipuzkoa] Navegador iniciado');
    
    console.log(`🌐 [Scraper Gipuzkoa] Navegando a ${URL}`);
    await page.goto(URL, { 
      waitUntil: 'networkidle0',  // Esperar a que NO haya actividad de red
      timeout: 60000 
    });

    // Esperar a que desaparezca "Cargando..."
    console.log('⏳ [Scraper Gipuzkoa] Esperando carga de contenido...');
    try {
      await page.waitForFunction(
        () => !document.body.textContent.includes('Cargando...'),
        { timeout: 30000 }
      );
      console.log('✅ [Scraper Gipuzkoa] Contenido cargado');
    } catch (error) {
      console.log('⚠️  [Scraper Gipuzkoa] Timeout esperando desaparición de "Cargando..."');
    }

    // Intentar múltiples estrategias de extracción
    console.log('📊 [Scraper Gipuzkoa] Intentando extraer datos...');
    
    // ESTRATEGIA 1: Buscar por secciones de guardias
    let farmacias = await page.evaluate(() => {
      const results = [];
      
      // Buscar secciones con encabezados de tipo de guardia
      const headers = [
        'Farmacias de día',
        'Farmacias de Refuerzo día',
        'Farmacias de noche',
        'Farmacias de Refuerzo noche',
        'Farmacias voluntarias'
      ];
      
      headers.forEach(headerText => {
        // Buscar el encabezado
        const allH2 = document.querySelectorAll('h2, h3, h4');
        let tipoGuardia = 'diurna';
        
        if (headerText.toLowerCase().includes('noche')) {
          tipoGuardia = 'nocturna';
        } else if (headerText.toLowerCase().includes('refuerzo')) {
          tipoGuardia = 'refuerzo';
        } else if (headerText.toLowerCase().includes('voluntaria')) {
          tipoGuardia = 'voluntaria';
        }
        
        allH2.forEach(h2 => {
          if (h2.textContent.includes(headerText)) {
            // Buscar farmacias después de este header
            let nextElement = h2.nextElementSibling;
            
            while (nextElement && nextElement.tagName !== 'H2' && nextElement.tagName !== 'H3') {
              // Buscar divs, artículos, o elementos que contengan farmacias
              const farmElements = nextElement.querySelectorAll('div, article, p, li');
              
              farmElements.forEach(el => {
                const text = el.textContent.trim();
                
                // Si el texto tiene al menos 10 caracteres y contiene "FARMACIA" o un teléfono
                if (text.length > 10 && (text.includes('FARMACIA') || text.match(/\d{9}/))) {
                  results.push({
                    nombre: text.split('\n')[0] || text.substring(0, 50),
                    direccion: '',
                    telefono: (text.match(/\d{9}/) || [''])[0],
                    municipio: '',
                    tipoGuardia: tipoGuardia,
                    rawText: text
                  });
                }
              });
              
              nextElement = nextElement.nextElementSibling;
            }
          }
        });
      });
      
      return results;
    });

    // Si no encontró nada, intentar ESTRATEGIA 2: Todo el contenido
    if (farmacias.length === 0) {
      console.log('⚠️  [Scraper Gipuzkoa] Estrategia 1 falló, intentando estrategia 2...');
      
      farmacias = await page.evaluate(() => {
        const results = [];
        const allText = document.body.textContent;
        
        // Buscar patrones como "FARMACIA NOMBRE - MUNICIPIO"
        const lines = allText.split('\n');
        
        lines.forEach(line => {
          line = line.trim();
          if (line.includes('FARMACIA') && line.length > 10 && line.length < 200) {
            results.push({
              nombre: line,
              direccion: '',
              telefono: (line.match(/\d{9}/) || [''])[0],
              municipio: '',
              tipoGuardia: 'diurna',
              rawText: line
            });
          }
        });
        
        return results;
      });
    }

    console.log(`✅ [Scraper Gipuzkoa] ${farmacias.length} farmacias extraídas`);
    
    if (farmacias.length === 0) {
      // Guardar screenshot para debugging
      await page.screenshot({ path: '/home/claude/gipuzkoa-debug.png', fullPage: true });
      console.log('📸 [Scraper Gipuzkoa] Screenshot guardado en gipuzkoa-debug.png');
      
      // Imprimir estructura HTML para debugging
      const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
      console.log('📄 [Scraper Gipuzkoa] HTML (primeros 1000 chars):', bodyHTML);
    }
    
    await browser.close();
    return farmacias;

  } catch (error) {
    console.error('❌ [Scraper Gipuzkoa] Error:', error.message);
    await browser.close();
    throw error;
  }
}

module.exports = { scrapeFarmaciasGipuzkoa };