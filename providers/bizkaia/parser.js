// providers/bizkaia/parser.js
const { v4: uuidv4 } = require('uuid');

/**
 * Parser para normalizar datos de farmacias de Bizkaia
 */
function parseFarmaciasBizkaia(farmaciasRaw) {
  if (!Array.isArray(farmaciasRaw)) {
    console.error('❌ [Parser Bizkaia] Datos inválidos, se esperaba array');
    return [];
  }

  console.log(`📊 [Parser Bizkaia] Procesando ${farmaciasRaw.length} farmacias...`);

  const farmaciasNormalizadas = farmaciasRaw.map(farmacia => {
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    // Normalizar municipio
    let municipio = farmacia.municipio || '';
    if (municipio.toUpperCase() === 'BILBAO') {
      municipio = 'Bilbao';
    }

    // Limpiar teléfono
    let telefono = farmacia.telefono || '';
    telefono = telefono.replace(/[^\d+]/g, '');

    return {
      id: `bizkaia-${uuidv4()}`,
      provincia: 'Bizkaia',
      municipio: municipio || 'Bizkaia',
      nombre: farmacia.nombre || 'Farmacia sin nombre',
      direccion: farmacia.direccion || '',
      telefono: telefono,
      latitude: null,
      longitude: null,
      tipoGuardia: farmacia.tipoGuardia || 'diurna',
      horario: { inicio: '09:00', fin: '22:00' },
      fechaVigencia: {
        desde: hoy,
        hasta: manana
      },
      fuente: 'https://www.cofbizkaia.eus',
      ultimaActualizacion: new Date()
    };
  });

  console.log(`✅ [Parser Bizkaia] ${farmaciasNormalizadas.length} farmacias normalizadas`);
  return farmaciasNormalizadas;
}

module.exports = { parseFarmaciasBizkaia };
