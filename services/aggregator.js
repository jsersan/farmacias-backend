// services/aggregator.js
const NodeCache = require('node-cache');
const { scrapeFarmaciasGipuzkoa } = require('../providers/gipuzkoa/scraper');
const { parseFarmaciasGipuzkoa } = require('../providers/gipuzkoa/parser');
const { scrapeFarmaciasBizkaia } = require('../providers/bizkaia/scraper');
const { parseFarmaciasBizkaia } = require('../providers/bizkaia/parser');
const { scrapeFarmaciasAlava } = require('../providers/alava/scraper');
const { parseFarmaciasAlava } = require('../providers/alava/parser');
const { enrichWithCoordinates } = require('./geocoder');

// Cache: TTL de 6 horas (21600 segundos)
const cache = new NodeCache({ 
  stdTTL: 21600,
  checkperiod: 600 
});

const CACHE_KEY = 'farmacias_guardias_todas';

/**
 * Obtiene farmacias de guardia de todas las provincias
 * Usa caché de 6 horas para optimizar rendimiento
 */
async function obtenerTodasLasGuardias(opciones = {}) {
  const { forceRefresh = false } = opciones;

  // Verificar caché
  if (!forceRefresh) {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      console.log('✅ [Aggregator] Datos obtenidos de caché');
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true,
          source: 'cache'
        }
      };
    }
  }

  console.log('🔄 [Aggregator] Scraping datos frescos...');

  // Scraping paralelo con Promise.allSettled (no falla si uno falla)
  const resultados = await Promise.allSettled([
    scrapearYProcesar('gipuzkoa', scrapeFarmaciasGipuzkoa, parseFarmaciasGipuzkoa),
    scrapearYProcesar('bizkaia', scrapeFarmaciasBizkaia, parseFarmaciasBizkaia),
    scrapearYProcesar('alava', scrapeFarmaciasAlava, parseFarmaciasAlava)
  ]);

  // Recopilar resultados
  const [gipuzkoaResult, bizkaiaResult, alavaResult] = resultados;

  const datos = {
    gipuzkoa: gipuzkoaResult.status === 'fulfilled' ? gipuzkoaResult.value : [],
    bizkaia: bizkaiaResult.status === 'fulfilled' ? bizkaiaResult.value : [],
    alava: alavaResult.status === 'fulfilled' ? alavaResult.value : []
  };

  // Enriquecer con coordenadas
  console.log('🗺️  [Aggregator] Enriqueciendo con coordenadas...');
  datos.gipuzkoa = await enrichWithCoordinates(datos.gipuzkoa);
  datos.bizkaia = await enrichWithCoordinates(datos.bizkaia);
  datos.alava = await enrichWithCoordinates(datos.alava);

  const totalFarmacias = 
    datos.gipuzkoa.length + 
    datos.bizkaia.length + 
    datos.alava.length;

  const errores = resultados
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.message || 'Error desconocido');

  const resultado = {
    success: totalFarmacias > 0,
    data: datos,
    metadata: {
      total: totalFarmacias,
      timestamp: new Date().toISOString(),
      cached: false,
      source: 'scraping',
      errors: errores.length > 0 ? errores : undefined
    }
  };

  // Guardar en caché solo si hay datos
  if (totalFarmacias > 0) {
    cache.set(CACHE_KEY, resultado);
    console.log(`✅ [Aggregator] ${totalFarmacias} farmacias en caché (6h TTL)`);
  }

  return resultado;
}

/**
 * Obtiene farmacias de una provincia específica
 */
async function obtenerGuardiasPorProvincia(provincia) {
  const todas = await obtenerTodasLasGuardias();
  
  const provinciaKey = provincia.toLowerCase();
  if (!todas.data[provinciaKey]) {
    throw new Error(`Provincia no válida: ${provincia}`);
  }

  return {
    success: true,
    data: todas.data[provinciaKey],
    metadata: {
      provincia,
      total: todas.data[provinciaKey].length,
      timestamp: todas.metadata.timestamp,
      cached: todas.metadata.cached
    }
  };
}

/**
 * Scraper helper con reintentos
 */
async function scrapearYProcesar(provincia, scraperFn, parserFn, maxRetries = 3) {
  for (let intento = 1; intento <= maxRetries; intento++) {
    try {
      console.log(`\n🔵 [Aggregator] Scraping ${provincia.toUpperCase()} (intento ${intento}/${maxRetries})`);
      
      const datosRaw = await scraperFn();
      const datosParsed = parserFn(datosRaw);
      
      return datosParsed;
    } catch (error) {
      console.error(`❌ [Aggregator] Error en ${provincia} (intento ${intento}):`, error.message);
      
      if (intento === maxRetries) {
        throw new Error(`${provincia}: ${error.message}`);
      }
      
      // Backoff exponencial
      const espera = Math.pow(2, intento) * 1000;
      console.log(`⏳ [Aggregator] Reintentando en ${espera/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
}

/**
 * Obtiene estadísticas de caché
 */
function obtenerEstadisticasCache() {
  const stats = cache.getStats();
  const keys = cache.keys();
  
  return {
    hits: stats.hits,
    misses: stats.misses,
    keys: keys.length,
    ksize: stats.ksize,
    vsize: stats.vsize
  };
}

/**
 * Limpia el caché manualmente
 */
function limpiarCache() {
  cache.flushAll();
  console.log('🗑️  [Aggregator] Caché limpiado');
}

module.exports = {
  obtenerTodasLasGuardias,
  obtenerGuardiasPorProvincia,
  obtenerEstadisticasCache,
  limpiarCache
};
