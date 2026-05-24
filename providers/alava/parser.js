// providers/alava/parser.js
const { v4: uuidv4 } = require('uuid');

/**
 * Parser para normalizar datos de farmacias de Álava
 */
function parseFarmaciasAlava(farmaciasRaw) {
  if (!Array.isArray(farmaciasRaw)) {
    console.error('❌ [Parser Álava] Datos inválidos, se esperaba array');
    return [];
  }

  console.log(`📊 [Parser Álava] Procesando ${farmaciasRaw.length} farmacias...`);

  const farmaciasNormalizadas = farmaciasRaw.map(farmacia => {
    const hoy = new Date();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    // Normalizar municipio
    let municipio = farmacia.municipio || '';
    if (municipio.toUpperCase().includes('VITORIA') || municipio.toUpperCase().includes('GASTEIZ')) {
      municipio = 'Vitoria-Gasteiz';
    }

    // Limpiar teléfono
    let telefono = farmacia.telefono || '';
    telefono = telefono.replace(/[^\d+]/g, '');

    return {
      id: `alava-${uuidv4()}`,
      provincia: 'Araba / Álava',
      municipio: municipio || 'Álava',
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
      fuente: 'https://cofalava.org',
      ultimaActualizacion: new Date()
    };
  });

  console.log(`✅ [Parser Álava] ${farmaciasNormalizadas.length} farmacias normalizadas`);
  return farmaciasNormalizadas;
}

module.exports = { parseFarmaciasAlava };
