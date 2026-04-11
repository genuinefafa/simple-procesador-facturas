/**
 * Tests para el extractor de QR AFIP/ARCA
 *
 * Casos cubiertos:
 * - JSON bien formado → se parsea sin cambios
 * - JSON mal formado con valores vacíos (ARCA, consumidor final sin DNI)
 *   → se sanitiza reemplazando por `null` antes de reintentar el parseo
 */

import { describe, it, expect } from 'vitest';
import { parseAFIPJson } from '../../../extractors/qr-extractor';

describe('parseAFIPJson', () => {
  it('parsea JSON bien formado sin modificaciones', () => {
    const jsonStr =
      '{"ver":1,"fecha":"2026-03-01","cuit":30714928577,"ptoVta":1,"tipoCmp":6,"nroCmp":2716880,"importe":22394.00,"moneda":"PES","ctz":1.000000,"tipoDocRec":80,"nroDocRec":30714928577,"tipoCodAut":"E","codAut":86096046232780}';

    const data = parseAFIPJson(jsonStr);

    expect(data.ver).toBe(1);
    expect(data.cuit).toBe(30714928577);
    expect(data.nroDocRec).toBe(30714928577);
  });

  it('sanitiza valores vacíos en medio del JSON (nroDocRec sin valor)', () => {
    // Caso real de ARCA con consumidor final sin DNI
    const jsonStr =
      '{"ver":1,"fecha":"2026-03-01","cuit":30714928577,"ptoVta":1,"tipoCmp":6,"nroCmp":2716880,"importe":22394.00,"moneda":"PES","ctz":1.000000,"tipoDocRec":99,"nroDocRec":,"tipoCodAut":"E","codAut":86096046232780}';

    const data = parseAFIPJson(jsonStr);

    expect(data.cuit).toBe(30714928577);
    expect(data.fecha).toBe('2026-03-01');
    expect(data.importe).toBe(22394.0);
    expect(data.nroDocRec).toBeNull();
  });

  it('sanitiza valor vacío al final del objeto', () => {
    const jsonStr = '{"ver":1,"cuit":30714928577,"nroDocRec":}';

    const data = parseAFIPJson(jsonStr);

    expect(data.ver).toBe(1);
    expect(data.cuit).toBe(30714928577);
    expect(data.nroDocRec).toBeNull();
  });

  it('sanitiza múltiples valores vacíos en el mismo JSON', () => {
    const jsonStr = '{"a":1,"b":,"c":"ok","d":,"e":2}';

    const data = parseAFIPJson(jsonStr) as unknown as Record<string, unknown>;

    expect(data.a).toBe(1);
    expect(data.b).toBeNull();
    expect(data.c).toBe('ok');
    expect(data.d).toBeNull();
    expect(data.e).toBe(2);
  });

  it('no afecta strings que contienen ":" seguido de un carácter válido', () => {
    const jsonStr = '{"url":"https://afip.gob.ar:443/path","cuit":30714928577}';

    const data = parseAFIPJson(jsonStr) as unknown as Record<string, unknown>;

    expect(data.url).toBe('https://afip.gob.ar:443/path');
    expect(data.cuit).toBe(30714928577);
  });

  it('lanza error si el JSON es irreparablemente inválido', () => {
    expect(() => parseAFIPJson('{esto no es json}')).toThrow();
  });
});
