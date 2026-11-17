# Tests

Suite de tests del procesador contable.

## 🧪 Estructura

```
tests/
├── unit/              # Tests unitarios
│   ├── validators/    # Tests de validación (CUIT, etc.)
│   ├── extractors/    # Tests de extractores
│   └── templates/     # Tests de template engine
├── integration/       # Tests de integración
│   ├── database/      # Tests de DB
│   └── processing/    # Tests de flujo completo
└── fixtures/          # Archivos de prueba
    ├── facturas/      # Facturas de ejemplo
    ├── templates/     # Templates de prueba
    └── expected/      # Resultados esperados
```

## 🚀 Ejecutar Tests

```bash
# Todos los tests
npm test

# Solo unitarios
npm run test:unit

# Solo integración
npm run test:integration

# Con cobertura
npm run test:coverage

# Watch mode
npm run test:watch
```

## 📝 Escribir Tests

### Test Unitario

```typescript
import { describe, it, expect } from 'vitest';
import { validateCUIT } from '../src/validators/cuit';

describe('validateCUIT', () => {
  it('debe validar un CUIT correcto', () => {
    expect(validateCUIT('30-71057829-6')).toBe(true);
  });

  it('debe rechazar un CUIT con DV incorrecto', () => {
    expect(validateCUIT('30-71057829-5')).toBe(false);
  });
});
```

### Test de Integración

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../src/database';

describe('Flujo de procesamiento completo', () => {
  let db: Database;

  beforeEach(() => {
    // Setup de DB de prueba
    db = new Database(':memory:');
  });

  it('debe procesar una factura de principio a fin', async () => {
    const result = await procesarFactura('tests/fixtures/facturas/test.pdf');
    expect(result.success).toBe(true);
    expect(result.invoice.cuit).toBe('30-71057829-6');
  });
});
```

## 📦 Fixtures

Los archivos en `fixtures/` son facturas de prueba **anónimas** para testing:

- **NO** contener datos reales de empresas
- Usar CUITs ficticios pero válidos (DV correcto)
- Cubrir diferentes formatos y casos edge

### Generar CUIT de prueba válido

```typescript
// Ejemplo: 30-12345678-X (calcular X)
const generarCUITTest = () => {
  const base = '3012345678';
  const dv = calcularDigitoVerificador(base);
  return `${base}${dv}`;
};
```

## 📊 Cobertura

Objetivo: **>80%** de cobertura de código.

Prioridades:
1. 🔴 100% validación de CUIT
2. 🔴 100% extractores core
3. 🟡 80% template engine
4. 🟢 70% CLI commands

## 🐛 Tests de Regresión

Cuando se encuentre un bug:

1. Crear un test que reproduzca el bug
2. Verificar que el test falla
3. Arreglar el bug
4. Verificar que el test pasa
5. Commit con test + fix

Esto previene que el bug vuelva a aparecer.
