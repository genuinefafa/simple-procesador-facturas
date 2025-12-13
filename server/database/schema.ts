/**
 * Schema de base de datos usando Drizzle ORM
 * Este schema reemplaza el schema.sql para migraciones automáticas
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Forward declarations for circular references
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let _pendingFiles: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let _expectedInvoices: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let _facturas: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let _categories: any;

// =============================================================================
// TEMPLATES DE EXTRACCIÓN
// =============================================================================

const templatesExtraccion = sqliteTable(
  'templates_extraccion',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull().unique(),
    descripcion: text('descripcion'),
    categoria: text('categoria', {
      enum: ['SOFTWARE_COMERCIAL', 'AFIP_ELECTRONICA', 'MANUAL', 'GENERICO'],
    }).notNull(),

    // Configuración de extracción
    tipoDocumento: text('tipo_documento', {
      enum: ['PDF_DIGITAL', 'PDF_IMAGEN', 'IMAGEN'],
    }).notNull(),
    estrategia: text('estrategia', {
      enum: ['REGEX', 'OCR_ZONES', 'PDF_TEXT', 'HYBRID'],
    }).notNull(),
    configExtraccion: text('config_extraccion').notNull(), // JSON

    // Estadísticas
    emisoresUsando: integer('emisores_usando').default(0),
    facturasProce: integer('facturas_procesadas').default(0),
    facturasExitosas: integer('facturas_exitosas').default(0),
    confianzaPromedio: real('confianza_promedio').default(50.0),
    // Nota: tasa_exito es una columna generada, se crea via SQL en migration

    // Auditoría
    creadoDesdeEmisorCuit: text('creado_desde_emisor_cuit'),
    activo: integer('activo', { mode: 'boolean' }).default(true),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    categoriaIdx: index('idx_templates_categoria').on(table.categoria),
    confianzaIdx: index('idx_templates_confianza').on(table.confianzaPromedio),
    activoIdx: index('idx_templates_activo').on(table.activo),
    nombreIdx: index('idx_templates_nombre').on(table.nombre),
  })
);

export { templatesExtraccion };

// =============================================================================
// EMISORES
// =============================================================================

const emisores = sqliteTable(
  'emisores',
  {
    cuit: text('cuit').primaryKey(), // Formato: XX-XXXXXXXX-X
    cuitNumerico: text('cuit_numerico').notNull().unique(), // Sin guiones
    nombre: text('nombre').notNull(),
    razonSocial: text('razon_social'),
    aliases: text('aliases'), // JSON array

    // Relación con template
    templatePreferidoId: integer('template_preferido_id').references(() => templatesExtraccion.id),
    templateAutoDetectado: integer('template_auto_detectado', { mode: 'boolean' }).default(true),
    configOverride: text('config_override'), // JSON

    // Metadata
    tipoPersona: text('tipo_persona', { enum: ['FISICA', 'JURIDICA'] }),
    activo: integer('activo', { mode: 'boolean' }).default(true),
    primeraFacturaFecha: text('primera_factura_fecha'), // DATE
    ultimaFacturaFecha: text('ultima_factura_fecha'), // DATE
    totalFacturas: integer('total_facturas').default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nombreIdx: index('idx_emisores_nombre').on(table.nombre),
    cuitNumIdx: index('idx_emisores_cuit_num').on(table.cuitNumerico),
    templateIdx: index('idx_emisores_template').on(table.templatePreferidoId),
  })
);

export { emisores };

// =============================================================================
// CATEGORÍAS
// =============================================================================

const categories_ = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    description: text('description').notNull(),
    active: integer('active', { mode: 'boolean' }).default(true),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  () => ({})
);

export { categories_ as categories };

// =============================================================================
// IMPORTACIÓN DE EXCEL AFIP - LOTES
// =============================================================================

const importBatches_ = sqliteTable('import_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  totalRows: integer('total_rows').notNull(),
  importedRows: integer('imported_rows').notNull(),
  skippedRows: integer('skipped_rows').default(0),
  errorRows: integer('error_rows').default(0),
  importDate: text('import_date').default(sql`CURRENT_TIMESTAMP`),
  notes: text('notes'),
});

export { importBatches_ as importBatches };

// =============================================================================
// ARCHIVOS PENDIENTES
// =============================================================================

const pendingFiles_ = sqliteTable(
  'pending_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    originalFilename: text('original_filename').notNull(),
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size'),
    uploadDate: text('upload_date').default(sql`CURRENT_TIMESTAMP`),

    // Datos extraídos (pueden estar incompletos/nulos)
    extractedCuit: text('extracted_cuit'),
    extractedDate: text('extracted_date'),
    extractedTotal: real('extracted_total'),
    extractedType: text('extracted_type'),
    extractedPointOfSale: integer('extracted_point_of_sale'),
    extractedInvoiceNumber: integer('extracted_invoice_number'),

    extractionConfidence: integer('extraction_confidence'),
    extractionMethod: text('extraction_method'),
    extractionErrors: text('extraction_errors'),

    // Estados: pending, reviewing, processed, failed
    status: text('status', {
      enum: ['pending', 'reviewing', 'processed', 'failed'],
    }).default('pending'),

    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index('idx_pending_status').on(table.status),
    uploadDateIdx: index('idx_pending_upload_date').on(table.uploadDate),
  })
);

export { pendingFiles_ as pendingFiles };

// =============================================================================
// FACTURAS ESPERADAS (DESDE EXCEL AFIP)
// =============================================================================

const expectedInvoices_ = sqliteTable(
  'expected_invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    importBatchId: integer('import_batch_id').references(() => importBatches_.id, {
      onDelete: 'cascade',
    }),

    // Datos desde Excel AFIP (columnas típicas)
    cuit: text('cuit').notNull(),
    emitterName: text('emitter_name'),
    issueDate: text('issue_date').notNull(),
    invoiceType: text('invoice_type').notNull(),
    pointOfSale: integer('point_of_sale').notNull(),
    invoiceNumber: integer('invoice_number').notNull(),
    total: real('total'),

    // Datos adicionales opcionales
    cae: text('cae'),
    caeExpiration: text('cae_expiration'),
    currency: text('currency').default('ARS'),

    // Estado del matching
    status: text('status', {
      enum: ['pending', 'matched', 'discrepancy', 'manual', 'ignored'],
    }).default('pending'),
    matchedPendingFileId: integer('matched_pending_file_id').references(() => pendingFiles_.id, {
      onDelete: 'set null',
    }),
    matchConfidence: real('match_confidence'),

    // Metadata
    importDate: text('import_date').default(sql`CURRENT_TIMESTAMP`),
    notes: text('notes'),
  },
  (table) => ({
    cuitIdx: index('idx_expected_invoices_cuit').on(table.cuit),
    statusIdx: index('idx_expected_invoices_status').on(table.status),
    batchIdx: index('idx_expected_invoices_batch').on(table.importBatchId),
    issueDateIdx: index('idx_expected_invoices_date').on(table.issueDate),
    uniqueInvoice: index('unique_expected_invoice').on(
      table.cuit,
      table.invoiceType,
      table.pointOfSale,
      table.invoiceNumber
    ),
  })
);

export { expectedInvoices_ as expectedInvoices };

// =============================================================================
// FACTURAS
// =============================================================================

const facturas_ = sqliteTable(
  'facturas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    emisorCuit: text('emisor_cuit')
      .notNull()
      .references(() => emisores.cuit, { onDelete: 'cascade' }),
    templateUsadoId: integer('template_usado_id').references(() => templatesExtraccion.id, {
      onDelete: 'set null',
    }),

    // Datos de la factura
    fechaEmision: text('fecha_emision').notNull(),
    tipoComprobante: text('tipo_comprobante', {
      enum: ['A', 'B', 'C', 'E', 'M', 'X'],
    }).notNull(),
    puntoVenta: integer('punto_venta').notNull(),
    numeroComprobante: integer('numero_comprobante').notNull(),
    comprobanteCompleto: text('comprobante_completo').notNull(),
    total: real('total'),
    moneda: text('moneda', { enum: ['ARS', 'USD', 'EUR'] }).default('ARS'),

    // Archivos
    archivoOriginal: text('archivo_original').notNull(),
    archivoProcesado: text('archivo_procesado').notNull().unique(),
    tipoArchivo: text('tipo_archivo', {
      enum: ['PDF_DIGITAL', 'PDF_IMAGEN', 'IMAGEN'],
    }).notNull(),
    fileHash: text('file_hash'),

    // Calidad de extracción
    metodoExtraccion: text('metodo_extraccion', {
      enum: ['TEMPLATE', 'GENERICO', 'MANUAL'],
    }).notNull(),
    confianzaExtraccion: real('confianza_extraccion'),
    validadoManualmente: integer('validado_manualmente', { mode: 'boolean' }).default(false),
    requiereRevision: integer('requiere_revision', { mode: 'boolean' }).default(false),

    // Vinculación a datos de origen
    expectedInvoiceId: integer('expected_invoice_id').references(() => expectedInvoices_.id, {
      onDelete: 'set null',
    }),
    pendingFileId: integer('pending_file_id').references(() => pendingFiles_.id, {
      onDelete: 'set null',
    }),

    // Categorización
    categoryId: integer('category_id').references(() => categories_.id, {
      onDelete: 'set null',
    }),

    procesadoEn: text('procesado_en').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    emisorIdx: index('idx_facturas_emisor').on(table.emisorCuit),
    fechaIdx: index('idx_facturas_fecha').on(table.fechaEmision),
    comprobanteIdx: index('idx_facturas_comprobante').on(table.comprobanteCompleto),
    totalIdx: index('idx_facturas_total').on(table.total),
    templateIdx: index('idx_facturas_template').on(table.templateUsadoId),
    hashIdx: index('idx_facturas_hash').on(table.fileHash),
    revisionIdx: index('idx_facturas_revision').on(table.requiereRevision),
    expectedInvoiceIdx: index('idx_facturas_expected_invoice').on(table.expectedInvoiceId),
    pendingFileIdx: index('idx_facturas_pending_file').on(table.pendingFileId),
    categoryIdx: index('idx_facturas_category').on(table.categoryId),
    uniqueFactura: index('unique_factura').on(
      table.emisorCuit,
      table.tipoComprobante,
      table.puntoVenta,
      table.numeroComprobante
    ),
  })
);

export { facturas_ as facturas };

// =============================================================================
// HISTORIAL DE TEMPLATES POR EMISOR
// =============================================================================

const emisorTemplatesHistorial_ = sqliteTable(
  'emisor_templates_historial',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    emisorCuit: text('emisor_cuit')
      .notNull()
      .references(() => emisores.cuit, { onDelete: 'cascade' }),
    templateId: integer('template_id')
      .notNull()
      .references(() => templatesExtraccion.id, { onDelete: 'cascade' }),

    intentos: integer('intentos').default(0),
    exitos: integer('exitos').default(0),
    fallos: integer('fallos').default(0),

    ultimaPrueba: text('ultima_prueba'),
    promovidoAPreferido: integer('promovido_a_preferido', { mode: 'boolean' }).default(false),
  },
  (table) => ({
    emisorIdx: index('idx_historial_emisor').on(table.emisorCuit),
    templateIdx: index('idx_historial_template').on(table.templateId),
    uniqueEmisorTemplate: index('unique_emisor_template').on(table.emisorCuit, table.templateId),
  })
);

export { emisorTemplatesHistorial_ as emisorTemplatesHistorial };

// =============================================================================
// CORRECCIONES DE FACTURAS
// =============================================================================

const facturasCorrecciones_ = sqliteTable(
  'facturas_correcciones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    facturaId: integer('factura_id')
      .notNull()
      .references(() => facturas_.id, { onDelete: 'cascade' }),
    campo: text('campo').notNull(),
    valorOriginal: text('valor_original'),
    valorCorregido: text('valor_corregido').notNull(),
    corregidoEn: text('corregido_en').default(sql`CURRENT_TIMESTAMP`),
    aplicadoATemplate: integer('aplicado_a_template', { mode: 'boolean' }).default(false),
  },
  (table) => ({
    facturaIdx: index('idx_correcciones_factura').on(table.facturaId),
    campoIdx: index('idx_correcciones_campo').on(table.campo),
  })
);

export { facturasCorrecciones_ as facturasCorrecciones };

// =============================================================================
// ZONAS ANOTADAS
// =============================================================================

const facturasZonasAnotadas_ = sqliteTable(
  'facturas_zonas_anotadas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    facturaId: integer('factura_id')
      .notNull()
      .references(() => facturas_.id, { onDelete: 'cascade' }),
    campo: text('campo').notNull(),

    // Coordenadas de la zona
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),

    // Valor extraído
    valorExtraido: text('valor_extraido'),

    // Metadata
    anotadoEn: text('anotado_en').default(sql`CURRENT_TIMESTAMP`),
    anotadoPor: text('anotado_por').default('usuario'),
    usadoParaTemplate: integer('usado_para_template', { mode: 'boolean' }).default(false),
  },
  (table) => ({
    facturaIdx: index('idx_zonas_factura').on(table.facturaId),
    campoIdx: index('idx_zonas_campo').on(table.campo),
    templateIdx: index('idx_zonas_template').on(table.usadoParaTemplate),
  })
);

export { facturasZonasAnotadas_ as facturasZonasAnotadas };

// =============================================================================
// TIPOS TYPESCRIPT
// =============================================================================

export type TemplateExtraccion = typeof templatesExtraccion.$inferSelect;
export type NewTemplateExtraccion = typeof templatesExtraccion.$inferInsert;

export type Emisor = typeof emisores.$inferSelect;
export type NewEmisor = typeof emisores.$inferInsert;

export type Factura = typeof facturas_.$inferSelect;
export type NewFactura = typeof facturas_.$inferInsert;

export type EmisorTemplateHistorial = typeof emisorTemplatesHistorial_.$inferSelect;
export type NewEmisorTemplateHistorial = typeof emisorTemplatesHistorial_.$inferInsert;

export type FacturaCorreccion = typeof facturasCorrecciones_.$inferSelect;
export type NewFacturaCorreccion = typeof facturasCorrecciones_.$inferInsert;

export type FacturaZonaAnotada = typeof facturasZonasAnotadas_.$inferSelect;
export type NewFacturaZonaAnotada = typeof facturasZonasAnotadas_.$inferInsert;

export type PendingFile = typeof pendingFiles_.$inferSelect;
export type NewPendingFile = typeof pendingFiles_.$inferInsert;

export type ImportBatch = typeof importBatches_.$inferSelect;
export type NewImportBatch = typeof importBatches_.$inferInsert;

export type ExpectedInvoice = typeof expectedInvoices_.$inferSelect;
export type NewExpectedInvoice = typeof expectedInvoices_.$inferInsert;

export type Category = typeof categories_.$inferSelect;
export type NewCategory = typeof categories_.$inferInsert;
