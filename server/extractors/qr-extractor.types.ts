/**
 * Types for AFIP/ARCA QR code extraction
 *
 * Based on AFIP specification for electronic invoice QR codes.
 * QR encodes URL: https://www.afip.gob.ar/fe/qr/?p={BASE64_JSON}
 */

/**
 * Raw AFIP QR JSON payload (as decoded from Base64)
 * All fields match AFIP specification exactly
 */
export interface AFIPQRData {
  /** Version (currently always 1) */
  ver: number;
  /** Issue date in ISO format (YYYY-MM-DD) - may be false/missing in malformed QRs */
  fecha: string | false;
  /** Issuer CUIT as 11-digit number (no dashes) */
  cuit: number;
  /** Point of sale (up to 5 digits) */
  ptoVta: number;
  /** Document type code - ARCA code (1=FAC A, 6=FAC B, 11=FAC C, etc.) */
  tipoCmp: number;
  /** Invoice number (up to 8 digits) */
  nroCmp: number;
  /** Total amount */
  importe: number;
  /** Currency code (PES=ARS, DOL=USD, EUR=EUR) */
  moneda: string;
  /** Exchange rate (1 for ARS) */
  ctz: number;
  /** Recipient document type (optional) */
  tipoDocRec?: number;
  /** Recipient document number (optional) */
  nroDocRec?: number;
  /** Authorization type: E=CAE, A=CAEA */
  tipoCodAut: 'E' | 'A';
  /** Authorization code (CAE/CAEA - 14 digits) */
  codAut: number;
}

/**
 * Result of QR detection step
 */
export interface QRDetectionResult {
  found: boolean;
  rawData?: string;
  error?: string;
}

/**
 * Result of AFIP URL parsing step
 */
export interface AFIPUrlParseResult {
  valid: boolean;
  data?: AFIPQRData;
  error?: string;
}
