/**
 * Schema de base de datos usando Drizzle ORM
 * Este schema reemplaza el schema.sql para migraciones automáticas
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// TEMPLATES DE EXTRACCIÓN
// =============================================================================

export const templatesExtraccion = sqliteTable(
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

// =============================================================================
// EMISORES
// =============================================================================

export const emisores = sqliteTable(
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

// =============================================================================
// FACTURAS
// =============================================================================

export const facturas = sqliteTable(
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
    fechaEmision: text('fecha_emision').notNull(), // DATE
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
    // UNIQUE constraint: no duplicar facturas del mismo emisor
    uniqueFactura: index('unique_factura').on(
      table.emisorCuit,
      table.tipoComprobante,
      table.puntoVenta,
      table.numeroComprobante
    ),
  })
);

// =============================================================================
// HISTORIAL DE TEMPLATES POR EMISOR
// =============================================================================

export const emisorTemplatesHistorial = sqliteTable(
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
    // Nota: tasa_exito es una columna generada, se crea via SQL en migration

    ultimaPrueba: text('ultima_prueba'), // DATETIME
    promovidoAPreferido: integer('promovido_a_preferido', { mode: 'boolean' }).default(false),
  },
  (table) => ({
    emisorIdx: index('idx_historial_emisor').on(table.emisorCuit),
    templateIdx: index('idx_historial_template').on(table.templateId),
    // Nota: unique constraint se creará via SQL
    uniqueEmisorTemplate: index('unique_emisor_template').on(table.emisorCuit, table.templateId),
  })
);

// =============================================================================
// CORRECCIONES DE FACTURAS
// =============================================================================

export const facturasCorrecciones = sqliteTable(
  'facturas_correcciones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    facturaId: integer('factura_id')
      .notNull()
      .references(() => facturas.id, { onDelete: 'cascade' }),
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

// =============================================================================
// ZONAS ANOTADAS
// =============================================================================

export const facturasZonasAnotadas = sqliteTable(
  'facturas_zonas_anotadas',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    facturaId: integer('factura_id')
      .notNull()
      .references(() => facturas.id, { onDelete: 'cascade' }),
    campo: text('campo').notNull(), // 'cuit', 'fecha', 'total', 'punto_venta', 'numero', 'tipo'

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

// =============================================================================
// TIPOS TYPESCRIPT
// =============================================================================

export type TemplateExtraccion = typeof templatesExtraccion.$inferSelect;
export type NewTemplateExtraccion = typeof templatesExtraccion.$inferInsert;

export type Emisor = typeof emisores.$inferSelect;
export type NewEmisor = typeof emisores.$inferInsert;

export type Factura = typeof facturas.$inferSelect;
export type NewFactura = typeof facturas.$inferInsert;

export type EmisorTemplateHistorial = typeof emisorTemplatesHistorial.$inferSelect;
export type NewEmisorTemplateHistorial = typeof emisorTemplatesHistorial.$inferInsert;

export type FacturaCorreccion = typeof facturasCorrecciones.$inferSelect;
export type NewFacturaCorreccion = typeof facturasCorrecciones.$inferInsert;

export type FacturaZonaAnotada = typeof facturasZonasAnotadas.$inferSelect;
export type NewFacturaZonaAnotada = typeof facturasZonasAnotadas.$inferInsert;

// =============================================================================
// ARCHIVOS PENDIENTES
// =============================================================================

export const pendingFiles = sqliteTable(
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
    extractionErrors: text('extraction_errors'), // JSON con array de errores

    // Estados: pending, reviewing, processed, failed
    status: text('status', {
      enum: ['pending', 'reviewing', 'processed', 'failed'],
    }).default('pending'),

    // Referencia a factura final (si se completó)
    invoiceId: integer('invoice_id').references(() => facturas.id, { onDelete: 'set null' }),

    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index('idx_pending_status').on(table.status),
    uploadDateIdx: index('idx_pending_upload_date').on(table.uploadDate),
    invoiceIdx: index('idx_pending_invoice').on(table.invoiceId),
  })
);

export type PendingFile = typeof pendingFiles.$inferSelect;
export type NewPendingFile = typeof pendingFiles.$inferInsert;
