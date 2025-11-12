# GitHub Actions Workflows

Este directorio contiene los workflows de CI/CD del proyecto.

## 🔄 Workflows Activos

### `ci.yml` - Continuous Integration

**Trigger:** Push a cualquier branch, Pull Requests a main/master

**Jobs:**

1. **Code Quality**
   - ✅ Prettier (formateo)
   - ✅ ESLint (linting)

2. **Build & Type Check**
   - ✅ Compila TypeScript
   - ✅ Matrix: Node.js 18, 20, 22
   - 📦 Sube artifacts (dist/)

3. **Tests & Coverage**
   - ✅ Ejecuta tests con Vitest
   - 📊 Genera reporte de cobertura
   - 📤 Sube a Codecov (si está configurado)
   - 💬 Comenta cobertura en PRs

4. **Security Audit**
   - 🔒 npm audit (producción)
   - ⚠️ npm audit (todas las deps)

5. **CI Summary**
   - 📋 Genera resumen de todos los jobs
   - ❌ Falla si algún job falló

### `dependencies.yml` - Dependency Updates

**Trigger:**
- Semanal (lunes 9 AM UTC)
- Manual (workflow_dispatch)

**Acciones:**
- 📦 Busca paquetes desactualizados
- 🔒 Ejecuta audit de seguridad
- 🐛 Crea issue si hay vulnerabilidades

## 📊 Badges

Para agregar badges al README:

```markdown
[![CI](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml/badge.svg)](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml)
```

## 🔧 Configuración

### Secrets necesarios

- `CODECOV_TOKEN` (opcional): Para subir reportes de cobertura a Codecov
- `GITHUB_TOKEN`: Automáticamente provisto por GitHub Actions

### Variables de entorno

Ninguna configuración adicional requerida. Los workflows usan configuración por defecto del proyecto.

## 📝 Notas

- Los workflows se ejecutan en `ubuntu-latest`
- Se usa npm cache para acelerar instalaciones
- Los artifacts se mantienen por 7-30 días según el tipo
- Coverage threshold: 70% (configurable en `vitest.config.ts`)

## 🚀 Ejecutar localmente

Para simular el CI localmente:

```bash
# Code quality
npm run format:check
npm run lint

# Build
npm run build

# Tests con coverage
npm run test:coverage

# Security audit
npm audit --omit=dev
```

## 🔄 Actualizar workflows

Para modificar los workflows:

1. Editá el archivo YAML correspondiente
2. Commiteá y pusheá
3. Verificá la ejecución en la pestaña "Actions" de GitHub
4. Revisá logs si hay errores

## 📚 Documentación

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Workflow syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [Actions marketplace](https://github.com/marketplace?type=actions)
