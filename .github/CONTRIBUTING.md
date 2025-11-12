# Guía de Contribución

¡Gracias por tu interés en contribuir al Procesador Inteligente de Facturas! 🎉

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [¿Cómo puedo contribuir?](#cómo-puedo-contribuir)
- [Configuración del entorno](#configuración-del-entorno)
- [Proceso de desarrollo](#proceso-de-desarrollo)
- [Guías de estilo](#guías-de-estilo)
- [Commits](#commits)
- [Pull Requests](#pull-requests)

## Código de Conducta

Este proyecto adhiere a un código de conducta. Al participar, se espera que mantengas este código. Reportá comportamientos inaceptables creando un issue.

## ¿Cómo puedo contribuir?

### Reportar Bugs

- Usá el [template de bug report](.github/ISSUE_TEMPLATE/bug_report.md)
- Incluí pasos detallados para reproducir el problema
- Incluí información del entorno (OS, Node.js, versión)
- Si es posible, incluí archivos de ejemplo (sin datos sensibles)

### Sugerir Mejoras

- Usá el [template de feature request](.github/ISSUE_TEMPLATE/feature_request.md)
- Explicá el caso de uso claramente
- Considerá si la feature es útil para la mayoría de usuarios

### Contribuir Código

1. Forkeá el repositorio
2. Creá un branch desde `main` (`git checkout -b feature/mi-feature`)
3. Hacé tus cambios
4. Pusheá a tu fork
5. Abrí un Pull Request

## Configuración del entorno

### Requisitos

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Setup

```bash
# Clonar el repositorio
git clone https://github.com/genuinefafa/simple-procesador-facturas.git
cd simple-procesador-facturas

# Instalar dependencias
npm install

# Copiar configuraciones de VS Code (opcional)
cp .vscode/settings.json.example .vscode/settings.json
cp .vscode/launch.json.example .vscode/launch.json

# Inicializar base de datos
npm run db:init

# Poblar con datos de prueba
npm run db:seed

# Compilar
npm run build

# Ejecutar tests
npm test
```

## Proceso de desarrollo

### 1. Crear un branch

```bash
git checkout -b tipo/descripcion-corta
```

Tipos de branches:
- `feature/` - Nuevas funcionalidades
- `fix/` - Corrección de bugs
- `docs/` - Cambios en documentación
- `refactor/` - Refactoring sin cambio funcional
- `test/` - Agregar o mejorar tests
- `chore/` - Mantenimiento, dependencias, etc.

### 2. Desarrollar

```bash
# Modo watch para desarrollo
npm run dev

# Ejecutar tests en watch mode
npm run test:watch

# Verificar linting
npm run lint

# Verificar formateo
npm run format:check
```

### 3. Verificar calidad

Antes de commitear, asegurate que todo pasa:

```bash
# Linting
npm run lint

# Formateo
npm run format

# Build
npm run build

# Tests con cobertura
npm run test:coverage
```

## Guías de estilo

### Código

- **Lenguaje**: TypeScript estricto
- **Formateo**: Prettier (configurado en `.prettierrc`)
- **Linting**: ESLint 9 (configurado en `eslint.config.js`)
- **Comentarios**: En español (proyecto argentino)
- **Nombres de variables/funciones**: En inglés (claridad técnica)

### Ejemplo de código comentado

```typescript
/**
 * Valida un CUIT argentino usando el algoritmo módulo 11
 * @param cuit - CUIT en formato XX-XXXXXXXX-X o sin guiones
 * @returns true si el CUIT es válido
 */
export function validateCUIT(cuit: string): boolean {
  // Remover guiones y validar longitud
  const cleaned = cuit.replace(/-/g, '');

  if (cleaned.length !== 11) {
    return false;
  }

  // Calcular dígito verificador
  const dv = calculateVerificationDigit(cleaned.slice(0, 10));
  return dv === parseInt(cleaned[10]);
}
```

### Tests

- Usar Vitest
- Estructura: Arrange, Act, Assert
- Nombres descriptivos en español
- Un test por caso

```typescript
describe('validateCUIT', () => {
  it('debe validar un CUIT correcto con guiones', () => {
    expect(validateCUIT('30-71057829-6')).toBe(true);
  });

  it('debe validar un CUIT correcto sin guiones', () => {
    expect(validateCUIT('30710578296')).toBe(true);
  });

  it('debe rechazar un CUIT con DV incorrecto', () => {
    expect(validateCUIT('30-71057829-5')).toBe(false);
  });
});
```

## Commits

### Formato de mensaje

```
tipo: descripción corta

Descripción más detallada si es necesaria.

Detalles adicionales:
- Punto 1
- Punto 2
```

### Tipos de commit

- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Cambios en documentación
- `style`: Formateo, punto y coma, etc (sin cambio de código)
- `refactor`: Refactoring sin cambio funcional
- `test`: Agregar o corregir tests
- `chore`: Mantenimiento, dependencias, builds

### Ejemplos

```bash
feat: agrega validación de CUIT con algoritmo módulo 11

fix: corrige extracción de fecha en PDFs AFIP

docs: actualiza README con instrucciones de instalación

test: agrega tests para extractor de OCR
```

## Pull Requests

### Antes de crear el PR

- [ ] Los tests pasan localmente (`npm test`)
- [ ] El código compila sin errores (`npm run build`)
- [ ] El linting pasa (`npm run lint`)
- [ ] El código está formateado (`npm run format`)
- [ ] Agregaste/actualizaste tests
- [ ] Actualizaste documentación si es necesario

### Crear el PR

1. Pusheá tu branch al fork
2. Abrí un PR contra `main` en el repo original
3. Completá el template de PR
4. Esperá el review y los checks de CI

### Durante el review

- Respondé a los comentarios
- Hacé los cambios solicitados
- Pusheá los cambios (no forces push a menos que sea necesario)
- Re-requestá review cuando esté listo

### Merge

- Los PRs serán mergeados por maintainers después de:
  - ✅ Todos los checks de CI pasen
  - ✅ Al menos un review aprobado
  - ✅ Conflictos resueltos
  - ✅ Cobertura de tests mantenida/mejorada

## Cobertura de Tests

El proyecto mantiene un objetivo de **70% de cobertura** mínima.

Los PRs que reduzcan la cobertura por debajo del threshold serán rechazados a menos que haya una buena razón.

## Preguntas

Si tenés preguntas, podés:
- Abrir un issue con la etiqueta `question`
- Revisar la documentación en `/docs`
- Revisar issues existentes

## Reconocimientos

Todos los contribuidores serán reconocidos en el proyecto. ¡Gracias por tu ayuda! 🙏
