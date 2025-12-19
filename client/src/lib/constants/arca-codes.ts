/**
 * Códigos ARCA de tipos de comprobantes
 * Fuente: AFIP - RG 1415
 */

export const ARCA_INVOICE_TYPES = [
  { code: 1, friendlyType: 'FACA', description: 'Factura A', icon: '📄' },
  { code: 6, friendlyType: 'FACB', description: 'Factura B', icon: '📋' },
  { code: 11, friendlyType: 'FACC', description: 'Factura C', icon: '📑' },
  { code: 19, friendlyType: 'FACE', description: 'Factura E', icon: '📄' },
  { code: 51, friendlyType: 'FACM', description: 'Factura M', icon: '📄' },
  { code: 3, friendlyType: 'NCRA', description: 'Nota de Crédito A', icon: '↩️' },
  { code: 8, friendlyType: 'NCRB', description: 'Nota de Crédito B', icon: '↩️' },
  { code: 13, friendlyType: 'NCRC', description: 'Nota de Crédito C', icon: '↩️' },
  { code: 2, friendlyType: 'NDBA', description: 'Nota de Débito A', icon: '➡️' },
  { code: 7, friendlyType: 'NDBB', description: 'Nota de Débito B', icon: '➡️' },
  { code: 12, friendlyType: 'NDBC', description: 'Nota de Débito C', icon: '➡️' },
] as const;
