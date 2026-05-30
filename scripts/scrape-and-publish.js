#!/usr/bin/env node
// scripts/scrape-and-publish.js
// ─────────────────────────────────────────────────────────────────
// Ejecuta los 3 scrapers y publica el resultado en un Gist público.
// Diseñado para correr en GitHub Actions (que ya tiene Chrome).
// ─────────────────────────────────────────────────────────────────

const axios = require('axios');

// Importar scrapers
const { scrapeFarmaciasGipuzkoa } = require('../providers/gipuzkoa/scraper');
const { scrapeFarmaciasAlava }    = require('../providers/alava/scraper');
const { scrapeFarmaciasBizkaia }  = require('../providers/bizkaia/scraper');

async function main() {
  console.log('════════════════════════════════════════════');
  console.log('  🏥 SCRAPER DE FARMACIAS DE GUARDIA');
  console.log('  📅 ' + new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));
  console.log('════════════════════════════════════════════\n');

  const errores = [];
  let gipuzkoa = [], alava = [], bizkaia = [];

  // ── Gipuzkoa ──────────────────────────────────────────────
  try {
    gipuzkoa = await scrapeFarmaciasGipuzkoa();
    gipuzkoa = gipuzkoa.map(f => ({ ...f, provincia: 'GIPUZKOA' }));
    console.log(`✅ Gipuzkoa: ${gipuzkoa.length} farmacias\n`);
  } catch (e) {
    console.error(`❌ Gipuzkoa falló: ${e.message}\n`);
    errores.push(`Gipuzkoa: ${e.message}`);
  }

  // ── Álava ─────────────────────────────────────────────────
  try {
    alava = await scrapeFarmaciasAlava();
    alava = alava.map(f => ({ ...f, provincia: 'ARABA' }));
    console.log(`✅ Álava: ${alava.length} farmacias\n`);
  } catch (e) {
    console.error(`❌ Álava falló: ${e.message}\n`);
    errores.push(`Álava: ${e.message}`);
  }

  // ── Bizkaia ───────────────────────────────────────────────
  try {
    bizkaia = await scrapeFarmaciasBizkaia();
    bizkaia = bizkaia.map(f => ({ ...f, provincia: 'BIZKAIA' }));
    console.log(`✅ Bizkaia: ${bizkaia.length} farmacias\n`);
  } catch (e) {
    console.error(`❌ Bizkaia falló: ${e.message}\n`);
    errores.push(`Bizkaia: ${e.message}`);
  }

  // ── Resultado ─────────────────────────────────────────────
  const resultado = {
    tipo:     'farmacias-guardia',
    fecha:    new Date().toISOString(),
    total:    gipuzkoa.length + alava.length + bizkaia.length,
    gipuzkoa,
    alava,
    bizkaia,
    errores
  };

  console.log('════════════════════════════════════════════');
  console.log(`  📊 TOTAL: ${resultado.total} farmacias de guardia`);
  console.log(`     Gipuzkoa: ${gipuzkoa.length}`);
  console.log(`     Álava:    ${alava.length}`);
  console.log(`     Bizkaia:  ${bizkaia.length}`);
  if (errores.length > 0) {
    console.log(`  ⚠️  Errores: ${errores.length}`);
    errores.forEach(e => console.log(`     - ${e}`));
  }
  console.log('════════════════════════════════════════════\n');

  // ── Publicar en Gist ──────────────────────────────────────
  const GIST_ID = process.env.GIST_ID;
  const TOKEN   = process.env.GH_TOKEN;

  if (!GIST_ID || !TOKEN) {
    console.error('❌ Faltan variables: GIST_ID y/o GH_TOKEN');
    // Guardar en disco como fallback
    const fs = require('fs');
    fs.writeFileSync('guardias-output.json', JSON.stringify(resultado, null, 2));
    console.log('💾 Guardado en guardias-output.json (local)');
    process.exit(1);
  }

  console.log('📤 Publicando en Gist...');

  try {
    await axios.patch(
      `https://api.github.com/gists/${GIST_ID}`,
      {
        description: `Farmacias de guardia - ${new Date().toLocaleDateString('es-ES')}`,
        files: {
          'guardias-output.json': {
            content: JSON.stringify(resultado, null, 2)
          }
        }
      },
      {
        headers: {
          'Authorization': `token ${TOKEN}`,
          'Accept':        'application/vnd.github.v3+json',
          'User-Agent':    'farmacias-scraper'
        }
      }
    );

    console.log('✅ Gist actualizado correctamente');
    console.log(`🔗 https://gist.github.com/jsersan/${GIST_ID}`);
  } catch (e) {
    console.error('❌ Error actualizando Gist:', e.response?.data?.message || e.message);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('💥 Error fatal:', e);
  process.exit(1);
});
