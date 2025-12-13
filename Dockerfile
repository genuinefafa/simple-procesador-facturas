# Imagen de producción minimalista
# El código se compila en GitHub Actions antes de docker build
# SvelteKit adapter-node genera un ejecutable standalone

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

# Copiar solo lo compilado (client/build/index.js es un servidor Node standalone)
COPY --chown=nodejs:nodejs client/build ./client/build
COPY --chown=nodejs:nodejs server ./server

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

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Iniciar servidor compilado directamente
WORKDIR /app
CMD ["node", "client/build/index.js"]
