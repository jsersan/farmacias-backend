// analizar-html.js - Guardar HTML de las páginas para análisis
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function analizarPaginas() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // === ÁLAVA ===
    console.log('\n🟢 ANALIZANDO ÁLAVA...');
    await page.goto('https://cofalava.org/farmacias-de-guardia/', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    await page.waitForTimeout(5000);
    
    const htmlAlava = await page.content();
    await fs.writeFile('alava-completo.html', htmlAlava);
    console.log('✅ HTML guardado en: alava-completo.html');
    
    // Contar elementos útiles
    const statsAlava = await page.evaluate(() => {
      return {
        totalLinks: document.querySelectorAll('a').length,
        linksConMaps: document.querySelectorAll('a[href*="maps"]').length,
        tablas: document.querySelectorAll('table').length,
        filas: document.querySelectorAll('tr').length,
        listas: document.querySelectorAll('ul, ol').length
      };
    });
    console.log('📊 Estadísticas Álava:', statsAlava);
    
    // === GIPUZKOA ===
    console.log('\n🔵 ANALIZANDO GIPUZKOA...');
    await page.goto('https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    
    // Cerrar cookies
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.toLowerCase().includes('aceptar')) {
          btn.click();
        }
      });
    });
    await page.waitForTimeout(2000);
    
    const htmlGipuzkoa = await page.content();
    await fs.writeFile('gipuzkoa-inicial.html', htmlGipuzkoa);
    console.log('✅ HTML guardado en: gipuzkoa-inicial.html');
    
    // Obtener municipios
    const municipios = await page.evaluate(() => {
      const select = document.querySelector('select');
      if (!select) return [];
      return Array.from(select.querySelectorAll('option'))
        .filter(opt => opt.value)
        .map(opt => ({ value: opt.value, nombre: opt.textContent.trim() }));
    });
    
    console.log(`📋 ${municipios.length} municipios encontrados`);
    
    if (municipios.length > 0) {
      // Probar búsqueda con PRIMER municipio
      console.log(`🔍 Probando búsqueda: ${municipios[0].nombre}`);
      
      await page.select('select', municipios[0].value);
      await page.waitForTimeout(1000);
      
      // Click en botón BUSCAR
      await page.evaluate(() => {
        const botones = document.querySelectorAll('button');
        for (const btn of botones) {
          if (btn.textContent.includes('BUSCAR')) {
            btn.click();
            break;
          }
        }
      });
      
      // Esperar resultados
      await page.waitForTimeout(10000);
      
      const htmlGipuzkoaResultado = await page.content();
      await fs.writeFile('gipuzkoa-resultado.html', htmlGipuzkoaResultado);
      console.log('✅ HTML resultado guardado en: gipuzkoa-resultado.html');
      
      const statsGipuzkoa = await page.evaluate(() => {
        return {
          guardias: document.querySelectorAll('.guardias').length,
          guardiasContainer: document.querySelectorAll('.guardias-container').length,
          h3: document.querySelectorAll('h3').length,
          parrafos: document.querySelectorAll('p').length
        };
      });
      console.log('📊 Estadísticas Gipuzkoa después de buscar:', statsGipuzkoa);
    }
    
    // === BIZKAIA ===
    console.log('\n🔴 ANALIZANDO BIZKAIA...');
    await page.goto('https://www.cofbizkaia.eus/farmacia_de_guardia/', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    await page.waitForTimeout(3000);
    
    const htmlBizkaia = await page.content();
    await fs.writeFile('bizkaia-inicial.html', htmlBizkaia);
    console.log('✅ HTML guardado en: bizkaia-inicial.html');
    
    const municipiosBizkaia = await page.evaluate(() => {
      const select = document.querySelector('#municipio_farmacias_guardia');
      if (!select) return [];
      return Array.from(select.querySelectorAll('option'))
        .filter(opt => opt.value && opt.value !== '')
        .map(opt => ({ value: opt.value, nombre: opt.textContent.trim() }));
    });
    
    console.log(`📋 ${municipiosBizkaia.length} municipios encontrados`);
    
    if (municipiosBizkaia.length > 0) {
      console.log(`🔍 Probando búsqueda: ${municipiosBizkaia[0].nombre}`);
      
      await page.select('#municipio_farmacias_guardia', municipiosBizkaia[0].value);
      await page.waitForTimeout(1000);
      
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) {
          const submit = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submit) submit.click();
        }
      });
      
      await page.waitForTimeout(10000);
      
      const htmlBizkaiaResultado = await page.content();
      await fs.writeFile('bizkaia-resultado.html', htmlBizkaiaResultado);
      console.log('✅ HTML resultado guardado en: bizkaia-resultado.html');
      
      const statsBizkaia = await page.evaluate(() => {
        return {
          pageFarmaciasGuardia: document.querySelectorAll('.pageFarmaciasGuardia').length,
          articles: document.querySelectorAll('article').length,
          divs: document.querySelectorAll('div[class*="farmacia"]').length
        };
      });
      console.log('📊 Estadísticas Bizkaia después de buscar:', statsBizkaia);
    }
    
    console.log('\n✅ ANÁLISIS COMPLETO');
    console.log('📁 Archivos generados:');
    console.log('   - alava-completo.html');
    console.log('   - gipuzkoa-inicial.html');
    console.log('   - gipuzkoa-resultado.html');
    console.log('   - bizkaia-inicial.html');
    console.log('   - bizkaia-resultado.html');
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    await browser.close();
  }
}

analizarPaginas();