# Multi-stage build para optimizar tamaño de imagen

# Stage 1: Dependencies
FROM node:22.21.0-alpine AS deps

WORKDIR /app

# Copiar solo package files para aprovechar cache de Docker
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Instalar dependencias de producción
RUN npm ci --only=production --ignore-scripts && \
    cd server && npm ci --only=production --ignore-scripts && \
    cd ../client && npm ci --only=production --ignore-scripts

# Stage 2: Build
FROM node:22.21.0-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Instalar todas las dependencias (incluidas devDependencies)
RUN npm ci --ignore-scripts && \
    cd server && npm ci --ignore-scripts && \
    cd ../client && npm ci --ignore-scripts

# Copiar código fuente
COPY . .

# Build de la aplicación web
RUN cd client && npm run build

# Stage 3: Production
FROM node:22.21.0-alpine

WORKDIR /app

# Instalar solo herramientas de sistema necesarias
RUN apk add --no-cache \
    sqlite \
    curl \
    dumb-init

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar node_modules de producción desde deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules
COPY --from=deps --chown=nodejs:nodejs /app/client/node_modules ./client/node_modules

# Copiar archivos necesarios desde builder
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/client/build ./client/build
COPY --from=builder --chown=nodejs:nodejs /app/client/vite.config.ts ./client/
COPY --from=builder --chown=nodejs:nodejs /app/client/svelte.config.js ./client/

# Crear directorios de datos con permisos apropiados
RUN mkdir -p data/input data/processed data/backup && \
    chown -R nodejs:nodejs data

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Healthcheck mejorado
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Iniciar aplicación directamente con node (sin npm)
WORKDIR /app
CMD ["node", "./node_modules/.bin/vite", "preview", "--config", "./client/vite.config.ts", "--host", "0.0.0.0", "--port", "3000"]
