# Imagen de producción minimalista
# El código se compila en GitHub Actions antes de docker build
# SvelteKit adapter-node genera un ejecutable standalone

FROM node:22.21.0-alpine

WORKDIR /app

# Herramientas del sistema necesarias:
# - python3, make, g++: requeridos para compilar better-sqlite3 (sin prebuild para musl/Alpine)
# - sqlite, curl, dumb-init: runtime y utilidades
RUN apk add --no-cache \
    sqlite \
    curl \
    dumb-init \
    python3 \
    make \
    g++

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# --- DEPENDENCIAS (layer cacheado — cambia raramente) ---
# Copiar solo manifests para aprovechar cache de Docker layers.
# Cuando solo cambia código fuente, este layer se reutiliza sin reinstalar.
COPY package.json package-lock.json ./
COPY server/package.json ./server/

# Instalar dependencias de producción del workspace server.
# npm workspaces instala todo en /app/node_modules (un solo node_modules).
# --omit=dev excluye vitest, eslint, typescript, drizzle-kit, etc.
# sharp y @napi-rs/canvas tienen prebuild para linuxmusl-x64 en el lockfile.
# better-sqlite3 compila desde fuente (requiere python3/make/g++ instalados arriba).
RUN npm ci --workspace=server --omit=dev

# --- TESSDATA (layer cacheado — cambia raramente) ---
# Descargar spa.traineddata desde tessdata_best oficial de Tesseract.
# Ubicación: /app/tessdata/ — usada por ocr-extractor.ts vía langPath absoluto.
# El archivo NO está comprimido (se pasa gzip: false a Tesseract.js).
RUN mkdir -p /app/tessdata && \
    curl -sSfL \
      "https://github.com/tesseract-ocr/tessdata_best/raw/main/spa.traineddata" \
      -o /app/tessdata/spa.traineddata

# --- CÓDIGO (cambia frecuentemente) ---
# client/build fue compilado por GitHub Actions antes del docker build.
# server/ se copia completo (config.json se monta como volumen en docker-compose).
# shared/ es necesario para imports del servidor via path alias.
COPY --chown=nodejs:nodejs client/build ./client/build
COPY --chown=nodejs:nodejs server ./server
COPY --chown=nodejs:nodejs shared ./shared

# Crear directorios de datos y ajustar permisos
RUN mkdir -p data/input data/processed data/backup && \
    chown -R nodejs:nodejs data /app/tessdata

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Iniciar servidor compilado directamente
WORKDIR /app
CMD ["node", "client/build/index.js"]
