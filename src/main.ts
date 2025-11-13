#!/usr/bin/env node

/**
 * Punto de entrada principal del procesador de facturas
 */

import { Command } from 'commander';
import { createProcessCommand, createListCommand, createStatsCommand } from './cli';

const program = new Command();

program
  .name('procesador')
  .description('Procesador Inteligente de Facturas Argentinas')
  .version('0.1.0');

// Registrar comandos
program.addCommand(createProcessCommand());
program.addCommand(createListCommand());
program.addCommand(createStatsCommand());

// Parsear argumentos
program.parse(process.argv);

// Si no se proporciona ningún comando, mostrar ayuda
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
