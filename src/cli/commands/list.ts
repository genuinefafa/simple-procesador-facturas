/**
 * Comando para listar facturas procesadas
 */

import { Command } from 'commander';
import { InvoiceRepository } from '../../database';

export function createListCommand(): Command {
  const command = new Command('list');

  command
    .description('Lista facturas procesadas')
    .option('-l, --limit <number>', 'Cantidad de facturas a mostrar', '10')
    .option('-e, --emitter <cuit>', 'Filtrar por emisor (CUIT)')
    .option('-r, --review-only', 'Solo facturas que requieren revisión')
    .action((options: { limit: string; emitter?: string; reviewOnly?: boolean }) => {
      const limit = parseInt(options.limit, 10);
      const invoiceRepo = new InvoiceRepository();

      console.info('📋 Facturas procesadas\n');

      const filters: Parameters<typeof invoiceRepo.list>[0] = {
        limit,
      };

      if (options.emitter) {
        filters.emitterCuit = options.emitter;
      }

      if (options.reviewOnly) {
        filters.requiresReview = true;
      }

      const invoices = invoiceRepo.list(filters);

      if (invoices.length === 0) {
        console.info('ℹ️  No hay facturas procesadas');
        return;
      }

      console.info(`Total: ${invoices.length} factura(s)\n`);

      // Mostrar tabla
      console.info('ID  | Emisor CUIT      | Comprobante          | Fecha      | Total');
      console.info('-'.repeat(75));

      for (const invoice of invoices) {
        const id = String(invoice.id).padStart(3, ' ');
        const cuit = invoice.emitterCuit.padEnd(16, ' ');
        const comprobante = invoice.fullInvoiceNumber.padEnd(20, ' ');
        const fecha = String(invoice.issueDate).slice(0, 10);
        const total = `$${typeof invoice.total === 'number' ? invoice.total.toFixed(2) : invoice.total}`;

        let line = `${id} | ${cuit} | ${comprobante} | ${fecha} | ${total}`;

        if (invoice.requiresReview) {
          line += ' ⚠️';
        }

        console.info(line);
      }

      console.info('');
    });

  return command;
}
