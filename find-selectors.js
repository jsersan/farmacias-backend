// find-selectors-fixed.js
/**
 * Script automático para encontrar selectores CSS correctos
 * VERSIÓN CORREGIDA - guarda archivos en directorio actual
 * Ejecutar: node find-selectors-fixed.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const WEBS = [
  {
    nombre: 'GIPUZKOA',
    url: 'https://www.cofgipuzkoa.eus/ciudadano/farmacias-gipuzkoa/farmacias-de-guardia-2/'
  },
  {
    nombre: 'BIZKAIA',
    url: 'https://www.cofbizkaia.eus/farmacia_de_guardia/'
  },
  {
    nombre: 'ÁLAVA',
    url: 'https://cofalava.org/farmacias-de-guardia/'
  }
];

async function findSelectors(web) {
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║  🔍 Analizando: ${web.nombre.padEnd(37)}║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    console.log(`🌐 Navegando a ${web.url}...`);
    await page.goto(web.url, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // Esperar a que cargue contenido
    console.log('⏳ Esperando carga...');
    await page.waitForTimeout(5000);

    // Tomar screenshot - GUARDADO EN DIRECTORIO ACTUAL
    const screenshotPath = path.join(process.cwd(), `${web.nombre.toLowerCase()}-page.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot guardado: ${screenshotPath}`);

    // Buscar posibles selectores
    console.log('\n🔍 Buscando selectores...\n');

    const analisis = await page.evaluate(() => {
      const results = {
        selectoresEncontrados: [],
        ejemplosFarmacias: [],
        estructuraHTML: ''
      };

      // Patrones comunes de palabras clave
      const keywords = ['farmacia', 'pharmacy', 'guardia', 'botika'];
      
      // Buscar todos los elementos que contengan keywords
      const allElements = document.querySelectorAll('*');
      const candidates = [];

      allElements.forEach(el => {
        const text = el.textContent.toLowerCase();
        const className = el.className.toString().toLowerCase();
        
        // Si el elemento contiene "farmacia" en el texto o clase
        keywords.forEach(keyword => {
          if ((text.includes(keyword) || className.includes(keyword)) && 
              el.children.length < 10) { // No muy anidado
            
            candidates.push({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              textPreview: el.textContent.substring(0, 100).replace(/\s+/g, ' ').trim()
            });
          }
        });
      });

      // Agrupar por selector
      const selectorCount = {};
      candidates.forEach(el => {
        if (el.className) {
          const selector = `.${el.className.split(' ')[0]}`;
          selectorCount[selector] = (selectorCount[selector] || 0) + 1;
        } else {
          const selector = el.tagName.toLowerCase();
          selectorCount[selector] = (selectorCount[selector] || 0) + 1;
        }
      });

      // Top selectores
      Object.entries(selectorCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([selector, count]) => {
          results.selectoresEncontrados.push({
            selector,
            count,
            confidence: count > 5 ? 'ALTO' : count > 2 ? 'MEDIO' : 'BAJO'
          });
        });

      // Ejemplos de farmacias (primeros 3)
      candidates.slice(0, 3).forEach(el => {
        results.ejemplosFarmacias.push({
          selector: el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
          texto: el.textPreview
        });
      });

      // Estructura HTML de sección relevante
      const mainContent = document.querySelector('main, .content, #content, article');
      if (mainContent) {
        results.estructuraHTML = mainContent.innerHTML.substring(0, 2000);
      }

      return results;
    });

    // Mostrar resultados
    console.log('📊 SELECTORES ENCONTRADOS:\n');
    if (analisis.selectoresEncontrados.length > 0) {
      analisis.selectoresEncontrados.forEach((s, i) => {
        const emoji = s.confidence === 'ALTO' ? '🟢' : s.confidence === 'MEDIO' ? '🟡' : '⚪';
        console.log(`${i + 1}. ${emoji} ${s.selector.padEnd(30)} → ${s.count} elementos (Confianza: ${s.confidence})`);
      });
    } else {
      console.log('❌ No se encontraron selectores automáticamente');
    }

    console.log('\n📋 EJEMPLOS DE CONTENIDO:\n');
    analisis.ejemplosFarmacias.forEach((ej, i) => {
      console.log(`${i + 1}. Selector: ${ej.selector}`);
      console.log(`   Texto: ${ej.texto}`);
      console.log('');
    });

    // Guardar análisis completo - GUARDADO EN DIRECTORIO ACTUAL
    const reportPath = path.join(process.cwd(), `${web.nombre.toLowerCase()}-report.txt`);
    const report = `
ANÁLISIS DE SELECTORES: ${web.nombre}
URL: ${web.url}
Fecha: ${new Date().toISOString()}

═══════════════════════════════════════════════════════
SELECTORES ENCONTRADOS (ordenados por frecuencia)
═══════════════════════════════════════════════════════

${analisis.selectoresEncontrados.map((s, i) => 
  `${i+1}. ${s.selector} (${s.count} elementos - Confianza: ${s.confidence})`
).join('\n')}

═══════════════════════════════════════════════════════
EJEMPLOS DE CONTENIDO
═══════════════════════════════════════════════════════

${analisis.ejemplosFarmacias.map((ej, i) => 
  `Ejemplo ${i+1}:\nSelector: ${ej.selector}\nTexto: ${ej.texto}\n`
).join('\n')}

═══════════════════════════════════════════════════════
ESTRUCTURA HTML (primeros 2000 caracteres)
═══════════════════════════════════════════════════════

${analisis.estructuraHTML}
`;

    fs.writeFileSync(reportPath, report);
    console.log(`📄 Reporte completo guardado: ${reportPath}\n`);

    await browser.close();

    return {
      nombre: web.nombre,
      selectores: analisis.selectoresEncontrados,
      ejemplos: analisis.ejemplosFarmacias
    };

  } catch (error) {
    console.error(`❌ Error analizando ${web.nombre}:`, error.message);
    await browser.close();
    return {
      nombre: web.nombre,
      error: error.message
    };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🔍 BUSCADOR AUTOMÁTICO DE SELECTORES CSS        ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('\nEste script analiza las 3 webs y sugiere selectores.\n');
  console.log(`📁 Directorio de trabajo: ${process.cwd()}\n`);

  const resultados = [];

  for (const web of WEBS) {
    const resultado = await findSelectors(web);
    resultados.push(resultado);
    
    // Pausa entre webs
    if (web !== WEBS[WEBS.length - 1]) {
      console.log('⏳ Esperando 3 segundos antes de la siguiente web...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Resumen final
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  📊 RESUMEN                                       ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  resultados.forEach(r => {
    if (r.error) {
      console.log(`❌ ${r.nombre}: ${r.error}`);
    } else {
      const mejorSelector = r.selectores[0];
      if (mejorSelector) {
        console.log(`✅ ${r.nombre}: Usar selector "${mejorSelector.selector}" (${mejorSelector.count} elementos)`);
      } else {
        console.log(`⚠️  ${r.nombre}: No se encontraron selectores automáticamente`);
      }
    }
  });

  console.log('\n📁 ARCHIVOS GENERADOS (en directorio actual):\n');
  WEBS.forEach(web => {
    console.log(`   - ${web.nombre.toLowerCase()}-page.png (screenshot)`);
    console.log(`   - ${web.nombre.toLowerCase()}-report.txt (análisis completo)`);
  });

  console.log('\n🔧 PRÓXIMO PASO:\n');
  console.log('   1. Revisa los selectores sugeridos arriba');
  console.log('   2. Abre los screenshots para verificar');
  console.log('   3. Lee los reportes completos con: cat *-report.txt');
  console.log('   4. Comparte los selectores sugeridos para actualizar scrapers\n');
}

main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});