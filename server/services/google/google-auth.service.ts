/**
 * Servicio de autenticación con Google APIs
 * Maneja la autenticación usando Service Account credentials
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface para credenciales de Google Service Account
 */
interface GoogleServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * Scopes necesarios para Sheets y Drive
 */
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets', // Read/write sheets
  'https://www.googleapis.com/auth/drive.file', // Read/write files created by app
  'https://www.googleapis.com/auth/drive.metadata.readonly', // Read file metadata
];

export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private auth: JWT | null = null;
  private credentialsPath: string;

  private constructor() {
    // Buscar credenciales en varios lugares posibles
    const possiblePaths = [
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      path.join(process.cwd(), '../google-credentials.json'),
      path.join(process.cwd(), '../credentials', 'google-service-account.json'),
      path.join(process.cwd(), '../.credentials', 'service-account.json'),
    ];

    const validPath = possiblePaths.find((p) => p && fs.existsSync(p));

    if (!validPath) {
      console.warn(
        '⚠️  Google credentials not found. Please set GOOGLE_APPLICATION_CREDENTIALS env variable or place credentials file in project root.'
      );
      console.warn('   Expected paths:', possiblePaths.filter(Boolean));
      this.credentialsPath = '';
    } else {
      this.credentialsPath = validPath;
      console.info('✅ Google credentials found at:', this.credentialsPath);
    }
  }

  /**
   * Singleton instance
   */
  public static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  /**
   * Obtiene el cliente de autenticación JWT
   * Lazy initialization - solo se autentica cuando se necesita
   */
  public async getAuthClient(): Promise<JWT> {
    if (this.auth) {
      return this.auth;
    }

    if (!this.credentialsPath) {
      throw new Error(
        'Google credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS environment variable or place credentials file in project root.'
      );
    }

    try {
      // Leer el archivo de credenciales
      const credentialsContent = fs.readFileSync(this.credentialsPath, 'utf-8');
      const credentials = JSON.parse(credentialsContent) as GoogleServiceAccountCredentials;

      // Crear cliente JWT con las credenciales del service account
      this.auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: SCOPES,
      });

      // Autorizar
      await this.auth.authorize();

      console.info('✅ Google Auth initialized successfully');
      return this.auth;
    } catch (error) {
      console.error('❌ Error initializing Google Auth:', error);
      throw new Error(`Failed to initialize Google Auth: ${String(error)}`);
    }
  }

  /**
   * Verifica si las credenciales están configuradas
   */
  public isConfigured(): boolean {
    return !!this.credentialsPath && fs.existsSync(this.credentialsPath);
  }

  /**
   * Obtiene información del service account
   */
  public getServiceAccountInfo(): { email: string; projectId: string } | null {
    if (!this.credentialsPath || !fs.existsSync(this.credentialsPath)) {
      return null;
    }

    try {
      const credentialsContent = fs.readFileSync(this.credentialsPath, 'utf-8');
      const credentials = JSON.parse(credentialsContent) as GoogleServiceAccountCredentials;

      return {
        email: credentials.client_email,
        projectId: credentials.project_id,
      };
    } catch {
      return null;
    }
  }

  /**
   * Reinicia la autenticación (útil si las credenciales cambian)
   */
  public reset(): void {
    this.auth = null;
  }
}

/**
 * Helper para obtener el cliente autenticado directamente
 */
export async function getGoogleAuthClient(): Promise<JWT> {
  const authService = GoogleAuthService.getInstance();
  return authService.getAuthClient();
}

/**
 * Helper para verificar si Google está configurado
 */
export function isGoogleConfigured(): boolean {
  const authService = GoogleAuthService.getInstance();
  return authService.isConfigured();
}
