CREATE TABLE `emisor_templates_historial` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`emisor_cuit` text NOT NULL,
	`template_id` integer NOT NULL,
	`intentos` integer DEFAULT 0,
	`exitos` integer DEFAULT 0,
	`fallos` integer DEFAULT 0,
	`ultima_prueba` text,
	`promovido_a_preferido` integer DEFAULT false,
	FOREIGN KEY (`emisor_cuit`) REFERENCES `emisores`(`cuit`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates_extraccion`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_historial_emisor` ON `emisor_templates_historial` (`emisor_cuit`);--> statement-breakpoint
CREATE INDEX `idx_historial_template` ON `emisor_templates_historial` (`template_id`);--> statement-breakpoint
CREATE INDEX `unique_emisor_template` ON `emisor_templates_historial` (`emisor_cuit`,`template_id`);--> statement-breakpoint
CREATE TABLE `emisores` (
	`cuit` text PRIMARY KEY NOT NULL,
	`cuit_numerico` text NOT NULL,
	`nombre` text NOT NULL,
	`razon_social` text,
	`aliases` text,
	`template_preferido_id` integer,
	`template_auto_detectado` integer DEFAULT true,
	`config_override` text,
	`tipo_persona` text,
	`activo` integer DEFAULT true,
	`primera_factura_fecha` text,
	`ultima_factura_fecha` text,
	`total_facturas` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`template_preferido_id`) REFERENCES `templates_extraccion`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emisores_cuit_numerico_unique` ON `emisores` (`cuit_numerico`);--> statement-breakpoint
CREATE INDEX `idx_emisores_nombre` ON `emisores` (`nombre`);--> statement-breakpoint
CREATE INDEX `idx_emisores_cuit_num` ON `emisores` (`cuit_numerico`);--> statement-breakpoint
CREATE INDEX `idx_emisores_template` ON `emisores` (`template_preferido_id`);--> statement-breakpoint
CREATE TABLE `facturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`emisor_cuit` text NOT NULL,
	`template_usado_id` integer,
	`fecha_emision` text NOT NULL,
	`tipo_comprobante` text NOT NULL,
	`punto_venta` integer NOT NULL,
	`numero_comprobante` integer NOT NULL,
	`comprobante_completo` text NOT NULL,
	`total` real,
	`moneda` text DEFAULT 'ARS',
	`archivo_original` text NOT NULL,
	`archivo_procesado` text NOT NULL,
	`tipo_archivo` text NOT NULL,
	`file_hash` text,
	`metodo_extraccion` text NOT NULL,
	`confianza_extraccion` real,
	`validado_manualmente` integer DEFAULT false,
	`requiere_revision` integer DEFAULT false,
	`procesado_en` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`emisor_cuit`) REFERENCES `emisores`(`cuit`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_usado_id`) REFERENCES `templates_extraccion`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facturas_archivo_procesado_unique` ON `facturas` (`archivo_procesado`);--> statement-breakpoint
CREATE INDEX `idx_facturas_emisor` ON `facturas` (`emisor_cuit`);--> statement-breakpoint
CREATE INDEX `idx_facturas_fecha` ON `facturas` (`fecha_emision`);--> statement-breakpoint
CREATE INDEX `idx_facturas_comprobante` ON `facturas` (`comprobante_completo`);--> statement-breakpoint
CREATE INDEX `idx_facturas_total` ON `facturas` (`total`);--> statement-breakpoint
CREATE INDEX `idx_facturas_template` ON `facturas` (`template_usado_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_hash` ON `facturas` (`file_hash`);--> statement-breakpoint
CREATE INDEX `idx_facturas_revision` ON `facturas` (`requiere_revision`);--> statement-breakpoint
CREATE INDEX `unique_factura` ON `facturas` (`emisor_cuit`,`tipo_comprobante`,`punto_venta`,`numero_comprobante`);--> statement-breakpoint
CREATE TABLE `facturas_correcciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`factura_id` integer NOT NULL,
	`campo` text NOT NULL,
	`valor_original` text,
	`valor_corregido` text NOT NULL,
	`corregido_en` text DEFAULT CURRENT_TIMESTAMP,
	`aplicado_a_template` integer DEFAULT false,
	FOREIGN KEY (`factura_id`) REFERENCES `facturas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_correcciones_factura` ON `facturas_correcciones` (`factura_id`);--> statement-breakpoint
CREATE INDEX `idx_correcciones_campo` ON `facturas_correcciones` (`campo`);--> statement-breakpoint
CREATE TABLE `facturas_zonas_anotadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`factura_id` integer NOT NULL,
	`campo` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`valor_extraido` text,
	`anotado_en` text DEFAULT CURRENT_TIMESTAMP,
	`anotado_por` text DEFAULT 'usuario',
	`usado_para_template` integer DEFAULT false,
	FOREIGN KEY (`factura_id`) REFERENCES `facturas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_zonas_factura` ON `facturas_zonas_anotadas` (`factura_id`);--> statement-breakpoint
CREATE INDEX `idx_zonas_campo` ON `facturas_zonas_anotadas` (`campo`);--> statement-breakpoint
CREATE INDEX `idx_zonas_template` ON `facturas_zonas_anotadas` (`usado_para_template`);--> statement-breakpoint
CREATE TABLE `templates_extraccion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`categoria` text NOT NULL,
	`tipo_documento` text NOT NULL,
	`estrategia` text NOT NULL,
	`config_extraccion` text NOT NULL,
	`emisores_usando` integer DEFAULT 0,
	`facturas_procesadas` integer DEFAULT 0,
	`facturas_exitosas` integer DEFAULT 0,
	`confianza_promedio` real DEFAULT 50,
	`creado_desde_emisor_cuit` text,
	`activo` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_extraccion_nombre_unique` ON `templates_extraccion` (`nombre`);--> statement-breakpoint
CREATE INDEX `idx_templates_categoria` ON `templates_extraccion` (`categoria`);--> statement-breakpoint
CREATE INDEX `idx_templates_confianza` ON `templates_extraccion` (`confianza_promedio`);--> statement-breakpoint
CREATE INDEX `idx_templates_activo` ON `templates_extraccion` (`activo`);--> statement-breakpoint
CREATE INDEX `idx_templates_nombre` ON `templates_extraccion` (`nombre`);