# 🚀 GUÍA DE INSTALACIÓN - BACKEND SEPARADO

## ✅ ARCHIVOS CREADOS (9 archivos)

He creado todos los archivos que faltaban en tu backend:

### **Providers (6 archivos)**
1. `providers/gipuzkoa/scraper.js` - Scraper Puppeteer para Gipuzkoa
2. `providers/gipuzkoa/parser.js` - Parser que normaliza datos
3. `providers/bizkaia/scraper.js` - Scraper Puppeteer para Bizkaia
4. `providers/bizkaia/parser.js` - Parser que normaliza datos
5. `providers/alava/scraper.js` - Scraper Puppeteer para Álava
6. `providers/alava/parser.js` - Parser que normaliza datos

### **Services (2 archivos)**
7. `services/aggregator.js` - Combina 3 provincias + caché de 6h
8. `services/geocoder.js` - Enriquece con coordenadas lat/lng

### **Tests y Config (3 archivos)**
9. `test-scrapers.js` - Script para probar scrapers en vivo
10. `package.json` - Dependencias actualizadas
11. `copiar-archivos-backend.sh` - Script de verificación

---

## 📦 UBICACIÓN DE ARCHIVOS

Los archivos creados están disponibles para descargar. Deben copiarse a:

```
tu-proyecto/
└── backend/
    ├── providers/
    │   ├── gipuzkoa/
    │   │   ├── scraper.js   ← COPIAR AQUÍ
    │   │   └── parser.js    ← COPIAR AQUÍ
    │   ├── bizkaia/
    │   │   ├── scraper.js   ← COPIAR AQUÍ
    │   │   └── parser.js    ← COPIAR AQUÍ
    │   └── alava/
    │       ├── scraper.js   ← COPIAR AQUÍ
    │       └── parser.js    ← COPIAR AQUÍ
    ├── services/
    │   ├── aggregator.js    ← COPIAR AQUÍ
    │   └── geocoder.js      ← COPIAR AQUÍ
    ├── tests/
    │   └── parse.test.js    ← YA EXISTE
    ├── test-scrapers.js     ← COPIAR AQUÍ
    ├── package.json         ← REEMPLAZAR
    ├── server-proxy.js      ← YA EXISTE
    └── validate-endpoints.js ← YA EXISTE
```

---

## 🔧 PASOS DE INSTALACIÓN

### PASO 1: Verificar estructura

```bash
cd tu-proyecto/backend

# Verificar que existen estos directorios:
ls -la providers/gipuzkoa/
ls -la providers/bizkaia/
ls -la providers/alava/
ls -la services/
```

### PASO 2: Copiar archivos

Descarga todos los archivos y cópialos a las ubicaciones indicadas arriba.

### PASO 3: Instalar dependencias

```bash
cd backend
npm install
```

Esto instalará:
- `puppeteer` (+ Chromium ~200MB)
- `node-cache`
- `uuid`
- `express`
- `cors`

**IMPORTANTE**: La primera vez tardará ~2 minutos porque descarga Chromium.

### PASO 4: Ejecutar tests unitarios

```bash
node tests/parse.test.js
```

**Resultado esperado:**
```
🎉 ¡TODOS LOS TESTS UNITARIOS PASARON!
📊 TOTAL: 4/4 tests pasados
```

### PASO 5: Ejecutar tests de scrapers

```bash
node test-scrapers.js
```

**Resultado esperado (tarda 1-2 min):**
```
✅ GIPUZKOA: 40-50 farmacias
✅ BIZKAIA: 70-80 farmacias
✅ ÁLAVA: 20-30 farmacias
📊 TOTAL: 140-160 farmacias
🎉 ¡Todos los scrapers funcionan correctamente!
```

### PASO 6: Iniciar servidor

```bash
node server-proxy.js
```

**Resultado esperado:**
```
🚀 Servidor proxy iniciado en http://localhost:3000
```

### PASO 7: Validar endpoints

En otra terminal:

```bash
node validate-endpoints.js
```

**Resultado esperado:**
```
✅ Health Endpoint
✅ Guardias Endpoint (todas)
✅ Guardias Endpoint (Gipuzkoa)
✅ Cache Stats Endpoint
✅ CORS Headers
📊 TOTAL: 5/5 tests pasados
🎉 ¡Todos los endpoints funcionan correctamente!
```

---

## 🐛 TROUBLESHOOTING

### Error: "Cannot find module 'puppeteer'"

```bash
cd backend
npm install
```

### Error: "TimeoutError: waiting for selector"

La web tardó más de 30s en cargar. Soluciones:

1. Verifica que la web está accesible:
```bash
curl -I https://www.cofgipuzkoa.eus
```

2. Aumenta el timeout en los scrapers:
```javascript
// En providers/*/scraper.js
await page.goto(URL, { 
  timeout: 60000  // Cambiar de 30000 a 60000
});
```

### Scraper devuelve 0 farmacias

Los selectores CSS cambiaron en la web. Necesitas:

1. Abrir la web en un navegador
2. Inspeccionar HTML (F12)
3. Buscar el selector correcto para las farmacias
4. Actualizar en `providers/*/scraper.js`

### Error: "ECONNREFUSED localhost:3000"

El servidor no está corriendo:

```bash
cd backend
node server-proxy.js
```

---

## 📊 SCRIPTS DISPONIBLES

Una vez instalado, estos son los comandos disponibles:

```bash
# Iniciar servidor proxy
npm start
# o
node server-proxy.js

# Ejecutar tests unitarios
npm test
# o
node tests/parse.test.js

# Ejecutar tests de scrapers (con red)
npm run test-scrapers
# o
node test-scrapers.js

# Validar endpoints
npm run validate
# o
node validate-endpoints.js
```

---

## 🎯 CRITERIOS DE ÉXITO

Todo funciona correctamente si:

1. ✅ `npm install` termina sin errores
2. ✅ Tests unitarios pasan (4/4)
3. ✅ Scrapers devuelven >0 farmacias
4. ✅ Servidor arranca en puerto 3000
5. ✅ Endpoints responden con datos
6. ✅ Caché funciona (segunda llamada <100ms)

---

## 🚀 PRÓXIMO PASO

Una vez que todo funcione, el siguiente paso es:

**Integrar con el frontend Angular**

Esto significa:
1. Crear servicio `cargarGuardias()` en `farmacias.service.ts`
2. Añadir filtro "Solo farmacias de guardia HOY"
3. Actualizar componente del mapa para mostrar guardias

---

## 📞 NECESITAS AYUDA?

Si algo no funciona:

1. Copia el mensaje de error completo
2. Indica en qué paso estás
3. Comparte la salida del comando que falló

¡Estoy aquí para ayudarte! 🚀
