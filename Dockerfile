# Multi-stage build para optimizar tamaño de imagen

# Stage 1: Build
FROM node:22.21.0-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY client/package*.json ./client/

# Instalar dependencias
RUN npm ci --only=production && \
    cd client && npm ci --only=production

# Copiar código fuente
COPY . .

# Build de la aplicación web
RUN cd client && npm run build

# Stage 2: Production
FROM node:22.21.0-alpine

WORKDIR /app

# Instalar solo dependencias de producción necesarias
RUN apk add --no-cache \
    sqlite \
    curl

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar archivos necesarios desde builder
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nodejs:nodejs /app/drizzle.config.ts ./
COPY --from=builder --chown=nodejs:nodejs /app/client/build ./client/build
COPY --from=builder --chown=nodejs:nodejs /app/client/package*.json ./client/
COPY --from=builder --chown=nodejs:nodejs /app/client/node_modules ./client/node_modules

# Crear directorios de datos
RUN mkdir -p data/input data/processed data/backup && \
    chown -R nodejs:nodejs data

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Iniciar aplicación
WORKDIR /app/client
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
