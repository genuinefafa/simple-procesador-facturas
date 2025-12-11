/**
 * Helper para cargar configuración de forma segura
 * Intenta cargar config.json, si no existe usa config.json.example
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  directories: {
    input: string;
    processed: string;
    backup: string;
    exports: string;
  };
  database: {
    path: string;
  };
  ocr: {
    engine: string;
    language: string;
    dpi: number;
    preprocessingEnabled: boolean;
  };
  processing: {
    autoProcess: boolean;
    watchDirectory: boolean;
    confidenceThreshold: number;
    requireManualValidation: boolean;
    parallelWorkers: number;
  };
  templates: {
    autoDetect: boolean;
    maxAttempts: number;
    fallbackToGeneric: boolean;
  };
  files: {
    namingFormat: string;
    dateFormat: string;
    moveToProcessed: boolean;
    createBackup: boolean;
    calculateHash: boolean;
  };
  google?: {
    enabled: boolean;
    credentialsPath: string;
    sheets: {
      spreadsheetId: string;
      sheets: {
        emisores: { name: string; range: string };
        facturas: { name: string; range: string };
        esperadas: { name: string; range: string };
        logs: { name: string; range: string };
      };
    };
    drive: {
      rootFolderId: string;
      folderStructure: {
        originales: string;
        procesados: string;
      };
    };
  };
}

/**
 * Carga la configuración desde config.json o config.json.example
 */
export function loadConfig(): Config {
  const configPath = path.join(process.cwd(), 'server', 'config.json');
  const examplePath = path.join(process.cwd(), 'server', 'config.json.example');

  let configFile = configPath;

  // Si config.json no existe, usar config.json.example
  if (!fs.existsSync(configPath)) {
    if (!fs.existsSync(examplePath)) {
      throw new Error(
        'No se encontró ni config.json ni config.json.example. Por favor copia config.json.example a config.json y configúralo.'
      );
    }
    console.warn(
      '⚠️  config.json no encontrado, usando config.json.example. Copia config.json.example a config.json para personalizar la configuración.'
    );
    configFile = examplePath;
  }

  try {
    const configContent = fs.readFileSync(configFile, 'utf-8');
    const config = JSON.parse(configContent) as Config;
    return config;
  } catch (error) {
    throw new Error(`Error leyendo archivo de configuración ${configFile}: ${String(error)}`);
  }
}

/**
 * Singleton de configuración
 */
let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
