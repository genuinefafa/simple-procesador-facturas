# Imagen de producción minimalista
# El código se compila en GitHub Actions antes de docker build
# Hono + Bun runtime sirve API y SPA estático desde client/build

FROM oven/bun:1-alpine

WORKDIR /app

# Herramientas del sistema:
# - sqlite: CLI para inspección manual (bun:sqlite es built-in en runtime)
# - curl: descarga tessdata en build time
RUN apk add --no-cache sqlite curl

# --- DEPENDENCIAS (layer cacheado — cambia raramente) ---
# Copiar solo manifests para aprovechar cache de Docker layers.
COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Instalar dependencias de producción solo del workspace server.
# bun:sqlite es built-in (sin compilación nativa).
RUN bun install --filter='./server' --production --frozen-lockfile

# --- TESSDATA (layer cacheado — cambia raramente) ---
# Descargar spa.traineddata desde tessdata_best oficial de Tesseract.
# Ubicación: /app/tessdata/ — usada por ocr-extractor.ts vía langPath absoluto.
# El archivo NO está comprimido (se pasa gzip: false a Tesseract.js).
RUN mkdir -p /app/tessdata && \
    curl -sSfL \
      "https://github.com/tesseract-ocr/tessdata_best/raw/main/spa.traineddata" \
      -o /app/tessdata/spa.traineddata

# --- CÓDIGO (cambia frecuentemente) ---
# client/build fue compilado por GitHub Actions antes del docker build (SPA estático).
# server/ se copia completo (config.json se monta como volumen en docker-compose).
# shared/ es necesario para imports del servidor via path alias.
COPY --chown=bun:bun client/build ./client/build
COPY --chown=bun:bun server ./server
COPY --chown=bun:bun shared ./shared

# Crear directorios de datos
RUN mkdir -p data/input data/processed data/backup && \
    chown -R bun:bun data /app/tessdata

USER bun

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Healthcheck pendiente: implementar cuando Bun proponga patrón oficial.

CMD ["bun", "server/http/server.ts"]
