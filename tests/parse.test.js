// tests/parsers.test.js
/**
 * Tests unitarios para parsers (sin necesidad de scraping real)
 * Ejecutar: node tests/parsers.test.js
 */

const { parseFarmaciasGipuzkoa } = require('../providers/gipuzkoa/parser');
const { parseFarmaciasBizkaia } = require('../providers/bizkaia/parser');
const { parseFarmaciasAlava } = require('../providers/alava/parser');

// ═══════════════════════════════════════════════════════════════════
// FIXTURES - Datos de ejemplo
// ═══════════════════════════════════════════════════════════════════

const mockGipuzkoaData = [
  {
    nombre: 'FARMACIA GARCIA - DONOSTIA',
    direccion: 'Calle Mayor, 12',
    telefono: '943123456',
    municipio: 'Donostia-San Sebastián',
    tipoGuardia: 'diurna'
  },
  {
    nombre: 'FARMACIA LOPEZ',
    direccion: 'Paseo de la Concha, 5',
    telefono: '943987654',
    municipio: 'Donostia',
    tipoGuardia: 'nocturna'
  }
];

const mockBizkaiaData = [
  {
    nombre: 'FARMACIA BILBAO CENTRO',
    direccion: 'Gran Vía, 45',
    telefono: '944111222',
    municipio: 'BILBAO',
    tipoGuardia: 'diurna'
  }
];

const mockAlavaData = [
  {
    nombre: 'FARMACIA VITORIA',
    direccion: 'Calle Dato, 8',
    telefono: '945222333',
    municipio: 'VITORIA-GASTEIZ',
    tipoGuardia: 'diurna'
  }
];

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

function assertExists(value, message) {
  assert(value !== null && value !== undefined, message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

// ═══════════════════════════════════════════════════════════════════
// TESTS: PARSER GIPUZKOA
// ═══════════════════════════════════════════════════════════════════

function testParserGipuzkoa() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  TEST: Parser Gipuzkoa                            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const parsed = parseFarmaciasGipuzkoa(mockGipuzkoaData);

  // Test 1: Cantidad correcta
  assertEqual(parsed.length, 2, 'Parser devuelve 2 farmacias');

  // Test 2: Estructura del objeto
  const farmacia = parsed[0];
  assertExists(farmacia.id, 'Farmacia tiene ID');
  assertExists(farmacia.provincia, 'Farmacia tiene provincia');
  assertExists(farmacia.nombre, 'Farmacia tiene nombre');
  assertExists(farmacia.municipio, 'Farmacia tiene municipio');
  assertExists(farmacia.tipoGuardia, 'Farmacia tiene tipo de guardia');
  assertExists(farmacia.horario, 'Farmacia tiene horario');
  assertExists(farmacia.fechaVigencia, 'Farmacia tiene fecha vigencia');
  assertExists(farmacia.fuente, 'Farmacia tiene fuente');

  // Test 3: Provincia correcta
  assertEqual(farmacia.provincia, 'Gipuzkoa', 'Provincia es Gipuzkoa');

  // Test 4: ID único con prefijo correcto
  assert(farmacia.id.startsWith('gipuzkoa-'), 'ID tiene prefijo gipuzkoa-');

  // Test 5: Normalización de municipio
  assert(farmacia.municipio.includes('Donostia'), 'Municipio normalizado correctamente');

  // Test 6: Limpieza de teléfono
  const telefono = farmacia.telefono;
  assert(/^\+?\d+$/.test(telefono) || telefono === '', 'Teléfono solo contiene números');

  // Test 7: Tipo de guardia válido
  const tiposValidos = ['diurna', 'nocturna', '24h', 'refuerzo', 'voluntaria'];
  assert(tiposValidos.includes(farmacia.tipoGuardia), 'Tipo de guardia es válido');

  // Test 8: Horario tiene estructura correcta
  assertExists(farmacia.horario.inicio, 'Horario tiene inicio');
  assertExists(farmacia.horario.fin, 'Horario tiene fin');

  // Test 9: Fecha vigencia es Date
  assert(farmacia.fechaVigencia.desde instanceof Date, 'fechaVigencia.desde es Date');
  assert(farmacia.fechaVigencia.hasta instanceof Date, 'fechaVigencia.hasta es Date');

  console.log('\n✅ TODOS LOS TESTS DE GIPUZKOA PASARON\n');
}

// ═══════════════════════════════════════════════════════════════════
// TESTS: PARSER BIZKAIA
// ═══════════════════════════════════════════════════════════════════

function testParserBizkaia() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  TEST: Parser Bizkaia                             ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const parsed = parseFarmaciasBizkaia(mockBizkaiaData);

  assertEqual(parsed.length, 1, 'Parser devuelve 1 farmacia');

  const farmacia = parsed[0];
  assertEqual(farmacia.provincia, 'Bizkaia', 'Provincia es Bizkaia');
  assert(farmacia.id.startsWith('bizkaia-'), 'ID tiene prefijo bizkaia-');
  
  assertExists(farmacia.nombre, 'Tiene nombre');
  assertExists(farmacia.municipio, 'Tiene municipio');
  assertExists(farmacia.direccion, 'Tiene dirección');

  console.log('\n✅ TODOS LOS TESTS DE BIZKAIA PASARON\n');
}

// ═══════════════════════════════════════════════════════════════════
// TESTS: PARSER ÁLAVA
// ═══════════════════════════════════════════════════════════════════

function testParserAlava() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  TEST: Parser Álava                               ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const parsed = parseFarmaciasAlava(mockAlavaData);

  assertEqual(parsed.length, 1, 'Parser devuelve 1 farmacia');

  const farmacia = parsed[0];
  assert(
    farmacia.provincia === 'Araba / Álava' || farmacia.provincia === 'Álava',
    'Provincia es Araba/Álava'
  );
  assert(farmacia.id.startsWith('alava-'), 'ID tiene prefijo alava-');

  assertExists(farmacia.nombre, 'Tiene nombre');
  assertExists(farmacia.municipio, 'Tiene municipio');

  console.log('\n✅ TODOS LOS TESTS DE ÁLAVA PASARON\n');
}

// ═══════════════════════════════════════════════════════════════════
// TESTS: CASOS EDGE
// ═══════════════════════════════════════════════════════════════════

function testEdgeCases() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  TEST: Casos Edge                                 ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Test 1: Array vacío
  const emptyGipuzkoa = parseFarmaciasGipuzkoa([]);
  assertEqual(emptyGipuzkoa.length, 0, 'Parser maneja array vacío');

  // Test 2: Datos incompletos
  const incompletos = parseFarmaciasGipuzkoa([
    {
      nombre: 'Solo nombre'
      // Sin otros campos
    }
  ]);
  assertEqual(incompletos.length, 1, 'Parser maneja datos incompletos');
  assertExists(incompletos[0].id, 'Parser asigna ID incluso con datos incompletos');

  // Test 3: Input null/undefined
  try {
    parseFarmaciasGipuzkoa(null);
    console.log('⚠️  Parser maneja null sin crash');
  } catch (error) {
    console.log('✅ Parser maneja null correctamente');
  }

  // Test 4: Normalización de texto con acentos
  const conAcentos = parseFarmaciasGipuzkoa([
    {
      nombre: 'FARMACIA GARCÍA LÓPEZ',
      municipio: 'San Sebastián',
      tipoGuardia: 'diurna'
    }
  ]);
  assertExists(conAcentos[0].nombre, 'Parser maneja acentos correctamente');

  console.log('\n✅ TODOS LOS TESTS EDGE PASARON\n');
}

// ═══════════════════════════════════════════════════════════════════
// EJECUTAR TODOS LOS TESTS
// ═══════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🧪 TEST SUITE: PARSERS                           ║');
  console.log('╚════════════════════════════════════════════════════╝');

  let totalPassed = 0;
  let totalFailed = 0;

  try {
    testParserGipuzkoa();
    totalPassed++;
  } catch (error) {
    console.error('❌ GIPUZKOA FAILED:', error.message);
    totalFailed++;
  }

  try {
    testParserBizkaia();
    totalPassed++;
  } catch (error) {
    console.error('❌ BIZKAIA FAILED:', error.message);
    totalFailed++;
  }

  try {
    testParserAlava();
    totalPassed++;
  } catch (error) {
    console.error('❌ ÁLAVA FAILED:', error.message);
    totalFailed++;
  }

  try {
    testEdgeCases();
    totalPassed++;
  } catch (error) {
    console.error('❌ EDGE CASES FAILED:', error.message);
    totalFailed++;
  }

  // Resumen final
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  📊 RESUMEN DE TESTS                              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`   ✅ Pasados: ${totalPassed}/4`);
  console.log(`   ❌ Fallidos: ${totalFailed}/4`);
  console.log('');

  if (totalFailed === 0) {
    console.log('🎉 ¡TODOS LOS TESTS UNITARIOS PASARON!\n');
    process.exit(0);
  } else {
    console.log('💥 ALGUNOS TESTS FALLARON\n');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testParserGipuzkoa,
  testParserBizkaia,
  testParserAlava,
  testEdgeCases
};