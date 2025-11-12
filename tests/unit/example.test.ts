/**
 * Test de ejemplo para verificar que Vitest funciona
 */

import { describe, it, expect } from 'vitest';

describe('Setup del proyecto', () => {
  it('debe ejecutar tests correctamente', () => {
    expect(true).toBe(true);
  });

  it('debe tener soporte para matemáticas básicas', () => {
    expect(2 + 2).toBe(4);
  });

  it('debe tener soporte para strings', () => {
    const mensaje = 'Hola Mundo';
    expect(mensaje).toContain('Mundo');
  });
});
