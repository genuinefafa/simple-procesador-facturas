/**
 * API endpoint para listar TODOS los archivos
 * Combina archivos del filesystem + registros de BD
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const INPUT_DIR = join(process.cwd(), '..', 'data', 'input');

interface FileStatus {
	fileName: string;
	fileSize?: number;
	uploadedAt?: Date;
	exists: boolean; // ¿Existe el archivo físico?
	processed: boolean; // ¿Está procesado en BD?
	invoice?: {
		id: number;
		emitterCuit: string;
		emitterName: string;
		fullInvoiceNumber: string | null;
		total: number | null;
		issueDate: string | null;
		extractionConfidence: number | null;
		requiresReview: boolean;
	};
	error?: string;
}

export const GET: RequestHandler = async () => {
	try {
		const invoiceRepo = new InvoiceRepository();
		const filesMap = new Map<string, FileStatus>();

		// 1. Leer archivos del filesystem
		if (existsSync(INPUT_DIR)) {
			const files = readdirSync(INPUT_DIR);

			for (const fileName of files) {
				const filePath = join(INPUT_DIR, fileName);
				const stats = statSync(filePath);

				filesMap.set(fileName, {
					fileName,
					fileSize: stats.size,
					uploadedAt: stats.birthtime,
					exists: true,
					processed: false,
				});
			}
		}

		// 2. Leer facturas de la BD
		const invoices = invoiceRepo.list({ limit: 1000 });

		for (const invoice of invoices) {
			const fileName = invoice.originalFile;
			const filePath = join(INPUT_DIR, fileName);
			const fileExists = existsSync(filePath);

			const existing = filesMap.get(fileName);

			filesMap.set(fileName, {
				fileName,
				fileSize: existing?.fileSize,
				uploadedAt: existing?.uploadedAt,
				exists: fileExists,
				processed: true,
				invoice: {
					id: invoice.id,
					emitterCuit: invoice.emitterCuit,
					emitterName: invoice.emitterCuit, // TODO: lookup emitter name
					fullInvoiceNumber: invoice.fullInvoiceNumber,
					total: invoice.total,
					issueDate: invoice.issueDate,
					extractionConfidence: invoice.extractionConfidence,
					requiresReview: invoice.requiresReview,
				},
			});
		}

		// 3. Convertir a array y ordenar por fecha
		const filesList = Array.from(filesMap.values()).sort((a, b) => {
			if (!a.uploadedAt) return 1;
			if (!b.uploadedAt) return -1;
			return b.uploadedAt.getTime() - a.uploadedAt.getTime();
		});

		// 4. Estadísticas
		const stats = {
			total: filesList.length,
			uploaded: filesList.filter((f) => f.exists).length,
			processed: filesList.filter((f) => f.processed).length,
			pending: filesList.filter((f) => f.exists && !f.processed).length,
			missing: filesList.filter((f) => !f.exists && f.processed).length,
			needsReview: filesList.filter((f) => f.invoice?.requiresReview).length,
		};

		return json({
			success: true,
			stats,
			files: filesList,
		});
	} catch (error) {
		console.error('Error listing files:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Error desconocido',
			},
			{ status: 500 }
		);
	}
};
