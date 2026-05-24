// providers/bizkaia/scraper.js - VERSIÓN CORREGIDA FINAL
const puppeteer = require('puppeteer');

const URL = 'https://www.cofbizkaia.eus/farmacia_de_guardia/';

/**
 * Scraper para farmacias de guardia de Bizkaia
 * Interactúa con formulario de selección de municipios
 */
async function scrapeFarmaciasBizkaia() {
  console.log('🔴 BIZKAIA: Iniciando scraper (versión formulario)...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // Bloquear imágenes para acelerar
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultTimeout(120000);
    
    console.log('🔴 BIZKAIA: Navegando...');
    await page.goto(URL, { 
      waitUntil: 'networkidle0',
      timeout: 120000 
    });

    await page.waitForTimeout(5000);

    // CLAVE: Esperar al selector de municipios
    console.log('🔴 BIZKAIA: Buscando selector de municipios...');
    await page.waitForSelector('#municipio_farmacias_guardia', { timeout: 30000 });

    // Obtener lista de municipios
    const municipios = await page.evaluate(() => {
      const select = document.querySelector('#municipio_farmacias_guardia');
      const opciones = Array.from(select.options);
      
      // Filtrar opciones vacías y la opción "Selecciona municipio"
      return opciones
        .filter(opt => opt.value && opt.value !== '0' && opt.value.trim() !== '')
        .map(opt => ({
          value: opt.value,
          text: opt.textContent.trim()
        }))
        .slice(0, 20); // Limitar a 20 municipios para no tardar demasiado
    });

    console.log(`🔴 BIZKAIA: ${municipios.length} municipios encontrados (procesando primeros 20)`);

    const todasLasFarmacias = [];

    // Iterar por cada municipio
    for (let i = 0; i < municipios.length; i++) {
      const municipio = municipios[i];
      console.log(`🔴 BIZKAIA: [${i+1}/${municipios.length}] Procesando ${municipio.text}...`);

      try {
        // Seleccionar municipio
        await page.select('#municipio_farmacias_guardia', municipio.value);
        
        // Esperar a que se carguen los resultados
        await page.waitForTimeout(2000);

        // Extraer farmacias de este municipio
        const farmacias = await page.evaluate((nombreMunicipio) => {
          const results = [];
          
          // Buscar contenedor de resultados (puede variar)
          const posiblesContenedores = [
            '#resultados_farmacias',
            '.resultado-farmacia',
            '.farmacia-item',
            '[class*="resultado"]',
            '[class*="farmacia"]'
          ];

          let elementos = [];
          for (const selector of posiblesContenedores) {
            try {
              const found = document.querySelectorAll(selector);
              if (found.length > 0) {
                elementos = Array.from(found);
                break;
              }
            } catch (e) {}
          }

          // Si no encuentra contenedor específico, buscar en todo el body
          if (elementos.length === 0) {
            const body = document.querySelector('body');
            const texto = body.textContent;
            
            // Buscar patrón "FARMACIA NOMBRE"
            const lineas = texto.split('\n');
            lineas.forEach(linea => {
              if (linea.includes('FARMACIA') && linea.length > 10 && linea.length < 200) {
                results.push({
                  nombre: linea.trim(),
                  direccion: '',
                  telefono: (linea.match(/\d{9}/) || [''])[0],
                  municipio: nombreMunicipio,
                  tipoGuardia: 'diurna'
                });
              }
            });
          } else {
            // Procesar elementos encontrados
            elementos.forEach(el => {
              const texto = el.textContent.trim();
              const nombre = el.querySelector('h3, h4, strong, .nombre')?.textContent?.trim() || 
                            texto.split('\n')[0] || '';
              
              if (nombre && nombre.length > 3) {
                results.push({
                  nombre: nombre.replace(/\s+/g, ' ').trim(),
                  direccion: '',
                  telefono: (texto.match(/\d{9}/) || [''])[0],
                  municipio: nombreMunicipio,
                  tipoGuardia: 'diurna'
                });
              }
            });
          }

          return results;
        }, municipio.text);

        if (farmacias.length > 0) {
          console.log(`   └─ ${farmacias.length} farmacias encontradas`);
          todasLasFarmacias.push(...farmacias);
        }

      } catch (error) {
        console.error(`   └─ Error: ${error.message}`);
      }
    }

    // Eliminar duplicados
    const farmaciasSinDuplicados = todasLasFarmacias.filter((item, index, self) =>
      index === self.findIndex(t => t.nombre === item.nombre && t.municipio === item.municipio)
    );

    console.log(`✅ BIZKAIA: ${farmaciasSinDuplicados.length} farmacias extraídas (sin duplicados)`);
    
    await browser.close();
    return farmaciasSinDuplicados;

  } catch (error) {
    console.error(`❌ BIZKAIA ERROR: ${error.message}`);
    await browser.close();
    return [];
  }
}

module.exports = { scrapeFarmaciasBizkaia };