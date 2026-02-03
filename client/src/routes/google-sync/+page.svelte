<script lang="ts">
  import { toast, Toaster } from 'svelte-sonner';
  import {
    Building2,
    FileText,
    ClipboardList,
    FileEdit,
    RefreshCw,
    Upload,
    Download,
    Loader2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Cloud,
    Info,
  } from '$lib/components/icons';

  type SyncMode = 'sync' | 'push' | 'pull';
  type SheetType = 'emisores' | 'facturas' | 'esperadas' | 'logs';

  interface SyncState {
    loading: boolean;
    lastResult: SyncResult | null;
  }

  interface SyncResult {
    success: boolean;
    sheet: SheetType;
    mode: SyncMode;
    stats: {
      uploaded: number;
      downloaded: number;
      conflicts: number;
      errors: number;
    };
    details?: string[];
    error?: string;
  }

  // Estado de sincronización por sheet
  let syncStates = $state<Record<SheetType, SyncState>>({
    emisores: { loading: false, lastResult: null },
    facturas: { loading: false, lastResult: null },
    esperadas: { loading: false, lastResult: null },
    logs: { loading: false, lastResult: null },
  });

  // Configuración de sheets
  const sheets: Array<{
    type: SheetType;
    name: string;
    description: string;
    icon: typeof Building2;
  }> = [
    {
      type: 'emisores',
      name: 'Emisores',
      description: 'Proveedores/Emisores de facturas',
      icon: Building2,
    },
    {
      type: 'facturas',
      name: 'Facturas Procesadas',
      description: 'Facturas ya procesadas y validadas',
      icon: FileText,
    },
    {
      type: 'esperadas',
      name: 'Facturas Esperadas AFIP',
      description: 'Facturas importadas desde Excel AFIP',
      icon: ClipboardList,
    },
    {
      type: 'logs',
      name: 'Logs',
      description: 'Registro de eventos y actividades',
      icon: FileEdit,
    },
  ];

  async function syncSheet(sheet: SheetType, mode: SyncMode) {
    syncStates[sheet].loading = true;
    syncStates[sheet].lastResult = null;

    try {
      const response = await fetch('/api/google-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sheet, mode }),
      });

      const result: SyncResult = await response.json();

      syncStates[sheet].lastResult = result;

      if (result.success) {
        const modeText =
          mode === 'sync' ? 'Sincronizado' : mode === 'push' ? 'Subido' : 'Descargado';
        toast.success(
          `${modeText} "${sheet}": ${result.stats.uploaded} subidos, ${result.stats.downloaded} descargados`,
          { duration: 5000 }
        );
      } else {
        toast.error(`Error en "${sheet}": ${result.error}`, { duration: 7000 });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al sincronizar "${sheet}": ${errorMsg}`, { duration: 7000 });
      syncStates[sheet].lastResult = {
        success: false,
        sheet,
        mode,
        stats: { uploaded: 0, downloaded: 0, conflicts: 0, errors: 1 },
        error: errorMsg,
      };
    } finally {
      syncStates[sheet].loading = false;
    }
  }

  function getModeLabel(mode: SyncMode): string {
    return mode === 'sync' ? 'Sincronizar' : mode === 'push' ? 'Subir' : 'Descargar';
  }

  function getModeIcon(mode: SyncMode) {
    return mode === 'sync' ? RefreshCw : mode === 'push' ? Upload : Download;
  }

  function getModeDescription(mode: SyncMode): string {
    return mode === 'sync'
      ? 'Bidireccional: sincroniza datos locales ↔ Google'
      : mode === 'push'
        ? 'Solo subida: local → Google'
        : 'Solo descarga: Google → local';
  }
</script>

<Toaster richColors position="top-center" />

<div class="container mx-auto px-4 py-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold mb-2 flex items-center gap-2">
      <Cloud size={32} /> Sincronización con Google Sheets + Drive
    </h1>
    <p class="text-gray-600">
      Sincroniza datos manualmente entre tu base local (SQLite) y Google Sheets + Drive
    </p>
  </div>

  <div class="grid grid-cols-1 gap-6">
    {#each sheets as sheet}
      {@const state = syncStates[sheet.type]}
      {@const result = state.lastResult}

      <div class="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
        <!-- Header de la sheet -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl"><sheet.icon size={32} /></span>
            <div>
              <h2 class="text-xl font-semibold">{sheet.name}</h2>
              <p class="text-sm text-gray-500">{sheet.description}</p>
            </div>
          </div>
        </div>

        <!-- Botones de sincronización -->
        <div class="flex gap-3 mb-4">
          {#each ['sync', 'push', 'pull'] as mode}
            {@const m = mode as SyncMode}
            {@const ModeIcon = getModeIcon(m)}
            <button
              onclick={() => syncSheet(sheet.type, m)}
              disabled={state.loading}
              class="flex-1 px-4 py-3 rounded-lg font-medium transition-all duration-200
                     {state.loading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'}
                     disabled:opacity-50"
              title={getModeDescription(m)}
            >
              <div class="flex items-center justify-center gap-2">
                <ModeIcon size={18} />
                <span>{getModeLabel(m)}</span>
                {#if state.loading && state.lastResult?.mode === m}
                  <Loader2 size={16} class="animate-spin" />
                {/if}
              </div>
            </button>
          {/each}
        </div>

        <!-- Resultado de última sincronización -->
        {#if result}
          <div
            class="mt-4 p-4 rounded-lg {result.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'}"
          >
            <div class="flex items-start gap-2">
              <span class="text-xl">
                {#if result.success}
                  <CheckCircle size={24} class="text-green-600" />
                {:else}
                  <XCircle size={24} class="text-red-600" />
                {/if}
              </span>
              <div class="flex-1">
                <div class="font-medium text-sm mb-2">
                  {result.success ? 'Sincronización exitosa' : 'Error en sincronización'}
                  <span class="text-gray-500 ml-2">
                    ({getModeLabel(result.mode)})
                  </span>
                </div>

                {#if result.success}
                  <div class="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div class="flex items-center gap-1">
                      <Upload size={14} />
                      <span class="font-semibold">{result.stats.uploaded}</span>
                      <span class="text-gray-600">subidos</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <Download size={14} />
                      <span class="font-semibold">{result.stats.downloaded}</span>
                      <span class="text-gray-600">descargados</span>
                    </div>
                    {#if result.stats.errors > 0}
                      <div class="flex items-center gap-1 col-span-2">
                        <AlertTriangle size={14} />
                        <span class="font-semibold">{result.stats.errors}</span>
                        <span class="text-gray-600">errores</span>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="text-sm text-red-700 mb-2">{result.error}</div>
                {/if}

                <!-- Detalles expandibles -->
                {#if result.details && result.details.length > 0}
                  <details class="mt-2">
                    <summary class="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                      Ver detalles ({result.details.length} items)
                    </summary>
                    <div
                      class="mt-2 p-3 bg-white rounded border border-gray-200 max-h-60 overflow-y-auto"
                    >
                      {#each result.details as detail}
                        <div class="text-xs font-mono py-1 border-b border-gray-100 last:border-0">
                          {detail}
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Ayuda -->
  <div class="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
    <h3 class="font-semibold text-lg mb-3 flex items-center gap-2">
      <Info size={20} />
      <span>¿Cómo funciona la sincronización?</span>
    </h3>
    <div class="space-y-2 text-sm text-gray-700">
      <div class="flex gap-2 items-start">
        <span class="font-semibold min-w-24 flex items-center gap-1"
          ><RefreshCw size={14} /> Sincronizar:</span
        >
        <span
          >Sube a Google lo que falta allá, baja a local lo que falta acá. Sincronización
          bidireccional completa.</span
        >
      </div>
      <div class="flex gap-2 items-start">
        <span class="font-semibold min-w-24 flex items-center gap-1"
          ><Upload size={14} /> Subir:</span
        >
        <span
          >Solo envía datos locales a Google. No modifica tu base de datos local. Útil para hacer
          backup.</span
        >
      </div>
      <div class="flex gap-2 items-start">
        <span class="font-semibold min-w-24 flex items-center gap-1"
          ><Download size={14} /> Descargar:</span
        >
        <span
          >Solo trae datos de Google a local. No modifica Google. Útil para importar datos desde
          otro dispositivo.</span
        >
      </div>
    </div>
    <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
      <p class="text-sm text-yellow-800 flex items-start gap-2">
        <AlertTriangle size={16} class="flex-shrink-0 mt-0.5" />
        <span
          ><strong>Importante:</strong> La sincronización manual te permite trabajar sin conexión. Usa
          esta página cuando quieras sincronizar con Google, pero no es necesario que lo hagas cada vez
          que procesas facturas.</span
        >
      </p>
    </div>
  </div>
</div>

<style>
  /* Tailwind styles removed - full refactor pending (issue #33) */
</style>
