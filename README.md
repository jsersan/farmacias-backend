# Farmacias Euskadi — API Proxy

Servicio Node.js que expone una API unificada con el **directorio completo de farmacias** y las **farmacias de guardia del día** en las tres provincias de Euskadi (Araba/Álava, Bizkaia y Gipuzkoa).

Combina datos abiertos del Gobierno Vasco (OpenData Euskadi) con scraping de los tres Colegios Oficiales de Farmacéuticos para obtener las guardias actualizadas.

## Características

- **Directorio completo** de farmacias y botiquines (GeoJSON desde OpenData Euskadi).
- **Guardias del día** scrapeadas de las webs oficiales:
  - 🔵 Gipuzkoa — `cofgipuzkoa.eus` (API interna del colegio).
  - 🟢 Álava — `cofalava.org` (plugin WP Google Maps).
  - 🔴 Bizkaia — `cofbizkaia.eus` / `cofbizkaia.net` (formulario de municipios).
- **Caché en disco** con refresco automático cada 6 horas.
- **Tolerante a fallos**: si un scraper cae, el resto sigue funcionando; si la API externa falla, se sirve la última caché válida.
- **Filtrado por provincia** vía query string.
- **Enriquecimiento geográfico** mediante matching difuso con un GeoJSON local (en `services/geocoder.js`).
- **CORS** preconfigurado para localhost, GitHub Pages y `txemaserrano.com`.

## Estructura del proyecto

```
.
├── server-proxy.js              # Servidor Express principal (entrada)
├── providers/
│   ├── gipuzkoa/
│   │   ├── scraper.js           # Puppeteer + API interna cofgipuzkoa
│   │   └── parser.js            # Normaliza a esquema común
│   ├── bizkaia/
│   │   ├── scraper.js           # Itera municipios en formulario
│   │   └── parser.js
│   └── alava/
│       ├── scraper.js           # Extrae del mapa Google Maps
│       └── parser.js
├── services/
│   ├── aggregator.js            # Orquesta scrapers + caché en memoria
│   └── geocoder.js              # Enriquece con lat/lng (fuzzy match)
├── cache-farmaziak.json         # Caché directorio completo (auto)
├── cache-guardias.json          # Caché guardias del día (auto)
├── find-selectors.js            # Utilidad para descubrir selectores CSS
└── test-scrapers.js             # Test independiente de scrapers
```

## Instalación

Requiere **Node.js 18+** y las dependencias para que Puppeteer pueda lanzar Chromium.

```bash
git clone <este-repositorio>
cd farmacias-euskadi
npm install
```

Dependencias principales (instalar si no están en `package.json`):

```bash
npm install express cors axios puppeteer node-cache uuid
```

## Uso

### Arrancar el servidor

```bash
node server-proxy.js
```

Por defecto escucha en `http://localhost:3000`. Configurable con la variable de entorno `PORT`:

```bash
PORT=8080 node server-proxy.js
```

Al arrancar:

1. Si no hay caché de guardias **del día actual**, lanza los tres scrapers en paralelo.
2. Si el caché del directorio tiene más de 7 días, lo refresca desde OpenData.
3. Programa un refresco automático de guardias cada 6 horas.

## Endpoints

### `GET /api/farmacias`

Directorio completo de farmacias de Euskadi en formato **GeoJSON** (FeatureCollection). Cada feature incluye `latitude` y `longitude` también en `properties` para comodidad del frontend.

**Caché:** 7 días en disco. Fuente: `opendata.euskadi.eus`.

### `GET /api/farmacias-guardia`

Farmacias de guardia del día actual en las tres provincias.

**Query opcional:**

- `provincia=GIPUZKOA` | `ARABA` | `BIZKAIA` — filtra por provincia.

**Respuesta:**

```json
{
  "tipo": "farmacias-guardia",
  "fecha": "2026-05-28T08:15:00.000Z",
  "total": 237,
  "gipuzkoa": [ { "nombre": "...", "direccion": "...", "telefono": "...", "municipio": "...", "provincia": "GIPUZKOA" } ],
  "alava":    [ ... ],
  "bizkaia":  [ ... ],
  "errores":  []
}
```

**Cabecera `X-Cache`:**

- `hit` — servido desde caché válido (< 6 h).
- `stale` — caché antiguo, se sirve y se refresca en segundo plano.
- `emergency` — caché de respaldo tras un fallo del scraping.

### `POST /api/farmacias-guardia/refresh`

Lanza el scraping en segundo plano y responde inmediatamente. Útil para forzar una actualización sin esperar al ciclo automático.

```bash
curl -X POST http://localhost:3000/api/farmacias-guardia/refresh
```

### `GET /health`

Estado del servidor, contadores y antigüedad de las cachés:

```json
{
  "status": "ok",
  "timestamp": "2026-05-28T08:15:00.000Z",
  "scraperEnEjecucion": false,
  "directorio": { "disponible": true, "farmacias": 842, "edadHoras": 12 },
  "guardias":   { "disponible": true, "total": 237, "gipuzkoa": 65, "alava": 14, "bizkaia": 158, "edadHoras": 3 }
}
```

## Cómo funcionan los scrapers

Los tres usan **Puppeteer** en modo headless con flags `--no-sandbox` para entornos containerizados.

- **Gipuzkoa**: navega a la web del colegio, lista los municipios del `<select>` y por cada uno llama directamente al endpoint interno `cofgipuzkoa.pretools.net/buscarFarmaciasGuardia` desde el contexto de la página.
- **Álava**: espera a que el plugin WP Google Maps renderice los marcadores (`.wpgmp_locations`) y extrae nombre, dirección, municipio y teléfono de cada uno.
- **Bizkaia**: prueba primero la URL `.net` y cae a la `.eus`; itera por cada opción del selector de municipios y extrae las filas de la tabla resultante.

Los tres devuelven un array de objetos con el mismo esquema mínimo:

```ts
{ nombre, direccion, municipio, telefono, provincia }
```

## Utilidades incluidas

### `find-selectors.js`

Cuando las webs de los colegios cambian su HTML, este script analiza cada una y sugiere los selectores CSS más frecuentes con etiquetas como `farmacia`/`pharmacy`/`guardia`. Genera un screenshot a página completa y un informe `.txt` por web.

```bash
node find-selectors.js
```

### `test-scrapers.js`

Test independiente que ejecuta los scrapers de Álava y Bizkaia sin necesidad de levantar el servidor. Útil para depurar cambios. Guarda el resultado en `test-standalone.json`.

```bash
node test-scrapers.js
```

## Configuración

Constantes editables al principio de `server-proxy.js`:

| Constante | Valor por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP (vía env). |
| `INTERVALO_GUARDIAS_MS` | `6 * 60 * 60 * 1000` | Cada cuánto se refrescan las guardias. |
| `CACHE_DIRECTORIO` | `cache-farmaziak.json` | Archivo de caché del directorio. |
| `CACHE_GUARDIAS` | `cache-guardias.json` | Archivo de caché de guardias. |

La lista de orígenes CORS permitidos está en la llamada a `cors({ origin: [...] })`.

## Notas y limitaciones

- Los scrapers dependen del HTML de webs de terceros. Cuando cambian, hay que actualizar los selectores (usa `find-selectors.js`).
- Bizkaia limita el procesado a los primeros 20 municipios en una de las rutas para evitar tiempos de scraping excesivos; ajustable en `providers/bizkaia/scraper.js`.
- El geocoder espera encontrar un GeoJSON en `frontend/src/assets/farmacias.geojson` para el matching difuso. Si no existe, devuelve coordenadas por defecto del centro de cada provincia.
- En el primer arranque sin caché, la respuesta de `/api/farmacias-guardia` puede tardar varios minutos (los tres scrapers en paralelo).

## Fuentes de datos

- [OpenData Euskadi — Farmacias y botiquines](https://opendata.euskadi.eus/contenidos/ds_localizaciones/farmacias_y_botiquines_euskadi/opendata/farmaziak.geojson)
- [Colegio Oficial de Farmacéuticos de Gipuzkoa](https://www.cofgipuzkoa.eus)
- [Colegio Oficial de Farmacéuticos de Bizkaia](https://www.cofbizkaia.eus)
- [Colegio Oficial de Farmacéuticos de Álava](https://cofalava.org)

## Licencia

Pendiente de definir. Los datos provienen de fuentes públicas y de webs de los colegios profesionales correspondientes; respeta sus condiciones de uso.

