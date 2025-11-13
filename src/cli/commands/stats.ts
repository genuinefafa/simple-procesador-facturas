/**
 * Comando para mostrar estadísticas
 */

import { Command } from 'commander';
import { EmitterRepository, InvoiceRepository } from '../../database';

export function createStatsCommand(): Command {
  const command = new Command('stats');

  command.description('Muestra estadísticas del sistema').action(() => {
    const emitterRepo = new EmitterRepository();
    const invoiceRepo = new InvoiceRepository();

    console.info('📊 Estadísticas del Sistema\n');

    // Estadísticas de facturas
    const totalInvoices = invoiceRepo.count();
    const reviewPending = invoiceRepo.count({ requiresReview: true });

    console.info('Facturas:');
    console.info(`  Total procesadas: ${totalInvoices}`);
    console.info(`  Pendientes de revisión: ${reviewPending}`);
    console.info('');

    // Estadísticas de emisores
    const emitters = emitterRepo.list({ active: true });

    console.info('Emisores:');
    console.info(`  Total registrados: ${emitters.length}`);
    console.info('');

    // Top 5 emisores por cantidad de facturas
    const emittersWithStats = emitters
      .map((emitter) => {
        const stats = emitterRepo.getStats(emitter.cuit);
        return {
          cuit: emitter.cuit,
          name: emitter.name,
          invoices: stats?.totalInvoices || 0,
          total: stats?.totalAmount || 0,
        };
      })
      .sort((a, b) => b.invoices - a.invoices)
      .slice(0, 5);

    if (emittersWithStats.length > 0) {
      console.info('Top 5 emisores (por cantidad de facturas):');
      for (const emitter of emittersWithStats) {
        console.info(
          `  ${emitter.name} (${emitter.cuit}): ${emitter.invoices} facturas - $${emitter.total.toFixed(2)}`
        );
      }
      console.info('');
    }
  });

  return command;
}
