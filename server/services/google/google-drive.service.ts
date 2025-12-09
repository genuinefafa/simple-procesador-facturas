/**
 * Servicio de Google Drive
 * Maneja upload, download y búsqueda de archivos en Google Drive
 */

import { google, drive_v3 } from 'googleapis';
import { getGoogleAuthClient } from './google-auth.service';
import { GoogleDriveConfig } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface UploadFileOptions {
  fileName: string;
  filePath: string;
  mimeType: string;
  cuit: string; // Para organizar en carpetas por CUIT
  tipo: 'original' | 'procesado';
}

export interface UploadFileResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink: string;
  folderId: string;
}

export class GoogleDriveService {
  private static instance: GoogleDriveService;
  private drive: drive_v3.Drive | null = null;
  private config: GoogleDriveConfig | null = null;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): GoogleDriveService {
    if (!GoogleDriveService.instance) {
      GoogleDriveService.instance = new GoogleDriveService();
    }
    return GoogleDriveService.instance;
  }

  /**
   * Inicializa el servicio con la configuración
   */
  public async initialize(config: GoogleDriveConfig): Promise<void> {
    this.config = config;
    const auth = await getGoogleAuthClient();
    this.drive = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive service initialized');
  }

  /**
   * Verifica si el servicio está inicializado
   */
  private ensureInitialized(): void {
    if (!this.drive || !this.config) {
      throw new Error('GoogleDriveService not initialized. Call initialize() first.');
    }
  }

  // ========== GESTIÓN DE CARPETAS ==========

  /**
   * Obtiene o crea una carpeta para un emisor específico
   */
  public async getOrCreateEmisorFolder(
    cuit: string,
    tipo: 'original' | 'procesado'
  ): Promise<string> {
    this.ensureInitialized();

    // Estructura: /Facturas/{CUIT}/originales o /Facturas/{CUIT}/procesados
    const cuitFolderName = cuit;
    const tipoFolderName =
      tipo === 'original'
        ? this.config!.folderStructure.originales
        : this.config!.folderStructure.procesados;

    // 1. Buscar/crear carpeta del CUIT
    let cuitFolderId = await this.findFolder(cuitFolderName, this.config!.rootFolderId);
    if (!cuitFolderId) {
      cuitFolderId = await this.createFolder(cuitFolderName, this.config!.rootFolderId);
      console.log(`✅ Carpeta creada para CUIT ${cuit}: ${cuitFolderId}`);
    }

    // 2. Buscar/crear subcarpeta de tipo (originales/procesados)
    let tipoFolderId = await this.findFolder(tipoFolderName, cuitFolderId);
    if (!tipoFolderId) {
      tipoFolderId = await this.createFolder(tipoFolderName, cuitFolderId);
      console.log(`✅ Subcarpeta ${tipo} creada: ${tipoFolderId}`);
    }

    return tipoFolderId;
  }

  /**
   * Busca una carpeta por nombre dentro de un parent
   */
  private async findFolder(name: string, parentId: string): Promise<string | null> {
    this.ensureInitialized();

    try {
      const response = await this.drive!.files.list({
        q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      const folders = response.data.files || [];
      return folders.length > 0 ? folders[0].id! : null;
    } catch (error) {
      console.error('Error buscando carpeta:', error);
      return null;
    }
  }

  /**
   * Crea una nueva carpeta
   */
  private async createFolder(name: string, parentId: string): Promise<string> {
    this.ensureInitialized();

    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };

    const response = await this.drive!.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });

    return response.data.id!;
  }

  // ========== UPLOAD Y DOWNLOAD ==========

  /**
   * Sube un archivo a Drive en la carpeta correspondiente
   */
  public async uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
    this.ensureInitialized();

    // 1. Obtener/crear carpeta del emisor
    const folderId = await this.getOrCreateEmisorFolder(options.cuit, options.tipo);

    // 2. Verificar que el archivo existe
    if (!fs.existsSync(options.filePath)) {
      throw new Error(`Archivo no encontrado: ${options.filePath}`);
    }

    // 3. Preparar metadata del archivo
    const fileMetadata = {
      name: options.fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: options.mimeType,
      body: fs.createReadStream(options.filePath),
    };

    // 4. Subir archivo
    const response = await this.drive!.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    console.log(`✅ Archivo subido a Drive: ${options.fileName} (${response.data.id})`);

    return {
      fileId: response.data.id!,
      fileName: response.data.name!,
      webViewLink: response.data.webViewLink || '',
      webContentLink: response.data.webContentLink || '',
      folderId,
    };
  }

  /**
   * Descarga un archivo desde Drive
   */
  public async downloadFile(fileId: string, destinationPath: string): Promise<void> {
    this.ensureInitialized();

    // Obtener el archivo
    const response = await this.drive!.files.get(
      {
        fileId: fileId,
        alt: 'media',
      },
      { responseType: 'stream' }
    );

    // Crear directorio de destino si no existe
    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Escribir archivo a disco
    const dest = fs.createWriteStream(destinationPath);

    return new Promise((resolve, reject) => {
      (response.data as any)
        .on('end', () => {
          console.log(`✅ Archivo descargado: ${destinationPath}`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error('Error descargando archivo:', err);
          reject(err);
        })
        .pipe(dest);
    });
  }

  /**
   * Obtiene el link directo de visualización de un archivo
   */
  public async getFileLink(
    fileId: string
  ): Promise<{ webViewLink: string; webContentLink: string }> {
    this.ensureInitialized();

    const response = await this.drive!.files.get({
      fileId: fileId,
      fields: 'webViewLink, webContentLink',
    });

    return {
      webViewLink: response.data.webViewLink || '',
      webContentLink: response.data.webContentLink || '',
    };
  }

  /**
   * Obtiene metadata de un archivo
   */
  public async getFileMetadata(fileId: string): Promise<drive_v3.Schema$File> {
    this.ensureInitialized();

    const response = await this.drive!.files.get({
      fileId: fileId,
      fields:
        'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents',
    });

    return response.data;
  }

  // ========== BÚSQUEDA ==========

  /**
   * Busca archivos por nombre parcial
   */
  public async searchFilesByName(
    name: string,
    parentFolderId?: string
  ): Promise<drive_v3.Schema$File[]> {
    this.ensureInitialized();

    let query = `name contains '${name}' and trashed=false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await this.drive!.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
      spaces: 'drive',
      pageSize: 100,
    });

    return response.data.files || [];
  }

  /**
   * Busca archivos de un emisor específico (por CUIT)
   */
  public async searchFilesByCuit(
    cuit: string,
    tipo?: 'original' | 'procesado'
  ): Promise<drive_v3.Schema$File[]> {
    this.ensureInitialized();

    // Buscar carpeta del CUIT
    const cuitFolderId = await this.findFolder(cuit, this.config!.rootFolderId);
    if (!cuitFolderId) {
      return [];
    }

    let searchFolderId = cuitFolderId;

    // Si se especifica tipo, buscar en la subcarpeta
    if (tipo) {
      const tipoFolderName =
        tipo === 'original'
          ? this.config!.folderStructure.originales
          : this.config!.folderStructure.procesados;
      const tipoFolderId = await this.findFolder(tipoFolderName, cuitFolderId);
      if (!tipoFolderId) {
        return [];
      }
      searchFolderId = tipoFolderId;
    }

    // Listar archivos en la carpeta
    const response = await this.drive!.files.list({
      q: `'${searchFolderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
      spaces: 'drive',
      pageSize: 1000,
    });

    return response.data.files || [];
  }

  // ========== UTILIDADES ==========

  /**
   * Elimina un archivo (mover a papelera)
   */
  public async deleteFile(fileId: string): Promise<void> {
    this.ensureInitialized();

    await this.drive!.files.delete({
      fileId: fileId,
    });

    console.log(`✅ Archivo eliminado: ${fileId}`);
  }

  /**
   * Mueve un archivo a otra carpeta
   */
  public async moveFile(fileId: string, newParentId: string): Promise<void> {
    this.ensureInitialized();

    // Obtener parents actuales
    const file = await this.drive!.files.get({
      fileId: fileId,
      fields: 'parents',
    });

    const previousParents = file.data.parents?.join(',') || '';

    // Mover archivo
    await this.drive!.files.update({
      fileId: fileId,
      addParents: newParentId,
      removeParents: previousParents,
      fields: 'id, parents',
    });

    console.log(`✅ Archivo movido: ${fileId} → ${newParentId}`);
  }

  /**
   * Obtiene el tamaño total usado por un emisor
   */
  public async getEmisorStorageSize(cuit: string): Promise<number> {
    const files = await this.searchFilesByCuit(cuit);
    return files.reduce((total, file) => total + (parseInt(file.size || '0') || 0), 0);
  }

  /**
   * Crea la estructura de carpetas inicial en Drive
   */
  public async initializeFolderStructure(): Promise<void> {
    this.ensureInitialized();

    // Verificar que la carpeta raíz existe
    try {
      await this.drive!.files.get({
        fileId: this.config!.rootFolderId,
        fields: 'id, name',
      });
      console.log('✅ Carpeta raíz de Drive verificada');
    } catch (error) {
      throw new Error(
        `Carpeta raíz de Drive no encontrada (ID: ${this.config!.rootFolderId}). Verifica la configuración.`
      );
    }
  }
}

/**
 * Helper para obtener la instancia del servicio
 */
export function getGoogleDriveService(): GoogleDriveService {
  return GoogleDriveService.getInstance();
}
