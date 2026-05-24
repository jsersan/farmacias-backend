// providers/gipuzkoa/parser.js
const { v4: uuidv4 } = require('uuid');

/**
 * Parser para normalizar datos de farmacias de Gipuzkoa
 * Convierte datos crudos al modelo unificado
 */
function parseFarmaciasGipuzkoa(farmaciasRaw) {
  if (!Array.isArray(farmaciasRaw)) {
    console.error('❌ [Parser Gipuzkoa] Datos inválidos, se esperaba array');
    return [];
  }

  console.log(`📊 [Parser Gipuzkoa] Procesando ${farmaciasRaw.length} farmacias...`);

  const farmaciasNormalizadas = farmaciasRaw.map(farmacia => {
    // Fecha de vigencia: hoy y mañana (las guardias suelen ser para el día)
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    // Normalizar municipio
    let municipio = farmacia.municipio || '';
    if (!municipio && farmacia.nombre) {
      // Intentar extraer municipio del nombre
      const match = farmacia.nombre.match(/[-–]\s*([A-ZÁÉÍÓÚÑ\s]+)$/);
      if (match) {
        municipio = match[1].trim();
      }
    }

    // Normalizar nombres específicos
    if (municipio.toLowerCase().includes('donostia') || municipio.toLowerCase().includes('san sebastián')) {
      municipio = 'Donostia-San Sebastián';
    }

    // Limpiar teléfono (solo números)
    let telefono = farmacia.telefono || '';
    telefono = telefono.replace(/[^\d+]/g, '');

    // Determinar horario según tipo de guardia
    let horario = { inicio: '09:00', fin: '22:00' };
    if (farmacia.tipoGuardia === 'nocturna') {
      horario = { inicio: '22:00', fin: '09:00' };
    } else if (farmacia.tipoGuardia === '24h') {
      horario = { inicio: '00:00', fin: '23:59' };
    }

    // Si hay horario específico en el texto, intentar parsearlo
    if (farmacia.horario) {
      const horarioMatch = farmacia.horario.match(/(\d{1,2}):(\d{2})\s*[-a]\s*(\d{1,2}):(\d{2})/);
      if (horarioMatch) {
        horario = {
          inicio: `${horarioMatch[1].padStart(2, '0')}:${horarioMatch[2]}`,
          fin: `${horarioMatch[3].padStart(2, '0')}:${horarioMatch[4]}`
        };
      }
    }

    return {
      id: `gipuzkoa-${uuidv4()}`,
      provincia: 'Gipuzkoa',
      municipio: municipio || 'Gipuzkoa',
      nombre: farmacia.nombre || 'Farmacia sin nombre',
      direccion: farmacia.direccion || '',
      telefono: telefono,
      latitude: null,  // Se enriquecerá con geocoder
      longitude: null,
      tipoGuardia: farmacia.tipoGuardia || 'diurna',
      horario: horario,
      fechaVigencia: {
        desde: hoy,
        hasta: manana
      },
      fuente: 'https://www.cofgipuzkoa.eus',
      ultimaActualizacion: new Date()
    };
  });

  console.log(`✅ [Parser Gipuzkoa] ${farmaciasNormalizadas.length} farmacias normalizadas`);
  return farmaciasNormalizadas;
}

module.exports = { parseFarmaciasGipuzkoa };
