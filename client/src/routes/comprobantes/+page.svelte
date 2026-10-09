<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import CategoryPills from '$lib/components/CategoryPills.svelte';
  import CategorySelect from '$lib/components/CategorySelect.svelte';
  import CompletenessIndicator from '$lib/components/CompletenessIndicator.svelte';
  import CompleteFromArcaDialog, {
    type CompleteItem,
  } from '$lib/components/CompleteFromArcaDialog.svelte';
  import TaxBreakdownIndicator from '$lib/components/TaxBreakdownIndicator.svelte';
  import TaxBreakdownRowPanel from '$lib/components/TaxBreakdownRowPanel.svelte';
  import UnifiedSearchBox from '$lib/components/UnifiedSearchBox.svelte';
  import { onDestroy } from 'svelte';
  import ArcaImportReport from '$lib/components/ArcaImportReport.svelte';
  import type {
    ArcaImportEntry,
    ArcaImportResult,
    ReconciliationSummary,
  } from '$lib/components/ArcaImportReport.types';
  import UploadReport from '$lib/components/UploadReport.svelte';
  import type { PageData } from './$types';
  import type { Comprobante, TaxReconciliationSummary } from '$lib/types/comprobante';
  import { FileUpload } from 'melt/builders';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { toast, Toaster } from 'svelte-sonner';
  import { reconciliationService } from '$lib/services/ReconciliationService';
  import type { CompleteResponse } from '$lib/services/ReconciliationService.types';
  import {
    formatCurrency,
    getFriendlyType,
    formatDateShort,
    formatEmitterName,
    formatFileStatus,
    formatComprobanteKind,
    formatCuit,
  } from '$lib/formatters';
  import { createFilterMatcher, type FilterNode } from '$lib/search';
  import { navigationStore } from '$lib/stores/navigation';
  import { comprobanteService } from '$lib/services/ComprobanteService';
  import { Copy, CopyCheck, ChevronRight, ChevronDown } from '$lib/components/icons';
  import {
    generateFilenameForFile,
    generateFilenameForSheet,
    type CanonicalFilenameParams,
  } from '$lib/utils/canonical-filename';
  import { copyText, copyRich } from '$lib/utils/clipboard';

  let { data } = $props();
  let categories = $derived(data.categories || []);

  // Estado unificado para búsqueda meta-lenguaje (incluye estado y categoría)
  let searchQuery = $state('');
  let searchFilters = $state<FilterNode[]>([]);

  // ARCA import infobar state
  let arcaImports = $state<ArcaImportEntry[] | null>(null);
  let arcaReconciliation = $state<ReconciliationSummary | null>(null);
  let arcaReconciliationLoading = $state(false);
  let arcaCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let arcaRunId = 0;
  // Years covered by the last ARCA import, to refresh its reconciliation counts
  let arcaPeriods: string[] = [];

  onDestroy(() => {
    if (arcaCloseTimer) clearTimeout(arcaCloseTimer);
  });

  // Filter matcher
  const matchesSearchFilter = $derived(createFilterMatcher(categories));

  // Extraer lista de emisores únicos de los comprobantes
  let emitters = $derived(() => {
    const seen = new Set<string>();
    const result: Array<{ name: string; cuit?: string }> = [];

    for (const c of data.comprobantes) {
      const name = c.emitterName || c.final?.emitterName || c.expected?.emitterName;
      const cuit = c.emitterCuit || c.final?.cuit || c.expected?.cuit;

      if (name && !seen.has(name)) {
        seen.add(name);
        result.push({ name, cuit: cuit ?? undefined });
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  });

  // Restaurar query de búsqueda desde URL o localStorage
  $effect.pre(() => {
    if (typeof window !== 'undefined') {
      const q = $page.url.searchParams.get('q');
      if (q) {
        searchQuery = q;
      } else {
        // Si no hay query en URL, intentar restaurar desde localStorage
        const savedFilters = localStorage.getItem('comprobantes-search-filters');
        if (savedFilters) {
          try {
            const state = JSON.parse(savedFilters);
            if (state.version === 2 && Date.now() - state.timestamp < 7 * 24 * 60 * 60 * 1000) {
              searchQuery = state.query || '';
            }
          } catch (e) {
            console.warn('Failed to restore search filters', e);
          }
        }
      }
    }
  });

  // Persistir filtros de búsqueda en localStorage y URL
  $effect(() => {
    if (typeof window !== 'undefined') {
      const state = {
        version: 2,
        query: searchQuery,
        timestamp: Date.now(),
      };
      localStorage.setItem('comprobantes-search-filters', JSON.stringify(state));

      // Actualizar URL sin recargar (trim para URLs limpias y compartibles)
      const params = new URLSearchParams();
      const trimmed = searchQuery.trim();
      if (trimmed) params.set('q', trimmed);
      const target = params.toString() ? `/comprobantes?${params}` : '/comprobantes';

      // Evitar goto() redundante si la URL ya coincide (ej: carga inicial desde link compartido)
      const currentPath = `${$page.url.pathname}${$page.url.search}`;
      if (target !== currentPath) {
        goto(target, { replaceState: true, noScroll: true, keepFocus: true });
      }
    }
  });

  function shortHash(hash?: string | null) {
    if (!hash) return '—';
    return hash.slice(0, 8);
  }

  function formatComprobante(c: Comprobante): string {
    if (c.final) {
      const f = c.final;
      const type = getFriendlyType(f.invoiceType);
      const pos = f.pointOfSale != null ? String(f.pointOfSale).padStart(4, '0') : '----';
      const num = f.invoiceNumber != null ? String(f.invoiceNumber).padStart(8, '0') : '--------';
      return `${type} ${pos}-${num}`;
    }
    if (c.expected) {
      const e = c.expected;
      const type = getFriendlyType(e.invoiceType);
      return `${type} ${String(e.pointOfSale).padStart(4, '0')}-${String(e.invoiceNumber).padStart(8, '0')}`;
    }
    if (c.file) {
      return c.file.originalFilename;
    }
    return '—';
  }

  function getEmitterName(c: Comprobante): { short: string; full: string } {
    const name = c.emitterName || c.final?.emitterName || c.expected?.emitterName;
    // No truncar - dejar que CSS maneje el overflow con text-overflow: ellipsis
    return { short: name || '', full: name || '' };
  }

  // --- Copy filename dropdown ---
  let copiedId = $state<string | null>(null);
  let openMenuId = $state<string | null>(null);
  let copiedTimeout: ReturnType<typeof setTimeout> | null = null;

  function resolveCategoryKey(categoryId: number | null | undefined): string | null {
    if (categoryId == null) return null;
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.key ?? null;
  }

  function getFilenameParams(comp: Comprobante): CanonicalFilenameParams | null {
    if (comp.final) {
      return {
        issueDate: comp.final.issueDate ?? null,
        emitterName: comp.emitterName || comp.final.emitterName || null,
        cuit: comp.final.cuit,
        invoiceType: comp.final.invoiceType,
        pointOfSale: comp.final.pointOfSale ?? null,
        invoiceNumber: comp.final.invoiceNumber ?? null,
        categoryKey: resolveCategoryKey(comp.final.categoryId),
      };
    }
    if (comp.expected) {
      return {
        issueDate: comp.expected.issueDate,
        emitterName: comp.emitterName || comp.expected.emitterName || null,
        cuit: comp.expected.cuit,
        invoiceType: comp.expected.invoiceType,
        pointOfSale: comp.expected.pointOfSale,
        invoiceNumber: comp.expected.invoiceNumber,
        categoryKey: resolveCategoryKey(comp.expected.categoryId),
      };
    }
    if (comp.file) {
      return {
        issueDate: comp.file.extractedDate || null,
        emitterName: comp.emitterName || null,
        cuit: comp.file.extractedCuit || null,
        invoiceType: comp.file.extractedType ?? null,
        pointOfSale: comp.file.extractedPointOfSale ?? null,
        invoiceNumber: comp.file.extractedInvoiceNumber ?? null,
        categoryKey: resolveCategoryKey(comp.file.categoryId),
      };
    }
    return null;
  }

  function canGenerateFilename(comp: Comprobante): boolean {
    const params = getFilenameParams(comp);
    return params !== null && generateFilenameForFile(params) !== null;
  }

  async function copyFilename(comp: Comprobante, format: 'file' | 'sheet') {
    const params = getFilenameParams(comp);
    if (!params) return;
    const filename =
      format === 'file' ? generateFilenameForFile(params) : generateFilenameForSheet(params);
    if (!filename) return;

    try {
      await copyText(filename);
      copiedId = comp.id;
      if (copiedTimeout) clearTimeout(copiedTimeout);
      copiedTimeout = setTimeout(() => {
        copiedId = null;
      }, 2000);
      openMenuId = null;
      toast.success(`Copiado: ${filename}`, { duration: 2000 });
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  }

  function closeCopyMenu() {
    openMenuId = null;
  }

  // Close copy menu on click outside
  $effect(() => {
    if (!openMenuId) return;
    const handler = () => closeCopyMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  });

  // --- Helpers for copy and balance group ---
  function getStatusEmoji(comp: Comprobante): string {
    const parts: string[] = [];
    if (comp.file || comp.final?.fileId) parts.push('📄');
    if (comp.final) parts.push('✅');
    if (comp.expected || comp.final?.expectedInvoiceId) parts.push('📋');
    if (comp.expected?.isBalanceGroupPrincipal) parts.push('⚖️');
    return parts.join('') || '—';
  }

  function getCategoryName(comp: Comprobante): string {
    const catId = comp.final?.categoryId ?? comp.expected?.categoryId ?? comp.file?.categoryId;
    if (catId == null) return '—';
    const cat = categories.find((c) => c.id === catId);
    return cat?.description ?? '—';
  }

  // --- Balance group expand/collapse ---
  interface ExpandedGroup {
    members: Comprobante[];
    total: number;
    isBalanced: boolean;
  }
  let expandedGroups = $state<Map<number, ExpandedGroup>>(new Map());
  let loadingGroups = $state<Set<number>>(new Set());

  async function toggleBalanceGroup(expectedId: number) {
    if (expandedGroups.has(expectedId)) {
      const next = new Map(expandedGroups);
      next.delete(expectedId);
      expandedGroups = next;
      return;
    }

    loadingGroups = new Set([...loadingGroups, expectedId]);
    const result = await comprobanteService.getBalanceGroupAsComprobantes(expectedId);
    const nextLoading = new Set(loadingGroups);
    nextLoading.delete(expectedId);
    loadingGroups = nextLoading;

    if (result.success && result.data) {
      const next = new Map(expandedGroups);
      next.set(expectedId, {
        members: result.data.members,
        total: result.data.total,
        isBalanced: result.data.isBalanced,
      });
      expandedGroups = next;
    } else {
      toast.error(result.error || 'Error al cargar grupo de balance');
    }
  }

  // --- Tax breakdown vs ARCA (#191) ---
  // Invoice ids whose comparison panel is open (several can be open at once)
  let openBreakdowns = $state<Set<number>>(new Set());

  function toggleBreakdown(invoiceId: number) {
    const next = new Set(openBreakdowns);
    if (next.has(invoiceId)) next.delete(invoiceId);
    else next.add(invoiceId);
    openBreakdowns = next;
  }

  const COMPLETE_BATCH_MAX = 500; // server limit per request
  let completeOpen = $state(false);

  // Batch action only makes sense when the user is looking at the completables
  let completeCandidates = $derived.by((): CompleteItem[] => {
    const filtering = searchFilters.some(
      (f) => f.type === 'desglose' && f.value === 'completable' && !f.negate
    );
    if (!filtering) return [];
    const items: CompleteItem[] = [];
    for (const comp of visibleComprobantes) {
      const rec = comp.taxReconciliation;
      if (!comp.final || rec?.status !== 'completable' || !rec.arcaLines) continue;
      items.push({
        invoiceId: comp.final.id,
        label: formatComprobante(comp),
        emitter: getEmitterName(comp).short || formatCuit(comp.final.cuit),
        arcaLines: rec.arcaLines,
      });
    }
    return items.slice(0, COMPLETE_BATCH_MAX);
  });

  async function onBreakdownApplied(result: CompleteResponse) {
    const { applied, skipped } = result;
    if (applied.length === 1) toast.success('Desglose copiado desde ARCA');
    else if (applied.length > 1) toast.success(`${applied.length} desgloses copiados desde ARCA`);
    if (skipped.length > 0) {
      toast.warning(
        `${skipped.length} ${skipped.length === 1 ? 'omitida' : 'omitidas'} porque cambiaron`
      );
    }
    // Patch only the affected rows instead of reloading the whole list
    const items = await Promise.all(applied.map((id) => reconciliationService.get(id)));
    const next = new Map(reconOverrides);
    items.forEach((res, i) => {
      if (res.success && res.data) {
        const { status, reason, arcaLines } = res.data;
        next.set(applied[i]!, {
          status,
          reason,
          ...(status === 'completable' && arcaLines ? { arcaLines } : {}),
        });
      }
    });
    reconOverrides = next;
    reconVersion++;
    // Keep the ARCA import infobar counts in sync with what was just copied
    if (applied.length > 0 && arcaImports && arcaReconciliation) {
      const runId = arcaRunId;
      const summary = await fetchArcaReconciliation(arcaPeriods);
      if (summary && runId === arcaRunId && arcaImports) arcaReconciliation = summary;
    }
  }

  const CREDIT_NOTE_TYPES = new Set([3, 8, 13, 21, 53]);

  function isCreditNote(invoiceType: number | null): boolean {
    return invoiceType != null && CREDIT_NOTE_TYPES.has(invoiceType);
  }

  function formatSignedTotal(total: number | null | undefined, invoiceType: number | null): string {
    if (total == null) return '—';
    const isCredit = isCreditNote(invoiceType);
    return isCredit ? `-${formatCurrency(total)}` : formatCurrency(total);
  }

  // --- Copy table (Slack / Gmail) ---
  let copiedFormat = $state<'slack' | 'gmail' | null>(null);

  function getTableRowData(comp: Comprobante) {
    return {
      date: comp.effectiveDate ? formatDateShort(comp.effectiveDate) : '—',
      emitter: getEmitterName(comp).short || '—',
      cuit: formatCuit(comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit),
      compName: formatComprobante(comp),
      total: formatCurrency(comp.final?.total ?? comp.expected?.total ?? comp.file?.extractedTotal),
      category: getCategoryName(comp),
      status: getStatusEmoji(comp),
    };
  }

  const TABLE_COLUMNS = [
    'Fecha',
    'Emisor',
    'CUIT',
    'Comprobante',
    'Total',
    'Categoría',
    'Estado',
  ] as const;

  function rowDataToArray(d: ReturnType<typeof getTableRowData>) {
    return [d.date, d.emitter, d.cuit, d.compName, d.total, d.category, d.status];
  }

  function getExpandedMemberRows(comp: Comprobante) {
    const expectedId = comp.expected?.id;
    if (expectedId == null || !expandedGroups.has(expectedId)) return [];
    const group = expandedGroups.get(expectedId)!;
    const rows = group.members.map((member) => {
      const invoiceType = member.expected?.invoiceType ?? member.final?.invoiceType ?? null;
      const total =
        member.expected?.total ?? member.final?.total ?? member.file?.extractedTotal ?? null;
      return {
        date: member.effectiveDate ? formatDateShort(member.effectiveDate) : '—',
        emitter: '',
        cuit: '',
        compName: `└ ${formatComprobante(member)}`,
        total: formatSignedTotal(total, invoiceType),
        category: getCategoryName(member),
        status: getStatusEmoji(member),
      };
    });
    // Add total row
    rows.push({
      date: '',
      emitter: '',
      cuit: '',
      compName: '',
      total: `= ${formatCurrency(Math.abs(group.total))}`,
      category: '',
      status: '',
    });
    return rows;
  }

  function buildTsvTable(): string {
    const header = TABLE_COLUMNS.join('\t');
    const rows: string[] = [];
    for (const comp of visibleComprobantes) {
      rows.push(rowDataToArray(getTableRowData(comp)).join('\t'));
      for (const sub of getExpandedMemberRows(comp)) {
        rows.push(rowDataToArray(sub).join('\t'));
      }
    }
    return [header, ...rows].join('\n');
  }

  function buildHtmlTable(): string {
    const headerCells = TABLE_COLUMNS.map(
      (col) =>
        `<th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5;text-align:left;font-size:13px">${col}</th>`
    ).join('');
    const htmlRows: string[] = [];
    for (const comp of visibleComprobantes) {
      const d = getTableRowData(comp);
      const cells = rowDataToArray(d)
        .map((val, i) => {
          const align = i === 4 ? 'right' : 'left';
          return `<td style="padding:4px 8px;border:1px solid #ddd;font-size:13px;text-align:${align}">${val}</td>`;
        })
        .join('');
      htmlRows.push(`<tr>${cells}</tr>`);
      for (const sub of getExpandedMemberRows(comp)) {
        const subCells = rowDataToArray(sub)
          .map((val, i) => {
            const align = i === 4 ? 'right' : 'left';
            return `<td style="padding:4px 8px;border:1px solid #ddd;font-size:12px;text-align:${align};background:#f0f7ff;color:#666">${val}</td>`;
          })
          .join('');
        htmlRows.push(`<tr>${subCells}</tr>`);
      }
    }
    return `<table style="border-collapse:collapse;font-family:sans-serif"><thead><tr>${headerCells}</tr></thead><tbody>${htmlRows.join('')}</tbody></table>`;
  }

  async function copyTableToClipboard(format: 'slack' | 'gmail') {
    const count = visibleComprobantes.length;
    try {
      if (format === 'slack') {
        await copyText(buildTsvTable());
      } else {
        await copyRich({ html: buildHtmlTable(), text: buildTsvTable() });
      }
      copiedFormat = format;
      const label = format === 'slack' ? 'Slack' : 'Gmail';
      toast.success(`Tabla copiada para ${label} (${count} filas)`, { duration: 2000 });
      setTimeout(() => (copiedFormat = null), 2000);
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  }

  function isVisible(c: Comprobante): boolean {
    // Todos los filtros se aplican via meta-lenguaje (AND lógico)
    for (const filter of searchFilters) {
      if (!matchesSearchFilter(c, filter)) return false;
    }
    return true;
  }

  /**
   * Actualiza la categoría de una factura procesada
   */
  async function updateCategory(invoiceId: number, categoryId: number | null | undefined) {
    const result = await comprobanteService.updateInvoiceCategory(
      invoiceId,
      categoryId === undefined ? null : categoryId
    );
    if (result.success) {
      toast.success('Categoría actualizada');
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al actualizar categoría');
    }
  }

  /**
   * Actualiza la categoría de un expected invoice
   */
  async function updateExpectedCategory(expectedId: number, categoryId: number | null) {
    const result = await comprobanteService.updateExpectedInvoiceCategory(expectedId, categoryId);
    if (result.success) {
      toast.success('Categoría actualizada');
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al actualizar categoría');
    }
  }

  /**
   * Actualiza la categoría de un archivo
   */
  async function updateFileCategory(fileId: number, categoryId: number | null) {
    const result = await comprobanteService.updateFileCategory(fileId, categoryId);
    if (result.success) {
      toast.success('Categoría actualizada');
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al actualizar categoría');
    }
  }

  // Melt Next File Upload
  const fileUpload = new FileUpload({
    multiple: true,
    onAccept: (file: File) => {
      // Acumular archivos para procesamiento batch
      pendingUploadFiles.add(file);
    },
  });

  let pendingUploadFiles = new Set<File>();

  // Estado para upload report
  let uploadResult = $state<{
    uploadedFiles: any[];
    errors: any[];
  } | null>(null);

  // Estado para drag & drop global
  let isDraggingOverPage = $state(false);
  let dragCounter = $state(0);

  // Categoría pre-seleccionada para uploads
  let uploadCategoryId = $state<number | null>(null);

  // Cuando cambien los archivos seleccionados, procesarlos
  $effect(() => {
    const selected = fileUpload.selected;
    if (selected && selected instanceof Set && selected.size > 0) {
      handleFiles(Array.from(selected));
      fileUpload.clear();
    }
  });

  // Global drag & drop handlers
  $effect(() => {
    if (typeof window === 'undefined') return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes('Files')) {
        isDraggingOverPage = true;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = () => {
      dragCounter--;
      if (dragCounter === 0) {
        isDraggingOverPage = false;
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      isDraggingOverPage = false;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFiles(Array.from(files));
      }
    };

    document.body.addEventListener('dragenter', handleDragEnter);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('drop', handleDrop);

    return () => {
      document.body.removeEventListener('dragenter', handleDragEnter);
      document.body.removeEventListener('dragover', handleDragOver);
      document.body.removeEventListener('dragleave', handleDragLeave);
      document.body.removeEventListener('drop', handleDrop);
    };
  });

  // Helpers para búsqueda meta-lenguaje
  // Rows patched locally after copying a breakdown from ARCA (avoids reloading the list)
  let reconOverrides = $state<Map<number, TaxReconciliationSummary | null>>(new Map());
  // Bumped to make open row panels reload their comparison
  let reconVersion = $state(0);

  // A fresh server load supersedes any local patch
  $effect(() => {
    void data.comprobantes;
    reconOverrides = new Map();
  });

  let comprobantes = $derived(
    reconOverrides.size === 0
      ? data.comprobantes
      : data.comprobantes.map((c) =>
          c.final && reconOverrides.has(c.final.id)
            ? { ...c, taxReconciliation: reconOverrides.get(c.final.id) }
            : c
        )
  );
  let visibleComprobantes = $derived(comprobantes.filter(isVisible));

  let hasActiveFilters = $derived(searchFilters.length > 0);

  function clearAllFilters() {
    searchQuery = '';
    searchFilters = [];
  }

  /**
   * Navega al detalle de un comprobante guardando el contexto de navegación.
   */
  function navigateToDetail(compId: string) {
    // Guardar los IDs de la lista visible actual para navegación prev/next
    const ids = visibleComprobantes.map((c) => c.id);
    navigationStore.setContext(ids, searchQuery || undefined);
    goto(`/comprobantes/${compId}`);
  }

  async function handleFiles(uploadedFiles: File[]) {
    // A new batch cancels any pending auto-close of the ARCA infobar
    cancelArcaAutoClose();
    const excel = uploadedFiles.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    const others = uploadedFiles.filter((f) => !/\.(xlsx|xls|csv)$/i.test(f.name));

    // 1) Excel/CSV -> expected import (one by one), reported in the ARCA infobar
    if (excel.length > 0) {
      await importArcaFiles(excel);
    }

    // 2) Otros -> upload pending (batch)
    if (others.length > 0) {
      const fd = new FormData();
      others.forEach((f) => fd.append('files', f));
      // Agregar categoría pre-seleccionada si existe
      if (uploadCategoryId !== null) {
        fd.append('categoryId', String(uploadCategoryId));
      }
      const toastId = toast.loading(
        `Subiendo ${others.length} archivo${others.length > 1 ? 's' : ''}...`
      );

      try {
        const response = await fetch('/api/invoices/upload', { method: 'POST', body: fd });
        const data = await response.json();

        toast.dismiss(toastId);

        // Guardar resultado para mostrar en el report
        uploadResult = {
          uploadedFiles: data.uploadedFiles || [],
          errors: data.errors || [],
        };

        // Recargar datos para reflejar los nuevos pending files
        await invalidateAll();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error de conexión';
        toast.error(`Error al subir archivos: ${errorMsg}`, { id: toastId, duration: Infinity });
      }
    }

    // 3) Refresh reactivo (Excel-only batches already refreshed in importArcaFiles)
    if (others.length > 0) {
      await invalidateAll();
    }
  }

  const ARCA_AUTO_CLOSE_MS = 4000;

  function cancelArcaAutoClose() {
    if (arcaCloseTimer) {
      clearTimeout(arcaCloseTimer);
      arcaCloseTimer = null;
    }
  }

  function closeArcaReport() {
    cancelArcaAutoClose();
    arcaRunId++; // invalidate any in-flight reconciliation fetch
    arcaImports = null;
    arcaReconciliation = null;
    arcaReconciliationLoading = false;
  }

  /** Clean import: everything new, no errors, nothing left to reconcile. */
  function isCleanArcaImport(
    entries: ArcaImportEntry[],
    reconciliation: ReconciliationSummary | null
  ): boolean {
    if (!reconciliation || reconciliation.completable > 0 || reconciliation.divergent > 0) {
      return false;
    }
    return entries.every(
      (e) =>
        e.status === 'done' &&
        e.result.errors.length === 0 &&
        e.result.updated === 0 &&
        e.result.unchanged === 0 &&
        e.result.imported > 0
    );
  }

  /** Sums completable/divergent across the given years; null if any request fails. */
  async function fetchArcaReconciliation(periods: string[]): Promise<ReconciliationSummary | null> {
    const results = await Promise.all(periods.map((p) => reconciliationService.list(p)));
    if (!results.every((r) => r.success)) return null;
    const summary = { completable: 0, divergent: 0 };
    for (const r of results) {
      if (r.success && r.data) {
        summary.completable += r.data.counts.completable;
        summary.divergent += r.data.counts.divergent;
      }
    }
    return summary;
  }

  async function importArcaFiles(files: File[]) {
    cancelArcaAutoClose();
    const runId = ++arcaRunId;
    arcaReconciliation = null;
    arcaReconciliationLoading = false;
    arcaImports = files.map((f): ArcaImportEntry => ({ filename: f.name, status: 'loading' }));

    const setEntry = (index: number, entry: ArcaImportEntry) => {
      if (runId !== arcaRunId || !arcaImports) return;
      arcaImports = arcaImports.map((e, i) => (i === index ? entry : e));
    };

    for (const [i, f] of files.entries()) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        const response = await fetch('/api/expected-invoices/import', { method: 'POST', body: fd });
        const data = await response.json();
        if (data.success) {
          setEntry(i, { filename: f.name, status: 'done', result: data as ArcaImportResult });
        } else {
          setEntry(i, {
            filename: f.name,
            status: 'error',
            error: data.error ?? 'Error desconocido',
          });
        }
      } catch {
        setEntry(i, { filename: f.name, status: 'error', error: 'Error de conexión' });
      }
    }

    // Refresh the listing without touching scroll/navigation. Always, even if the
    // infobar was closed mid-import: the data changed either way.
    await invalidateAll();
    if (runId !== arcaRunId || !arcaImports) return;

    // Reconciliation counts: one request per distinct year across the whole batch
    arcaPeriods = [
      ...new Set(arcaImports.flatMap((e) => (e.status === 'done' ? (e.result.periods ?? []) : []))),
    ];
    let summary: ReconciliationSummary | null = null;
    if (arcaPeriods.length > 0) {
      arcaReconciliationLoading = true;
      summary = await fetchArcaReconciliation(arcaPeriods);
      if (runId !== arcaRunId || !arcaImports) return;
      arcaReconciliationLoading = false;
    }
    arcaReconciliation = summary;

    if (isCleanArcaImport(arcaImports, summary)) {
      arcaCloseTimer = setTimeout(closeArcaReport, ARCA_AUTO_CLOSE_MS);
    }
  }
</script>

<svelte:head>
  <title>Comprobantes</title>
</svelte:head>

<Toaster position="top-right" richColors />

<div class="page-container">
  <!-- Overlay que aparece cuando se arrastra sobre la página -->
  {#if isDraggingOverPage}
    <div class="dropzone-overlay">
      <div class="dropzone-content">
        <p class="dz-icon">📦</p>
        <p class="dz-title">Soltá los archivos</p>
        <p class="dz-hint">
          PDF/Imágenes quedarán como pendientes; Excel/CSV se importan a expected
        </p>
      </div>
    </div>
  {/if}

  <header class="header">
    <div>
      <p class="eyebrow">Centro unificado</p>
      <h1>Comprobantes</h1>
      <p class="hint">
        Consolida Expected, Pending y Facturas. Subí archivos o importá Excel aquí.
      </p>
    </div>
  </header>

  <!-- ARCA import infobar (can coexist with the upload report / dropzone) -->
  {#if arcaImports}
    <ArcaImportReport
      entries={arcaImports}
      reconciliation={arcaReconciliation}
      reconciliationLoading={arcaReconciliationLoading}
      onClose={closeArcaReport}
      activeQuery={searchQuery}
      onfilter={(query) => (searchQuery = query)}
    />
  {/if}

  <!-- Upload Report o Dropzone -->
  {#if uploadResult}
    <UploadReport
      uploadedFiles={uploadResult.uploadedFiles}
      errors={uploadResult.errors}
      onClose={() => (uploadResult = null)}
    />
  {:else}
    <!-- Dropzone compacto clickeable con selector de categoría -->
    <div class="dropzone-wrapper">
      <div {...fileUpload.dropzone} class="dropzone-compact">
        <span class="dz-compact-hint"
          >📎 Click para subir archivos o arrastrá a cualquier parte</span
        >
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="upload-category-wrapper"
        role="group"
        aria-label="Selector de categoría para archivos subidos"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <span class="upload-category-label">Categoría:</span>
        <div class="upload-category-select">
          <CategorySelect {categories} bind:value={uploadCategoryId} />
        </div>
      </div>
      <input {...fileUpload.input} />
    </div>
  {/if}

  <!-- BÚSQUEDA UNIFICADA -->
  <section class="search-section">
    <UnifiedSearchBox
      bind:value={searchQuery}
      onfilter={(filters) => (searchFilters = filters)}
      {categories}
      emitters={emitters()}
    />
  </section>

  <!-- RESUMEN DE FILTROS -->
  <section class="filter-summary">
    <div class="count">
      {#if hasActiveFilters}
        Mostrando {visibleComprobantes.length} de {comprobantes.length} comprobantes
      {:else}
        {comprobantes.length} comprobantes
      {/if}
    </div>
    <div class="filter-actions">
      <button
        class="copy-table-btn"
        class:copied={copiedFormat === 'slack'}
        onclick={() => copyTableToClipboard('slack')}
        type="button"
        title="Copiar tabla para Slack (TSV)"
      >
        {#if copiedFormat === 'slack'}
          <CopyCheck size={14} />
        {:else}
          <Copy size={14} />
        {/if}
        Slack
      </button>
      <button
        class="copy-table-btn"
        class:copied={copiedFormat === 'gmail'}
        onclick={() => copyTableToClipboard('gmail')}
        type="button"
        title="Copiar tabla con formato para Gmail"
      >
        {#if copiedFormat === 'gmail'}
          <CopyCheck size={14} />
        {:else}
          <Copy size={14} />
        {/if}
        Gmail
      </button>
      {#if completeCandidates.length > 0}
        <Button size="sm" variant="primary" onclick={() => (completeOpen = true)}>
          Completar desde ARCA ({completeCandidates.length})
        </Button>
      {/if}
      {#if hasActiveFilters}
        <button class="clear-all" onclick={clearAllFilters} type="button"> Limpiar filtros </button>
      {/if}
    </div>
  </section>

  <section class="list">
    <div class="list-head">
      <span>Fecha</span>
      <span>Emisor (CUIT)</span>
      <span>Comprobante / Archivo</span>
      <span class="align-right">Total</span>
      <span>Categoría</span>
      <span>Estado</span>
      <span>Hash</span>
      <span></span>
    </div>
    {#each visibleComprobantes as comp (comp.id)}
      {@const canCopy = canGenerateFilename(comp)}
      {@const hasEmitter = !!(
        getEmitterName(comp).short ||
        comp.final?.cuit ||
        comp.expected?.cuit ||
        comp.file?.extractedCuit
      )}
      {@const isBalancePrincipal = comp.expected?.isBalanceGroupPrincipal ?? false}
      {@const expectedId = comp.expected?.id}
      {@const isExpanded = expectedId != null && expandedGroups.has(expectedId)}
      {@const isLoading = expectedId != null && loadingGroups.has(expectedId)}
      <div class="row">
        <!-- Columna 1: Fecha -->
        <span class="col-date">
          {comp.effectiveDate ? formatDateShort(comp.effectiveDate) : '—'}
        </span>

        <!-- Columna 2: Emisor (CUIT) -->
        <span
          class="col-emisor-cuit"
          class:hidden={!hasEmitter}
          title={getEmitterName(comp).full || undefined}
        >
          {#if getEmitterName(comp).short}
            <span class="emitter-name">{getEmitterName(comp).short}</span>
            <span class="cuit-inline"
              >{formatCuit(
                comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit
              )}</span
            >
          {:else}
            {formatCuit(comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit)}
          {/if}
        </span>

        <!-- Columna 3: Comprobante/Archivo -->
        <span class="col-cmp" class:col-cmp-extended={!hasEmitter}>
          {#if isBalancePrincipal && expectedId != null}
            <button
              class="expand-btn"
              onclick={() => toggleBalanceGroup(expectedId)}
              title={isExpanded ? 'Colapsar grupo' : 'Expandir grupo de balance'}
              type="button"
            >
              {#if isLoading}
                <span class="spinner"></span>
              {:else if isExpanded}
                <ChevronDown size={14} />
              {:else}
                <ChevronRight size={14} />
              {/if}
            </button>
          {/if}
          {formatComprobante(comp)}
        </span>
        <span class="col-total align-right"
          >{formatCurrency(
            comp.final?.total ?? comp.expected?.total ?? comp.file?.extractedTotal
          )}</span
        >
        <span class="col-category">
          {#if comp.final}
            <CategorySelect
              {categories}
              value={comp.final.categoryId ?? null}
              onchange={(id: number | null) => comp.final && updateCategory(comp.final.id, id)}
            />
          {:else if comp.expected}
            <CategorySelect
              {categories}
              value={comp.expected.categoryId ?? null}
              onchange={(id: number | null) =>
                comp.expected && updateExpectedCategory(comp.expected.id, id)}
            />
          {:else if comp.file}
            <CategorySelect
              {categories}
              value={comp.file.categoryId ?? null}
              onchange={(id: number | null) => comp.file && updateFileCategory(comp.file.id, id)}
            />
          {:else}
            —
          {/if}
        </span>
        <span class="col-type-status">
          <CompletenessIndicator comprobante={comp} />
          <TaxBreakdownIndicator
            reconciliation={comp.taxReconciliation}
            expanded={comp.final != null && openBreakdowns.has(comp.final.id)}
            ontoggle={() => comp.final && toggleBreakdown(comp.final.id)}
          />
        </span>
        <span class="col-hash"
          >{comp.final?.fileHash || comp.file?.fileHash
            ? shortHash(comp.final?.fileHash || comp.file?.fileHash)
            : '—'}</span
        >
        <span class="col-actions">
          <div class="copy-dropdown-wrapper">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <button
              class="copy-btn"
              class:copied={copiedId === comp.id}
              disabled={!canCopy}
              title={canCopy ? 'Copiar nombre' : 'Datos insuficientes para generar nombre'}
              onclick={(e) => {
                e.stopPropagation();
                openMenuId = openMenuId === comp.id ? null : comp.id;
              }}
            >
              {#if copiedId === comp.id}
                <CopyCheck size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </button>
            {#if openMenuId === comp.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="copy-menu" onclick={(e) => e.stopPropagation()}>
                <button class="copy-menu-item" onclick={() => copyFilename(comp, 'file')}>
                  Nombre archivo
                </button>
                <button class="copy-menu-item" onclick={() => copyFilename(comp, 'sheet')}>
                  Nombre planilla
                </button>
              </div>
            {/if}
          </div>
          <Button size="sm" onclick={() => navigateToDetail(comp.id)}>Ver</Button>
        </span>
      </div>
      {#if comp.final && comp.taxReconciliation && openBreakdowns.has(comp.final.id)}
        <div class="row sub-row breakdown-row">
          <TaxBreakdownRowPanel
            invoiceId={comp.final.id}
            refreshToken={reconVersion}
            onapplied={onBreakdownApplied}
          />
        </div>
      {/if}
      {#if isExpanded && expectedId != null}
        {@const group = expandedGroups.get(expectedId)}
        {@const members = group?.members ?? []}
        {#each members as member, idx}
          {@const isLast = idx === members.length - 1}
          {@const memberInvoiceType =
            member.expected?.invoiceType ?? member.final?.invoiceType ?? null}
          <div class="row sub-row">
            <span class="col-date">
              {member.effectiveDate ? formatDateShort(member.effectiveDate) : '—'}
            </span>
            <span class="col-emisor-cuit"></span>
            <span class="col-cmp">
              <span class="sub-row-indent">{isLast ? '└' : '├'}</span>
              {formatComprobante(member)}
            </span>
            <span
              class="col-total align-right"
              class:total-credit={isCreditNote(memberInvoiceType)}
            >
              {formatSignedTotal(
                member.expected?.total ??
                  member.final?.total ??
                  member.file?.extractedTotal ??
                  null,
                memberInvoiceType
              )}
            </span>
            <span class="col-category">
              {#if member.expected}
                <CategorySelect
                  {categories}
                  value={member.expected.categoryId ?? null}
                  onchange={(id: number | null) =>
                    member.expected && updateExpectedCategory(member.expected.id, id)}
                />
              {:else}
                —
              {/if}
            </span>
            <span class="col-type-status">
              <CompletenessIndicator comprobante={member} />
            </span>
            <span class="col-hash">—</span>
            <span class="col-actions">
              <Button size="sm" onclick={() => navigateToDetail(member.id)}>Ver</Button>
            </span>
          </div>
        {/each}
        {#if group}
          <div class="row sub-row sub-row-total">
            <span class="col-date"></span>
            <span class="col-emisor-cuit"></span>
            <span class="col-cmp"></span>
            <span class="col-total align-right">
              <span
                class="balance-total"
                class:balanced={group.isBalanced}
                class:unbalanced={!group.isBalanced}
              >
                = {formatCurrency(Math.abs(group.total))}
              </span>
            </span>
            <span class="col-category"></span>
            <span class="col-type-status"></span>
            <span class="col-hash"></span>
            <span class="col-actions"></span>
          </div>
        {/if}
      {/if}
    {/each}
  </section>
</div>

<CompleteFromArcaDialog
  bind:open={completeOpen}
  items={completeCandidates}
  onapplied={onBreakdownApplied}
/>

<style>
  .page-container {
    position: relative;
    width: 100%;
  }

  .header {
    margin-bottom: var(--spacing-4);
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin: 0;
  }
  h1 {
    margin: 0.25rem 0 0.5rem;
  }
  .hint {
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* Dropzone compacto clickeable */
  .dropzone-wrapper {
    display: flex;
    gap: var(--spacing-3);
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .dropzone-compact {
    flex: 1;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-2) var(--spacing-3);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .dropzone-compact:hover {
    border-color: var(--color-primary-300);
    background: var(--color-surface-alt);
  }

  .dz-compact-hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .upload-category-wrapper {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    flex-shrink: 0;
    cursor: default;
  }

  .upload-category-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .upload-category-select {
    width: 160px;
  }

  /* Overlay que aparece cuando se arrastra sobre la página */
  .dropzone-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 4px dashed var(--color-primary-500);
    border-radius: var(--radius-lg);
    animation: fadeIn var(--transition-fast);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dropzone-content {
    text-align: center;
  }

  .dz-icon {
    font-size: 3rem;
    margin: 0 0 var(--spacing-2);
  }

  .dz-title {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-xl);
    margin: 0 0 var(--spacing-1);
  }

  .dz-hint {
    margin: 0;
    color: var(--color-text-tertiary);
  }

  .list {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--color-surface);
  }
  .list-head,
  .row {
    display: grid;
    /* Fecha | Emisor (flexible) | Comprobante | Total | Categoría | Estado | Hash | Acción */
    grid-template-columns: 85px minmax(200px, 1fr) 220px 110px 150px 120px 70px 100px;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    align-items: center;
  }
  .list-head {
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }
  .row {
    border: none;
    border-top: 1px solid var(--color-border);
    background: transparent;
    text-align: left;
    width: 100%;
    text-decoration: none;
    color: inherit;
  }
  .row:hover {
    background: var(--color-surface-alt);
  }

  .row.sub-row {
    background: var(--color-primary-50);
    border-top: 1px solid var(--color-primary-100);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
  .row.sub-row:last-of-type {
    border-bottom: 1px solid var(--color-primary-100);
  }

  .sub-row-indent {
    color: var(--color-primary-300);
    margin-right: var(--spacing-1);
    font-family: monospace;
  }

  .total-credit {
    color: var(--color-error);
  }

  .balance-total {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-sm);
  }
  .balance-total.balanced {
    color: var(--color-success-600);
  }
  .balance-total.unbalanced {
    color: var(--color-warning-600);
  }

  .sub-row-total {
    border-top: 2px solid var(--color-primary-200);
  }

  .expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 0;
    margin-right: var(--spacing-1);
    cursor: pointer;
    color: var(--color-primary-600);
    border-radius: var(--radius-sm);
    width: 18px;
    height: 18px;
  }
  .expand-btn:hover {
    background: var(--color-primary-100);
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-primary-200);
    border-top-color: var(--color-primary-600);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tag {
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    border: 1px solid transparent;
  }
  .tag.ok {
    background: var(--color-primary-50);
    color: var(--color-primary-700);
    border-color: var(--color-primary-200);
  }
  .tag.warn {
    background: #fff7ed;
    color: #9a3412;
    border-color: #fed7aa;
  }
  .tag.info {
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
    border-color: var(--color-neutral-200);
  }
  .tag.neutral {
    background: var(--color-neutral-50);
    color: var(--color-text-tertiary);
    border-color: var(--color-neutral-200);
  }

  /* Columna tipo/estado con múltiples tags */
  .col-type-status {
    display: flex;
    gap: var(--spacing-1);
    flex-wrap: nowrap;
  }

  /* Columna de comprobante */
  .col-cmp {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-sm);
  }

  /* Comprobante extendido cuando no hay emisor */
  .col-cmp-extended {
    grid-column: span 2;
  }

  /* Emisor y CUIT en la misma columna */
  .col-emisor-cuit {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
  }

  /* Ocultar emisor y quitar del grid flow (para que col-cmp-extended span 2 funcione).
     Debe ir después de .col-emisor-cuit para ganar por cascade. */
  .hidden {
    display: none;
  }

  .emitter-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .cuit-inline {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    white-space: nowrap;
    text-align: right;
  }

  /* Total con tipografía monospace */
  .col-total {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-sm);
  }

  /* Hash más compacto */
  .col-hash {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  /* Actions: Copy + Ver */
  .col-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--spacing-1);
  }

  .copy-dropdown-wrapper {
    position: relative;
  }

  .copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base, 4px);
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .copy-btn:hover:not(:disabled) {
    background: var(--color-surface-alt);
    color: var(--color-text-primary);
    border-color: var(--color-primary-300);
  }

  .copy-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .copy-btn.copied {
    color: var(--color-primary-700);
    border-color: var(--color-primary-300);
  }

  .copy-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 50;
    margin-top: var(--spacing-1);
    min-width: 160px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--spacing-1);
  }

  .copy-menu-item {
    display: block;
    width: 100%;
    padding: var(--spacing-1) var(--spacing-2);
    border: none;
    border-radius: var(--radius-base, 4px);
    background: transparent;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }

  .copy-menu-item:hover {
    background: var(--color-surface-alt);
  }

  .align-right {
    text-align: right;
  }

  /* Búsqueda meta-lenguaje */
  .search-section {
    margin-bottom: var(--spacing-3);
  }

  .filter-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-3);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    border-radius: var(--radius-md);
  }

  .filter-summary .count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .clear-all {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-3);
    cursor: pointer;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
  }

  .clear-all:hover {
    border-color: var(--color-error);
    color: var(--color-error);
    background: #fef2f2;
  }

  .filter-actions {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
  }

  .copy-table-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-3);
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    transition: all 0.15s;
  }

  .copy-table-btn:hover {
    border-color: var(--color-primary-300);
    color: var(--color-primary-700);
    background: var(--color-primary-50);
  }

  .copy-table-btn.copied {
    border-color: var(--color-success-300);
    color: var(--color-success-700);
  }

  .active-filters-section {
    margin-bottom: var(--spacing-3);
  }
</style>
