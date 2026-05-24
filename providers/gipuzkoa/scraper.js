// providers/gipuzkoa/scraper.js
const puppeteer = require('puppeteer');

const URL = 'https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/';

async function scrapeFarmaciasGipuzkoa() {
  console.log('🔍 [Scraper Gipuzkoa] Iniciando navegador...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Interceptar peticiones para ver si hay APIs JSON
    const apiData = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.json') || url.includes('/api/') || 
          response.headers()['content-type']?.includes('application/json')) {
        try {
          const data = await response.json();
          console.log(`📡 API detectada: ${url}`);
          apiData.push(data);
        } catch (e) {}
      }
    });
    
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Cerrar cookies
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.toLowerCase().includes('aceptar')) {
          btn.click();
        }
      });
    });
    await page.waitForTimeout(3000);

    console.log('📋 [Scraper Gipuzkoa] Extrayendo farmacias de TODA la página...');
    
    // Esperar a que cargue contenido dinámico
    await page.waitForTimeout(5000);
    
    const farmacias = await page.evaluate(() => {
      const results = [];
      
      // ESTRATEGIA 1: Buscar en contenedores guardias
      const contenedores = document.querySelectorAll('.guardias-container');
      console.log(`Encontrados ${contenedores.length} contenedores`);
      
      contenedores.forEach(contenedor => {
        // Buscar TODOS los elementos que tengan texto
        const elementos = contenedor.querySelectorAll('*');
        
        elementos.forEach(el => {
          const texto = el.textContent.trim();
          
          // Si el texto parece un nombre de farmacia (tiene guion y mayúsculas)
          if (texto.match(/^[A-ZÁÉÍÓÚÑ\s]+-+[A-ZÁÉÍÓÚÑ\s]+$/i) && 
              texto.length > 10 && texto.length < 150) {
            
            const partes = texto.split('-');
            const nombre = partes[0].trim();
            const municipio = partes.length > 1 ? partes[1].trim() : '';
            
            results.push({
              nombre,
              direccion: '',
              telefono: '',
              municipio,
              tipoGuardia: 'diurna'
            });
          }
        });
      });
      
      // ESTRATEGIA 2: Si no encontró nada, buscar en TODO el body
      if (results.length === 0) {
        const todo = document.body.innerText;
        const lineas = todo.split('\n');
        
        lineas.forEach(linea => {
          linea = linea.trim();
          
          if (linea.match(/^[A-ZÁÉÍÓÚÑ\s]+-+[A-ZÁÉÍÓÚÑ\s]+$/i) && 
              linea.length > 10 && linea.length < 150 &&
              !linea.includes('Ciudadano') &&
              !linea.includes('Colegiado')) {
            
            const partes = linea.split('-');
            results.push({
              nombre: partes[0].trim(),
              direccion: '',
              telefono: '',
              municipio: partes.length > 1 ? partes[1].trim() : '',
              tipoGuardia: 'diurna'
            });
          }
        });
      }
      
      return results;
    });

    console.log(`✅ [Scraper Gipuzkoa] ${farmacias.length} farmacias extraídas`);
    
    if (apiData.length > 0) {
      console.log(`📡 Se detectaron ${apiData.length} peticiones JSON`);
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
