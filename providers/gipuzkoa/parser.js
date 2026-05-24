// providers/gipuzkoa/parser.js
const { v4: uuidv4 } = require('uuid');

/**
 * Parser para normalizar datos de farmacias de Gipuzkoa
 */
function parseFarmaciasGipuzkoa(farmaciasRaw) {
  if (!Array.isArray(farmaciasRaw)) {
    console.error('❌ [Parser Gipuzkoa] Datos inválidos, se esperaba array');
    return [];
  }

  console.log(`📊 [Parser Gipuzkoa] Procesando ${farmaciasRaw.length} farmacias...`);

  const farmaciasNormalizadas = farmaciasRaw.map(farmacia => {
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    let municipio = farmacia.municipio || '';
    if (municipio.toLowerCase().includes('donostia') || municipio.toLowerCase().includes('san sebastián')) {
      municipio = 'Donostia-San Sebastián';
    }

    let telefono = farmacia.telefono || '';
    telefono = telefono.replace(/[^\d+]/g, '');

    let horario = { inicio: '09:00', fin: '22:00' };
    if (farmacia.tipoGuardia === 'nocturna') {
      horario = { inicio: '22:00', fin: '09:00' };
    } else if (farmacia.tipoGuardia === '24h') {
      horario = { inicio: '00:00', fin: '23:59' };
    }

    return {
      id: `gipuzkoa-${uuidv4()}`,
      provincia: 'Gipuzkoa',
      municipio: municipio || 'Gipuzkoa',
      nombre: farmacia.nombre || 'Farmacia sin nombre',
      direccion: farmacia.direccion || '',
      telefono: telefono,
      latitude: null,
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
