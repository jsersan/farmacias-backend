// test-scrapers.js
/**
 * Script de testing para validar scrapers en vivo
 * Ejecutar: node test-scrapers.js
 */

const { scrapeFarmaciasGipuzkoa } = require('./providers/gipuzkoa/scraper');
const { parseFarmaciasGipuzkoa } = require('./providers/gipuzkoa/parser');
const { scrapeFarmaciasBizkaia } = require('./providers/bizkaia/scraper');
const { parseFarmaciasBizkaia } = require('./providers/bizkaia/parser');
const { scrapeFarmaciasAlava } = require('./providers/alava/scraper');
const { parseFarmaciasAlava } = require('./providers/alava/parser');

async function testScraper(nombre, scraperFn, parserFn) {
  console.log(`\n─────────────────────────────────────────────────────`);
  console.log(`🧪 ${nombre.toUpperCase()}`);
  console.log(`─────────────────────────────────────────────────────\n`);

  try {
    const startTime = Date.now();
    
    // Scraping
    const datosRaw = await scraperFn();
    const duration = Date.now() - startTime;
    
    // Parsing
    const datosParsed = parserFn(datosRaw);
    
    console.log(`\n✅ ${nombre}: ${datosParsed.length} farmacias`);
    console.log(`⏱️  Tiempo: ${(duration / 1000).toFixed(2)}s`);
    
    if (datosParsed.length > 0) {
      console.log(`\n📋 Ejemplo de farmacia:`);
      const ejemplo = datosParsed[0];
      console.log(`   - ID: ${ejemplo.id}`);
      console.log(`   - Nombre: ${ejemplo.nombre}`);
      console.log(`   - Municipio: ${ejemplo.municipio}`);
      console.log(`   - Dirección: ${ejemplo.direccion || 'N/A'}`);
      console.log(`   - Teléfono: ${ejemplo.telefono || 'N/A'}`);
      console.log(`   - Tipo: ${ejemplo.tipoGuardia}`);
    }
    
    return { success: true, count: datosParsed.length };
  } catch (error) {
    console.error(`\n❌ ${nombre} FALLÓ:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🧪 TEST DE SCRAPERS - FARMACIAS EUSKADI          ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('\n⏳ Iniciando tests de scrapers (esto puede tardar 1-2 min)...\n');

  const startTime = Date.now();

  // Ejecutar tests
  const resultados = await Promise.all([
    testScraper('GIPUZKOA', scrapeFarmaciasGipuzkoa, parseFarmaciasGipuzkoa),
    testScraper('BIZKAIA', scrapeFarmaciasBizkaia, parseFarmaciasBizkaia),
    testScraper('ÁLAVA', scrapeFarmaciasAlava, parseFarmaciasAlava)
  ]);

  const totalDuration = Date.now() - startTime;

  // Resumen
  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  📊 RESUMEN                                        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const [gipuzkoa, bizkaia, alava] = resultados;

  if (gipuzkoa.success) {
    console.log(`   ✅ GIPUZKOA: ${gipuzkoa.count} farmacias`);
  } else {
    console.log(`   ❌ GIPUZKOA: ${gipuzkoa.error}`);
  }

  if (bizkaia.success) {
    console.log(`   ✅ BIZKAIA: ${bizkaia.count} farmacias`);
  } else {
    console.log(`   ❌ BIZKAIA: ${bizkaia.error}`);
  }

  if (alava.success) {
    console.log(`   ✅ ÁLAVA: ${alava.count} farmacias`);
  } else {
    console.log(`   ❌ ÁLAVA: ${alava.error}`);
  }

  const totalFarmacias = 
    (gipuzkoa.count || 0) + 
    (bizkaia.count || 0) + 
    (alava.count || 0);

  console.log(`\n   📊 TOTAL: ${totalFarmacias} farmacias`);
  console.log(`   ⏱️  Tiempo total: ${(totalDuration / 1000).toFixed(2)}s`);

  const allSuccess = resultados.every(r => r.success);

  if (allSuccess && totalFarmacias > 0) {
    console.log('\n🎉 ¡Todos los scrapers funcionan correctamente!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Algunos scrapers tuvieron problemas\n');
    process.exit(1);
  }
}

// Ejecutar
runAllTests().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
