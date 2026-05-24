// services/geocoder.js
const fs = require('fs');
const path = require('path');

/**
 * Geocoder que enriquece farmacias con coordenadas lat/lng
 * Estrategia:
 * 1. Cache en memoria (primera búsqueda)
 * 2. Fuzzy matching con GeoJSON existente
 * 3. Fallback a coordenadas por defecto de Euskadi
 */

// Cache en memoria
const coordenadasCache = new Map();

// Coordenadas por defecto (centro de Euskadi)
const DEFAULT_COORDS = {
  latitude: 43.0,
  longitude: -2.5
};

/**
 * Enriquece array de farmacias con coordenadas
 */
async function enrichWithCoordinates(farmacias) {
  if (!Array.isArray(farmacias)) {
    return [];
  }

  console.log(`🗺️  [Geocoder] Enriqueciendo ${farmacias.length} farmacias...`);

  const farmaciasEnriquecidas = farmacias.map(farmacia => {
    const coords = buscarCoordenadas(farmacia);
    return {
      ...farmacia,
      latitude: coords.latitude,
      longitude: coords.longitude
    };
  });

  const conCoordenadas = farmaciasEnriquecidas.filter(
    f => f.latitude !== null && f.longitude !== null
  ).length;

  console.log(`✅ [Geocoder] ${conCoordenadas}/${farmacias.length} con coordenadas`);

  return farmaciasEnriquecidas;
}

/**
 * Busca coordenadas para una farmacia
 */
function buscarCoordenadas(farmacia) {
  const cacheKey = `${farmacia.nombre}-${farmacia.municipio}`.toLowerCase();

  // 1. Cache en memoria
  if (coordenadasCache.has(cacheKey)) {
    return coordenadasCache.get(cacheKey);
  }

  // 2. Fuzzy matching con GeoJSON (si existe)
  const coords = buscarEnGeoJSON(farmacia);
  
  if (coords) {
    coordenadasCache.set(cacheKey, coords);
    return coords;
  }

  // 3. Coordenadas por provincia
  const coordsProvincia = getCoordenadaPorProvincia(farmacia.provincia);
  coordenadasCache.set(cacheKey, coordsProvincia);
  
  return coordsProvincia;
}

/**
 * Busca en GeoJSON existente (si está disponible)
 */
function buscarEnGeoJSON(farmacia) {
  try {
    // Intentar cargar GeoJSON desde la ruta típica del proyecto
    const geojsonPath = path.resolve(__dirname, '../../frontend/src/assets/farmacias.geojson');
    
    if (!fs.existsSync(geojsonPath)) {
      return null;
    }

    const geojsonContent = fs.readFileSync(geojsonPath, 'utf8');
    const geojson = JSON.parse(geojsonContent);

    // Buscar por nombre y municipio con fuzzy matching
    const features = geojson.features || [];
    
    for (const feature of features) {
      const props = feature.properties || {};
      const geometry = feature.geometry || {};
      
      // Matching simple por nombre
      if (props.nombre && similarity(
        normalize(farmacia.nombre), 
        normalize(props.nombre)
      ) > 0.7) {
        return {
          latitude: geometry.coordinates?.[1] || null,
          longitude: geometry.coordinates?.[0] || null
        };
      }

      // Matching por dirección
      if (farmacia.direccion && props.direccion && similarity(
        normalize(farmacia.direccion),
        normalize(props.direccion)
      ) > 0.8) {
        return {
          latitude: geometry.coordinates?.[1] || null,
          longitude: geometry.coordinates?.[0] || null
        };
      }
    }

    return null;
  } catch (error) {
    // GeoJSON no disponible o error al leer
    return null;
  }
}

/**
 * Obtiene coordenadas por defecto según provincia
 */
function getCoordenadaPorProvincia(provincia) {
  const coordsPorProvincia = {
    'Gipuzkoa': { latitude: 43.32, longitude: -1.98 },        // Donostia
    'Bizkaia': { latitude: 43.26, longitude: -2.93 },         // Bilbao
    'Araba / Álava': { latitude: 42.85, longitude: -2.67 },   // Vitoria
    'Álava': { latitude: 42.85, longitude: -2.67 }            // Vitoria
  };

  return coordsPorProvincia[provincia] || DEFAULT_COORDS;
}

/**
 * Normaliza string para comparación
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\s]/g, '')      // Solo letras y números
    .trim();
}

/**
 * Calcula similitud entre dos strings (Dice Coefficient)
 */
function similarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);
  
  let matches = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      matches++;
      bigrams2.delete(bigram);
    }
  }
  
  return (2 * matches) / (bigrams1.size + bigrams2.size);
}

/**
 * Obtiene bigrams de un string
 */
function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

/**
 * Limpia cache
 */
function limpiarCache() {
  coordenadasCache.clear();
  console.log('🗑️  [Geocoder] Cache limpiado');
}

module.exports = {
  enrichWithCoordinates,
  buscarCoordenadas,
  limpiarCache
};
