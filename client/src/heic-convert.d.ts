/**
 * Type declarations for heic-convert package
 * https://www.npmjs.com/package/heic-convert
 */
declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    quality?: number; // 0-1 for JPEG
  }

  function convert(options: ConvertOptions): Promise<ArrayBuffer>;

  export default convert;
}
