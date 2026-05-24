#!/usr/bin/env node
/**
 * Analiza el HTML de las webs para encontrar selectores correctos
 * node analizar-html.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function analizarAlava() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🟢 ANALIZANDO ÁLAVA                              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    console.log('Navegando a cofalava.org...');
    await page.goto('https://cofalava.org/farmacias-de-guardia/', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // Aceptar cookies
    try {
      await page.waitForSelector('[aria-label="Aceptar todo"]', { timeout: 3000 });
      await page.click('[aria-label="Aceptar todo"]');
      await page.waitForTimeout(3000);
    } catch (e) {}

    await page.waitForTimeout(5000);

    // Screenshot
    await page.screenshot({ path: './alava-screenshot.png', fullPage: true });
    console.log('✅ Screenshot guardado: alava-screenshot.png');

    // Guardar HTML completo
    const html = await page.content();
    fs.writeFileSync('./alava-full.html', html);
    console.log('✅ HTML guardado: alava-full.html');

    // Analizar contenido
    const analisis = await page.evaluate(() => {
      const info = {
        totalText: document.body.textContent,
        farmaciasEnTexto: [],
        elementosConFarmacia: [],
        tablas: [],
        mapas: []
      };

      // Buscar "FARMACIA" en todo el texto
      const texto = document.body.textContent;
      const lineas = texto.split('\n').filter(l => l.trim().length > 0);
      
      lineas.forEach(linea => {
        if (linea.toUpperCase().includes('FARMACIA') && linea.length > 10 && linea.length < 200) {
          info.farmaciasEnTexto.push(linea.trim());
        }
      });

      // Buscar elementos que contengan "FARMACIA"
      const todos = document.querySelectorAll('*');
      todos.forEach(el => {
        if (el.children.length < 5 && el.textContent.includes('FARMACIA') && el.textContent.length > 10 && el.textContent.length < 300) {
          info.elementosConFarmacia.push({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            texto: el.textContent.substring(0, 150).replace(/\s+/g, ' ').trim()
          });
        }
      });

      // Analizar tablas
      const tablas = document.querySelectorAll('table');
      tablas.forEach((tabla, i) => {
        const filas = tabla.querySelectorAll('tr');
        info.tablas.push({
          index: i,
          filas: filas.length,
          columnas: tabla.querySelectorAll('td').length > 0 ? tabla.querySelectorAll('tr')[0]?.querySelectorAll('td').length : 0,
          primeraFila: tabla.querySelector('tr')?.textContent?.substring(0, 100)
        });
      });

      // Buscar mapas o plugins
      const mapElements = document.querySelectorAll('[class*="map"], [id*="map"], [class*="wpgmp"]');
      mapElements.forEach(el => {
        info.mapas.push({
          tagName: el.tagName,
          className: el.className,
          id: el.id
        });
      });

      return info;
    });

    console.log('\n📊 ANÁLISIS ÁLAVA:');
    console.log(`\n   📝 Líneas con "FARMACIA" en el texto: ${analisis.farmaciasEnTexto.length}`);
    console.log('   Primeras 5:');
    analisis.farmaciasEnTexto.slice(0, 5).forEach((f, i) => {
      console.log(`      ${i+1}. ${f}`);
    });

    console.log(`\n   🏷️  Elementos HTML con "FARMACIA": ${analisis.elementosConFarmacia.length}`);
    console.log('   Primeros 3 elementos:');
    analisis.elementosConFarmacia.slice(0, 3).forEach((el, i) => {
      console.log(`      ${i+1}. <${el.tagName}> class="${el.className}" id="${el.id}"`);
      console.log(`         Texto: ${el.texto}`);
    });

    console.log(`\n   📋 Tablas encontradas: ${analisis.tablas.length}`);
    analisis.tablas.forEach((t, i) => {
      console.log(`      ${i+1}. ${t.filas} filas x ${t.columnas} columnas`);
      console.log(`         Primera fila: ${t.primeraFila}`);
    });

    console.log(`\n   🗺️  Elementos de mapa: ${analisis.mapas.length}`);
    analisis.mapas.forEach((m, i) => {
      console.log(`      ${i+1}. <${m.tagName}> class="${m.className}" id="${m.id}"`);
    });

    // Guardar análisis completo
    fs.writeFileSync('./alava-analisis.json', JSON.stringify(analisis, null, 2));
    console.log('\n✅ Análisis completo guardado: alava-analisis.json');

    await browser.close();
    return analisis;

  } catch (error) {
    console.error('❌ Error:', error.message);
    await browser.close();
    return null;
  }
}

async function analizarBizkaia() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🔴 ANALIZANDO BIZKAIA                            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Bloquear imágenes
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    console.log('Navegando a cofbizkaia.eus (puede tardar)...');
    await page.goto('https://www.cofbizkaia.eus/farmacia_de_guardia/', { 
      waitUntil: 'networkidle0',
      timeout: 120000 
    });

    await page.waitForTimeout(8000);

    // Screenshot
    await page.screenshot({ path: './bizkaia-screenshot.png', fullPage: true });
    console.log('✅ Screenshot guardado: bizkaia-screenshot.png');

    // Guardar HTML
    const html = await page.content();
    fs.writeFileSync('./bizkaia-full.html', html);
    console.log('✅ HTML guardado: bizkaia-full.html');

    // Analizar
    const analisis = await page.evaluate(() => {
      const info = {
        farmaciasEnTexto: [],
        elementosConFarmacia: [],
        tablas: [],
        formularios: []
      };

      const texto = document.body.textContent;
      const lineas = texto.split('\n').filter(l => l.trim().length > 0);
      
      lineas.forEach(linea => {
        if (linea.toUpperCase().includes('FARMACIA') && linea.length > 10 && linea.length < 200) {
          info.farmaciasEnTexto.push(linea.trim());
        }
      });

      const todos = document.querySelectorAll('*');
      todos.forEach(el => {
        if (el.children.length < 5 && el.textContent.includes('FARMACIA') && el.textContent.length > 10 && el.textContent.length < 300) {
          info.elementosConFarmacia.push({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            texto: el.textContent.substring(0, 150).replace(/\s+/g, ' ').trim()
          });
        }
      });

      const tablas = document.querySelectorAll('table');
      tablas.forEach((tabla, i) => {
        const filas = tabla.querySelectorAll('tr');
        info.tablas.push({
          index: i,
          filas: filas.length,
          primeraFila: tabla.querySelector('tr')?.textContent?.substring(0, 100)
        });
      });

      const forms = document.querySelectorAll('form');
      info.formularios.push({
        total: forms.length,
        tieneSelect: document.querySelectorAll('select').length > 0,
        selects: Array.from(document.querySelectorAll('select')).map(s => ({
          name: s.name,
          id: s.id,
          opciones: s.options.length
        }))
      });

      return info;
    });

    console.log('\n📊 ANÁLISIS BIZKAIA:');
    console.log(`\n   📝 Líneas con "FARMACIA": ${analisis.farmaciasEnTexto.length}`);
    console.log('   Primeras 5:');
    analisis.farmaciasEnTexto.slice(0, 5).forEach((f, i) => {
      console.log(`      ${i+1}. ${f}`);
    });

    console.log(`\n   🏷️  Elementos HTML con "FARMACIA": ${analisis.elementosConFarmacia.length}`);
    analisis.elementosConFarmacia.slice(0, 3).forEach((el, i) => {
      console.log(`      ${i+1}. <${el.tagName}> class="${el.className}"`);
      console.log(`         Texto: ${el.texto}`);
    });

    console.log(`\n   📋 Tablas: ${analisis.tablas.length}`);
    analisis.tablas.forEach((t, i) => {
      console.log(`      ${i+1}. ${t.filas} filas - ${t.primeraFila}`);
    });

    console.log(`\n   📝 Formularios: ${analisis.formularios[0]?.total || 0}`);
    if (analisis.formularios[0]?.selects) {
      console.log('   Selectores encontrados:');
      analisis.formularios[0].selects.forEach((s, i) => {
        console.log(`      ${i+1}. name="${s.name}" id="${s.id}" - ${s.opciones} opciones`);
      });
    }

    fs.writeFileSync('./bizkaia-analisis.json', JSON.stringify(analisis, null, 2));
    console.log('\n✅ Análisis completo guardado: bizkaia-analisis.json');

    await browser.close();
    return analisis;

  } catch (error) {
    console.error('❌ Error:', error.message);
    await browser.close();
    return null;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  🔍 ANÁLISIS PROFUNDO DE HTML                     ║');
  console.log('╚════════════════════════════════════════════════════╝');

  await analizarAlava();
  await analizarBizkaia();

  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  ✅ ANÁLISIS COMPLETADO                           ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('\n📁 Archivos generados:');
  console.log('   - alava-screenshot.png');
  console.log('   - alava-full.html');
  console.log('   - alava-analisis.json');
  console.log('   - bizkaia-screenshot.png');
  console.log('   - bizkaia-full.html');
  console.log('   - bizkaia-analisis.json');
  console.log('\n🔍 Próximos pasos:');
  console.log('   1. Revisa los screenshots para ver la estructura visual');
  console.log('   2. Abre los archivos .html para inspeccionar el código');
  console.log('   3. Revisa los .json para ver qué elementos se encontraron');
  console.log('   4. Con esta info, actualizaremos los scrapers\n');
}

main().catch(console.error);