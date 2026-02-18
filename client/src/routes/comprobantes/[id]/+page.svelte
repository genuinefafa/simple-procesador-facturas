<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import DuplicateHashAlert from '$lib/components/DuplicateHashAlert.svelte';
  import NavigationBar from '$lib/components/NavigationBar.svelte';
  import SourceComparison from '$lib/components/SourceComparison.svelte';
  import InvoiceCard from '$lib/components/InvoiceCard.svelte';
  import EmitterCombobox from '$lib/components/EmitterCombobox.svelte';
  import BalanceGroupPanel from '$lib/components/BalanceGroupPanel.svelte';
  import type { PageData } from './$types';
  import { toast, Toaster } from 'svelte-sonner';
  import { invalidateAll, goto } from '$app/navigation';
  import {
    formatDateTime,
    formatDateShort,
    getFriendlyType,
    formatCuit,
    formatInvoiceLabel,
    formatCurrency,
  } from '$lib/formatters';
  import { createInvoiceForm } from '$lib/stores/createInvoiceForm.svelte';
  import { createEmitterResolver } from '$lib/stores/emitterResolver.svelte';
  import { createDeleteHandler } from '$lib/stores/deleteInvoice.svelte';
  import {
    comprobanteService,
    type ExpectedInvoiceSummary,
    type ExpectedCandidate,
    type ExtractionMethod,
    type BalanceGroup,
  } from '$lib/services/ComprobanteService';

  let { data } = $props();
  let comprobante = $derived(data.comprobante);
  let categories = $derived(data.categories || []);

  // Stores
  const invoiceForm = createInvoiceForm();
  const emitterResolver = createEmitterResolver();
  const deleteHandler = createDeleteHandler();

  let processing = $state(false);
  let linkExpectedDialogOpen = $state(false);
  let sourceComparisonRef: SourceComparison | null = $state(null);
  let availableExpected = $state<ExpectedInvoiceSummary[]>([]);

  // Balance group state (for expected invoices without files)
  let balanceGroup = $state<BalanceGroup | null>(null);
  let loadingBalance = $state(false);
  let balanceSearchDialogOpen = $state(false);
  // ID de la extracción seleccionada actualmente (para verificar si tiene datos)
  let currentExtractionId = $state<number | null>(null);

  // Candidatos automáticos (del scoring basado en extracción)
  let autoCandidates = $state<ExpectedCandidate[]>([]);
  // Candidatos agregados manualmente desde el diálogo de búsqueda
  let manualCandidates = $state<ExpectedCandidate[]>([]);
  // Combinación de todas las fuentes para el dropdown (sin duplicados)
  // Prioridad: manuales > linked > localMatches > autoCandidates
  // Limitamos auto-candidates a 5 para no saturar la lista
  const alternativeCandidates = $derived.by(() => {
    const result: ExpectedCandidate[] = [];
    const seenIds = new Set<number>();

    // 1. Candidatos manuales primero (agregados desde el diálogo)
    for (const c of manualCandidates) {
      if (!seenIds.has(c.id)) {
        result.push(c);
        seenIds.add(c.id);
      }
    }

    // 2. Expected vinculado en DB (comprobante.expected)
    if (comprobante.expected && !seenIds.has(comprobante.expected.id)) {
      result.push({
        id: comprobante.expected.id,
        cuit: comprobante.expected.cuit,
        emitterName: comprobante.expected.emitterName ?? null,
        issueDate: comprobante.expected.issueDate,
        invoiceType: comprobante.expected.invoiceType,
        pointOfSale: comprobante.expected.pointOfSale,
        invoiceNumber: comprobante.expected.invoiceNumber,
        total: comprobante.expected.total ?? null,
        status: comprobante.expected.status ?? 'pending',
        categoryId: comprobante.expected.categoryId ?? null,
        matchScore: 100,
        matchedFields: ['linked'],
      });
      seenIds.add(comprobante.expected.id);
    }

    // 3. Matches automáticos de localMatches
    // Usa matchesOverride si existe (cuando cambia extracción), sino comprobante.matches
    const matches = matchesOverride ?? comprobante.matches ?? [];
    for (const m of matches) {
      if (!seenIds.has(m.id)) {
        result.push({
          id: m.id,
          cuit: m.cuit,
          emitterName: m.emitterName ?? null,
          issueDate: m.issueDate,
          invoiceType: m.invoiceType,
          pointOfSale: m.pointOfSale,
          invoiceNumber: m.invoiceNumber,
          total: m.total ?? null,
          status: m.status ?? 'pending',
          categoryId: m.categoryId ?? null,
          matchScore: m.matchScore ?? 0,
          matchedFields: m.matchedFields ?? [],
        });
        seenIds.add(m.id);
      }
    }

    // 4. Candidatos automáticos adicionales (del scoring de extracción)
    // Limitamos a 5 para no saturar
    let autoAdded = 0;
    for (const c of autoCandidates) {
      if (autoAdded >= 5) break;
      if (!seenIds.has(c.id)) {
        result.push(c);
        seenIds.add(c.id);
        autoAdded++;
      }
    }

    return result;
  });
  let loadingExpected = $state(false);
  let selectedEmitterForSearch = $state<{ cuit: string; name: string } | null>(null);

  // Track si ya intentamos QR automático para este file (evitar loops)
  let autoQrAttemptedForFileId = $state<number | null>(null);

  // Auto-QR: cuando abrimos un file sin expected vinculado, intentar QR si no existe
  $effect(() => {
    // Solo para archivos pendientes (sin factura final)
    if (comprobante.kind !== 'file' || comprobante.final) return;

    // Solo si no tiene expected vinculado
    if (comprobante.expected) return;

    const file = comprobante.file;
    if (!file) return;

    // Evitar re-intentar si ya lo hicimos para este file
    if (autoQrAttemptedForFileId === file.id) return;

    // Verificar si ya existe una extracción QR
    const extractions = file.extractions ?? [];
    const hasQrExtraction = extractions.some((e) => e.method?.toUpperCase() === 'QR');

    if (hasQrExtraction) {
      // Ya tiene QR, marcar como intentado y auto-seleccionarlo
      autoQrAttemptedForFileId = file.id;
      // Buscar el ID de la extracción QR para seleccionarla
      const qrExtraction = extractions.find((e) => e.method?.toUpperCase() === 'QR');
      if (qrExtraction && sourceComparisonRef) {
        // Dar tiempo a que el componente se monte
        setTimeout(() => sourceComparisonRef?.selectExtraction(qrExtraction.id), 50);
      }
      return;
    }

    // Marcar como intentado antes de disparar (evitar re-trigger)
    autoQrAttemptedForFileId = file.id;

    // Disparar QR automáticamente (sin toast de loading, es background)
    console.info(`[AUTO-QR] Iniciando extracción QR automática para file:${file.id}`);
    processQrAutomatically(file.id);
  });

  // Función separada para evitar problemas con async en $effect
  async function processQrAutomatically(fileId: number) {
    const result = await comprobanteService.processFile(fileId, 'qr');

    if (result.success && result.extraction) {
      console.info(`[AUTO-QR] Extracción exitosa (${result.extraction.confidence}% confianza)`);
      toast.success(`QR detectado: ${result.extraction.confidence}% confianza`);
      await invalidateAll();
      // Seleccionar la nueva extracción QR
      setTimeout(() => sourceComparisonRef?.selectMostRecent(), 100);
    } else {
      // QR falló silenciosamente (es esperado para muchos documentos)
      console.info(`[AUTO-QR] No se encontró QR: ${result.error}`);
    }
  }

  // Cargar candidatos automáticos cuando hay un file con datos extraídos
  $effect(() => {
    // Solo si no hay factura final y hay file
    if (comprobante.final || !comprobante.file) {
      autoCandidates = [];
      return;
    }

    const extraction = comprobante.file.extractions?.[0];
    if (!extraction?.extractedCuit) {
      autoCandidates = [];
      return;
    }

    // Cargar candidatos basados en los datos extraídos
    loadAutoCandidates(extraction);
  });

  async function loadAutoCandidates(extraction: {
    extractedCuit?: string | null;
    extractedType?: number | null;
    extractedPointOfSale?: number | null;
    extractedInvoiceNumber?: number | null;
    extractedDate?: string | null;
    extractedTotal?: number | null;
  }) {
    const result = await comprobanteService.searchExpectedCandidates({
      cuit: extraction.extractedCuit || undefined,
      invoiceType: extraction.extractedType ?? undefined,
      pointOfSale: extraction.extractedPointOfSale ?? undefined,
      invoiceNumber: extraction.extractedInvoiceNumber ?? undefined,
      issueDate: extraction.extractedDate || undefined,
      total: extraction.extractedTotal ?? undefined,
      limit: 6,
    });

    if (result.success) {
      autoCandidates = result.data || [];
    }
  }

  // Matches locales - pueden actualizarse al cambiar extracción
  // Usamos un contador de versión del comprobante para resetear cuando cambia
  let matchesOverride = $state<typeof comprobante.matches | null>(null);
  let selectedExpectedOverride = $state<ExpectedCandidate | null>(null);
  // Se inicializa vacío y se actualiza en el effect para evitar warning de Svelte
  let lastComprobanteId = $state<string>('');

  // Helper para convertir expected del comprobante a ExpectedCandidate
  function expectedToCandidate(exp: NonNullable<typeof comprobante.expected>): ExpectedCandidate {
    return {
      id: exp.id,
      cuit: exp.cuit,
      emitterName: exp.emitterName ?? null,
      issueDate: exp.issueDate,
      invoiceType: exp.invoiceType,
      pointOfSale: exp.pointOfSale,
      invoiceNumber: exp.invoiceNumber,
      total: exp.total ?? null,
      status: exp.status ?? 'pending',
      categoryId: exp.categoryId ?? null,
      matchScore: 100,
      matchedFields: ['linked'],
    };
  }

  // Reset overrides when comprobante changes
  $effect(() => {
    if (comprobante.id !== lastComprobanteId) {
      matchesOverride = null;
      selectedExpectedOverride = null;
      currentExtractionId = null;
      // Reset estado de búsqueda manual
      selectedEmitterForSearch = null;
      availableExpected = [];
      manualCandidates = [];
      // Reset balance group state
      balanceGroup = null;

      lastComprobanteId = comprobante.id;
    }
  });

  // Load balance group for expected invoices without files
  $effect(() => {
    if (comprobante.kind === 'expected' && comprobante.expected && !comprobante.file) {
      loadBalanceGroup(comprobante.expected.id);
    }
  });

  async function loadBalanceGroup(expectedId: number) {
    loadingBalance = true;
    const result = await comprobanteService.getBalanceGroup(expectedId);
    if (result.success) {
      balanceGroup = result.data ?? null;
    } else {
      console.error('Error loading balance group:', result.error);
    }
    loadingBalance = false;
  }

  function openBalanceSearchDialog() {
    // Pre-select the emitter from current expected invoice
    if (comprobante.expected?.cuit) {
      const cuit = comprobante.expected.cuit;
      const name = comprobante.expected.emitterName || comprobante.emitterName || cuit;
      selectedEmitterForSearch = { cuit, name };
      searchExpectedByEmitter({ cuit, name });
    }
    balanceSearchDialogOpen = true;
  }

  async function handleAddToBalance(expectedId: number) {
    if (!comprobante.expected) return;

    const result = await comprobanteService.addToBalanceGroup(comprobante.expected.id, expectedId);

    if (result.success) {
      toast.success('Comprobante agregado al grupo de balance');
      if (result.warnings) {
        for (const warning of result.warnings) {
          toast.warning(warning);
        }
      }
      balanceSearchDialogOpen = false;
      // Refresh all page data (including comprobante status)
      await invalidateAll();
      // Re-load balance group from updated data
      if (comprobante.expected) {
        await loadBalanceGroup(comprobante.expected.id);
      }
    } else {
      toast.error(result.error || 'Error al agregar al grupo');
    }
  }

  async function handleRemoveFromBalance(memberId: number) {
    if (!comprobante.expected || !balanceGroup) return;

    const result = await comprobanteService.removeFromBalanceGroup(
      balanceGroup.principalId,
      memberId
    );

    if (result.success) {
      toast.success('Comprobante quitado del grupo');
      await invalidateAll();
      if (comprobante.expected) {
        await loadBalanceGroup(comprobante.expected.id);
      }
    } else {
      toast.error(result.error || 'Error al quitar del grupo');
    }
  }

  async function handleSetBalancePrincipal(memberId: number) {
    if (!comprobante.expected || !balanceGroup) return;

    const result = await comprobanteService.setBalanceGroupPrincipal(
      balanceGroup.principalId,
      memberId
    );

    if (result.success) {
      toast.success('Principal del grupo cambiado');
      await invalidateAll();
      if (comprobante.expected) {
        await loadBalanceGroup(comprobante.expected.id);
      }
    } else {
      toast.error(result.error || 'Error al cambiar el principal');
    }
  }

  async function handleDissolveBalanceGroup() {
    if (!comprobante.expected || !balanceGroup) return;

    const result = await comprobanteService.dissolveBalanceGroup(balanceGroup.principalId);

    if (result.success) {
      toast.success('Grupo de balance disuelto');
      balanceGroup = null;
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al disolver el grupo');
    }
  }

  // Computed matches: usa override si existe, sino los del comprobante
  const localMatches = $derived(matchesOverride ?? comprobante.matches ?? []);

  const formatHash = (hash: string | null | undefined) => {
    if (!hash) return '—';
    return `${hash.substring(0, 16)}...`;
  };

  // Determinar si es una expected sin archivo (no permite crear factura directamente)
  const isExpectedWithoutFile = $derived(
    comprobante.kind === 'expected' && !comprobante.file && !comprobante.final
  );

  // Determinar si mostrar la comparación de fuentes (sin factura final)
  const showSourceComparison = $derived(
    !comprobante.final && (comprobante.file || comprobante.expected)
  );

  // Verifica si la extracción seleccionada tiene algún dato útil
  const currentExtractionHasData = $derived.by(() => {
    const extractions = comprobante.file?.extractions;
    if (!extractions || extractions.length === 0) return true; // Sin extracciones = no aplica
    const extId = currentExtractionId ?? extractions[0]?.id;
    if (!extId) return false;
    const ext = extractions.find((e) => e.id === extId);
    if (!ext) return true; // Fallback: asumir que tiene datos
    return !!(
      ext.extractedCuit ||
      ext.extractedDate ||
      ext.extractedTotal !== null ||
      ext.extractedType !== null ||
      ext.extractedPointOfSale !== null ||
      ext.extractedInvoiceNumber !== null
    );
  });

  // El mejor match: usa override si el usuario seleccionó uno, sino expected vinculado, sino primer match
  const bestExpected = $derived.by(() => {
    // Si el usuario seleccionó uno del dropdown, mostrarlo
    if (selectedExpectedOverride) {
      return {
        id: selectedExpectedOverride.id,
        cuit: selectedExpectedOverride.cuit,
        emitterName: selectedExpectedOverride.emitterName,
        issueDate: selectedExpectedOverride.issueDate,
        invoiceType: selectedExpectedOverride.invoiceType,
        pointOfSale: selectedExpectedOverride.pointOfSale,
        invoiceNumber: selectedExpectedOverride.invoiceNumber,
        total: selectedExpectedOverride.total,
        status: selectedExpectedOverride.status,
        categoryId: selectedExpectedOverride.categoryId ?? null,
      };
    }
    // Si hay expected vinculado al comprobante, usarlo
    if (comprobante.expected) return comprobante.expected;
    // Si la extracción seleccionada no tiene datos, no mostrar matches automáticos
    if (!currentExtractionHasData) return null;
    // Sino, usar el primer match automático
    if (localMatches && localMatches.length > 0) {
      const m = localMatches[0];
      return {
        id: m.id,
        cuit: m.cuit,
        emitterName: m.emitterName,
        issueDate: m.issueDate,
        invoiceType: m.invoiceType,
        pointOfSale: m.pointOfSale,
        invoiceNumber: m.invoiceNumber,
        total: m.total,
        status: m.status,
        categoryId: m.categoryId ?? null,
      };
    }
    return null;
  });

  // File para SourceComparison (solo datos de extracción)
  // El emitterName ya no se pasa - SourceComparison resuelve via EmitterService
  const enrichedFile = $derived(comprobante.file ?? null);

  // Sincronizar facturaData con comprobante cuando cambie
  $effect(() => {
    const fd = invoiceForm.formData;
    fd.cuit = comprobante.final?.cuit || comprobante.expected?.cuit || fd.cuit;
    fd.invoiceType =
      comprobante.final?.invoiceType || comprobante.expected?.invoiceType || fd.invoiceType;
    fd.pointOfSale =
      comprobante.final?.pointOfSale ?? comprobante.expected?.pointOfSale ?? fd.pointOfSale;
    fd.invoiceNumber =
      comprobante.final?.invoiceNumber ?? comprobante.expected?.invoiceNumber ?? fd.invoiceNumber;
    fd.issueDate = comprobante.final?.issueDate || comprobante.expected?.issueDate || fd.issueDate;
    fd.total = comprobante.final?.total ?? comprobante.expected?.total ?? fd.total;

    if (comprobante.expected) {
      invoiceForm.selectedExpectedId = comprobante.expected.id;
    }

    // Preseleccionar categoría desde la factura final si existe
    if (!invoiceForm.editMode && comprobante.final) {
      invoiceForm.selectedCategoryId = comprobante.final.categoryId ?? null;
    }
  });

  async function openLinkExpectedDialog() {
    linkExpectedDialogOpen = true;
    // No resetear el estado - mantener la búsqueda anterior
    // Si ya hay un emisor seleccionado, volver a buscar por si hay nuevos datos
    if (selectedEmitterForSearch) {
      searchExpectedByEmitter(selectedEmitterForSearch);
    }
  }

  async function searchExpectedByEmitter(emitter: { cuit: string; name: string } | null) {
    selectedEmitterForSearch = emitter;

    if (!emitter?.cuit) {
      availableExpected = [];
      return;
    }

    loadingExpected = true;
    const result = await comprobanteService.fetchPendingExpected(emitter.cuit);
    if (result.success) {
      availableExpected = result.data || [];
    } else {
      toast.error(result.error || 'Error al cargar facturas esperadas');
    }
    loadingExpected = false;
  }

  async function linkExpected(expectedId: number) {
    if (!comprobante.final) return;

    const toastId = toast.loading('Vinculando...');
    const result = await comprobanteService.linkExpected(comprobante.final.id, expectedId);

    if (result.success) {
      toast.success('Factura vinculada con expected', { id: toastId });
      linkExpectedDialogOpen = false;
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al vincular', { id: toastId });
    }
  }

  async function createFromSelectedExpected(expectedId: number) {
    // Buscar el expected en la lista de disponibles
    const selected = availableExpected.find((e) => e.id === expectedId);
    if (!selected) return;

    // Crear el candidato con formato completo
    const candidate: ExpectedCandidate = {
      id: selected.id,
      cuit: selected.cuit,
      emitterName: selected.emitterName,
      issueDate: selected.issueDate,
      invoiceType: selected.invoiceType,
      pointOfSale: selected.pointOfSale,
      invoiceNumber: selected.invoiceNumber,
      total: selected.total ?? null,
      status: selected.status,
      categoryId: selected.categoryId ?? null,
      matchScore: 100,
      matchedFields: ['manual'],
    };

    // Construir la nueva lista de candidatos manuales
    let newManualCandidates = [...manualCandidates];

    // Preservar el expected que estaba visible (puede ser selectedExpectedOverride o comprobante.expected)
    const currentExpectedId = selectedExpectedOverride?.id ?? comprobante.expected?.id;
    if (currentExpectedId && !newManualCandidates.some((c) => c.id === currentExpectedId)) {
      // Agregar el actual al final si no está
      const currentCandidate =
        selectedExpectedOverride ??
        (comprobante.expected ? expectedToCandidate(comprobante.expected) : null);
      if (currentCandidate) {
        newManualCandidates.push(currentCandidate);
      }
    }

    // Agregar el nuevo al principio si no existe
    if (!newManualCandidates.some((c) => c.id === candidate.id)) {
      newManualCandidates = [candidate, ...newManualCandidates];
    }

    // Actualizar estado
    manualCandidates = newManualCandidates;
    selectedExpectedOverride = candidate;

    // Cerrar el diálogo
    linkExpectedDialogOpen = false;
  }

  async function processPending(method?: ExtractionMethod) {
    if (!comprobante.file) return;

    processing = true;
    const methodLabel = method === 'pdf_text' ? 'PDF Text' : method === 'qr' ? 'QR' : 'OCR';
    const toastId = toast.loading(`Procesando con ${methodLabel}...`);

    const result = await comprobanteService.processFile(comprobante.file.id, method || 'ocr');

    if (result.success) {
      toast.success(
        `Procesado con ${methodLabel}: ${result.extraction?.confidence || 0}% confianza`,
        { id: toastId }
      );
      await invalidateAll();
      // Select the newly created extraction (most recent)
      sourceComparisonRef?.selectMostRecent();
    } else {
      toast.error(result.error || 'Error al procesar', { id: toastId });
    }
    processing = false;
  }

  // Re-fetch matches cuando el usuario cambia la extracción seleccionada
  async function handleExtractionChange(extractionId: number) {
    if (!comprobante.file) return;
    currentExtractionId = extractionId;

    try {
      const res = await fetch(
        `/api/files/${comprobante.file.id}/matches?extractionId=${extractionId}`
      );
      if (res.ok) {
        const matchData = await res.json();
        const newMatches: typeof comprobante.matches = [];

        if (matchData.hasExactMatch && matchData.exactMatch) {
          newMatches.push(matchData.exactMatch);
        }
        const additional = matchData.partialMatches || matchData.candidates || [];
        for (const m of additional) {
          if (!newMatches.find((e) => e.id === m.id)) {
            newMatches.push(m);
          }
        }

        matchesOverride = newMatches;
      }
    } catch (err) {
      console.warn('Error al recargar matches:', err);
    }
  }

  // Obtener ruta del archivo para preview
  const fileUrl = $derived.by(() => {
    // Factura: usar endpoint de factura (resuelve fileId internamente)
    if (comprobante.final?.id) {
      return `/api/comprobantes/factura:${comprobante.final.id}/file`;
    }
    // Archivo pendiente (sin factura)
    if (comprobante.file?.id) {
      return `/api/comprobantes/file:${comprobante.file.id}/file`;
    }
    return null;
  });

  const previewFilename = $derived.by(() => {
    if (comprobante.file?.originalFilename) {
      return comprobante.file.originalFilename;
    }
    if (comprobante.final?.filePath) {
      return comprobante.final.filePath.split('/').pop() || 'documento';
    }
    return 'documento';
  });

  // Título y subtítulo para NavigationBar
  const navTitle = $derived.by(() => {
    if (comprobante.final) {
      const type = getFriendlyType(comprobante.final.invoiceType);
      const pv = comprobante.final.pointOfSale
        ? String(comprobante.final.pointOfSale).padStart(4, '0')
        : '----';
      const num = comprobante.final.invoiceNumber
        ? String(comprobante.final.invoiceNumber).padStart(8, '0')
        : '--------';
      return `${type} ${pv}-${num}`;
    }
    if (comprobante.file) {
      return comprobante.file.originalFilename;
    }
    if (comprobante.expected) {
      const type = getFriendlyType(comprobante.expected.invoiceType);
      return `${type} ${String(comprobante.expected.pointOfSale).padStart(4, '0')}-${String(comprobante.expected.invoiceNumber).padStart(8, '0')}`;
    }
    return 'Comprobante';
  });

  // Subtítulo especial para archivos: "subido el fecha"
  const navFileSubtitle = $derived.by(() => {
    if (comprobante.file && !comprobante.final) {
      const uploadDate = comprobante.file.uploadDate;
      if (uploadDate) {
        return `subido el ${formatDateShort(uploadDate)}`;
      }
      return 'archivo pendiente de procesar';
    }
    return null;
  });

  // Fecha para el navbar (formato corto: 17/ene/2025)
  const navDate = $derived.by(() => {
    const date = comprobante.final?.issueDate || comprobante.expected?.issueDate;
    return date ? formatDateShort(date) : undefined;
  });

  // CUIT formateado con guiones
  const navCuit = $derived.by(() => {
    const cuit = comprobante.final?.cuit || comprobante.expected?.cuit;
    if (!cuit) return undefined;
    const formatted = formatCuit(cuit);
    return formatted === '—' ? undefined : formatted;
  });
</script>

<svelte:head>
  <title>Detalle Comprobante</title>
</svelte:head>

<div class="container">
  <NavigationBar
    currentId={comprobante.id}
    title={navTitle}
    date={navDate}
    emitterName={navFileSubtitle || comprobante.emitterName || undefined}
    cuit={navFileSubtitle ? undefined : navCuit}
  />

  <!-- Alerta de duplicados por hash (global, arriba) -->
  {#if comprobante.final?.fileHash || comprobante.file?.fileHash}
    {@const fileHash = comprobante.final?.fileHash || comprobante.file?.fileHash}
    {@const currentType = comprobante.final ? 'invoice' : 'file'}
    {@const currentId = comprobante.final?.id || comprobante.file?.id || 0}
    {@const linkedFileId = comprobante.final?.fileId || null}
    {@const linkedInvoiceId = comprobante.file?.linkedInvoiceId || null}
    <DuplicateHashAlert {fileHash} {currentId} {currentType} {linkedFileId} {linkedInvoiceId} />
  {/if}

  <div class="layout" class:has-invoice={comprobante.final}>
    <!-- Columna izquierda: Preview -->
    <aside class="preview-panel">
      {#if fileUrl}
        <FilePreview src={fileUrl} filename={previewFilename} showZoom={true} maxHeight="100%" />
      {:else}
        <div class="no-preview">
          <p>📄</p>
          <p>Sin archivo asociado</p>
        </div>
      {/if}
    </aside>

    <!-- Columna derecha: Contenido -->
    <div class="content">
      <!-- Comparación de fuentes (sin factura) -->
      {#if showSourceComparison}
        <section class="section comparison-section">
          <SourceComparison
            bind:this={sourceComparisonRef}
            file={enrichedFile}
            extractions={comprobante.file?.extractions ?? []}
            expected={bestExpected}
            alternativeExpected={alternativeCandidates}
            readonly={isExpectedWithoutFile}
            oncreatefromfile={() => {
              if (comprobante.file) {
                invoiceForm.populateFromFile(comprobante.file);
              }
            }}
            oncreatefromexpected={async () => {
              if (!bestExpected) return;
              const emitterName = await emitterResolver.resolve(bestExpected.cuit);
              if (emitterName === null) return;
              invoiceForm.populateFromExpected(bestExpected, emitterName);
            }}
            onreprocess={processPending}
            onsearchexpected={openLinkExpectedDialog}
            onexpectedchange={(expectedId) => {
              // Seleccionar un expected alternativo - mostrarlo en la comparación
              const selected = alternativeCandidates.find((c) => c.id === expectedId);
              if (selected) {
                selectedExpectedOverride = selected;
              }
            }}
            onextractionchange={handleExtractionChange}
            {processing}
            {categories}
            onfilecategorychange={async (categoryId) => {
              if (!comprobante.file) return;
              const result = await comprobanteService.updateFileCategory(
                comprobante.file.id,
                categoryId
              );
              if (result.success) {
                toast.success('Categoría actualizada');
                await invalidateAll();
              } else {
                toast.error(result.error || 'Error al actualizar categoría');
              }
            }}
            onexpectedcategorychange={async (categoryId) => {
              if (!bestExpected) return;
              const expectedId = bestExpected.id;
              const result = await comprobanteService.updateExpectedInvoiceCategory(
                expectedId,
                categoryId
              );
              if (result.success) {
                // Update optimista: parchear copias locales para que MatchIndicator reaccione
                if (selectedExpectedOverride?.id === expectedId) {
                  selectedExpectedOverride = { ...selectedExpectedOverride, categoryId };
                }
                if (matchesOverride) {
                  matchesOverride = matchesOverride.map((m) =>
                    m.id === expectedId ? { ...m, categoryId } : m
                  );
                }
                manualCandidates = manualCandidates.map((c) =>
                  c.id === expectedId ? { ...c, categoryId } : c
                );
                toast.success('Categoría actualizada');
                await invalidateAll();
              } else {
                toast.error(result.error || 'Error al actualizar categoría');
              }
            }}
          />
        </section>
      {/if}

      <!-- Factura Final: usar InvoiceCard con inline edit -->
      {#if comprobante.final}
        <section class="section factura-section">
          {#if comprobante.final.fileHash}
            <div class="meta-row small">
              <span class="meta"
                >Hash: <code class="hash">{formatHash(comprobante.final.fileHash)}</code></span
              >
              <span class="meta">Creada: {formatDateTime(comprobante.final.createdAt)}</span>
            </div>
          {/if}
          <InvoiceCard
            invoice={{
              id: comprobante.final.id,
              cuit: comprobante.final.cuit,
              emitterName: comprobante.emitterName,
              issueDate: comprobante.final.issueDate,
              invoiceType: comprobante.final.invoiceType,
              pointOfSale: comprobante.final.pointOfSale,
              invoiceNumber: comprobante.final.invoiceNumber,
              total: comprobante.final.total,
              categoryId: comprobante.final.categoryId,
            }}
            {categories}
            onsave={async (data) => {
              if (!comprobante.final) return;
              const toastId = toast.loading('Guardando cambios...');
              const result = await comprobanteService.updateInvoice(comprobante.final.id, data);
              if (result.success) {
                toast.success('Factura actualizada', { id: toastId });
                await invalidateAll();
              } else {
                toast.error(result.error || 'Error al guardar', { id: toastId });
              }
            }}
            oncategorychange={async (categoryId) => {
              if (!comprobante.final) return;
              const result = await comprobanteService.updateInvoiceCategory(
                comprobante.final.id,
                categoryId
              );
              if (result.success) {
                toast.success('Categoría actualizada');
                await invalidateAll();
              } else {
                toast.error(result.error || 'Error al actualizar categoría');
              }
            }}
            ondelete={() => deleteHandler.open(comprobante)}
          />

          {#if comprobante.final.expectedInvoiceId}
            <div class="expected-indicator">
              <span class="indicator-label"
                >📋 Vinculado a expected #{comprobante.final.expectedInvoiceId}</span
              >
            </div>
          {:else}
            <div class="expected-indicator missing">
              <span class="indicator-label">📋 Sin vincular al fisco</span>
              <button type="button" class="link-button" onclick={openLinkExpectedDialog}>
                Buscar y vincular
              </button>
            </div>
          {/if}
        </section>

        <!-- Sin factura + editMode: InvoiceCard en modo create -->
      {:else if !isExpectedWithoutFile && invoiceForm.editMode}
        <section class="section factura-section">
          <InvoiceCard
            mode="create"
            invoice={{
              cuit: invoiceForm.formData.cuit,
              emitterName: invoiceForm.resolvedEmitterName,
              issueDate: invoiceForm.formData.issueDate,
              invoiceType: invoiceForm.formData.invoiceType,
              pointOfSale: invoiceForm.formData.pointOfSale,
              invoiceNumber: invoiceForm.formData.invoiceNumber,
              total: invoiceForm.formData.total,
              categoryId: invoiceForm.selectedCategoryId,
            }}
            {categories}
            onsave={async (data) => {
              await invoiceForm.submit(comprobante.file?.id, data);
            }}
            oncancel={() => invoiceForm.reset()}
          />

          {#if invoiceForm.selectedExpectedId}
            <div class="expected-indicator below-total">
              <span class="indicator-label"
                >📋 Vinculado a expected #{invoiceForm.selectedExpectedId}</span
              >
              <button
                type="button"
                class="link-button"
                onclick={() => invoiceForm.unlinkExpected()}
              >
                ✕ Desvincular
              </button>
            </div>
          {/if}
        </section>

        <!-- Sin factura + sin editMode: solo SourceComparison con botones -->
      {:else if !isExpectedWithoutFile}
        <!-- El SourceComparison ya se muestra arriba, no necesitamos más acá -->

        <!-- Expected sin archivo: Balance Group (arriba) + mensaje informativo (abajo) -->
      {:else}
        <!-- Balance Group Panel - separado del mensaje informativo -->
        {#if comprobante.expected}
          <section class="section balance-section">
            <BalanceGroupPanel
              expectedId={comprobante.expected.id}
              group={balanceGroup}
              loading={loadingBalance}
              onadd={openBalanceSearchDialog}
              onremove={handleRemoveFromBalance}
              onsetprincipal={handleSetBalancePrincipal}
              ondissolve={handleDissolveBalanceGroup}
              onmemberclick={(memberId) => goto(`/comprobantes/expected:${memberId}`)}
            />
          </section>
        {/if}

        <!-- Mensaje informativo sobre factura sin archivo -->
        <section class="section factura-section">
          <div class="alert alert-info">
            <strong>Factura esperada sin archivo</strong>
            <p>
              Esta factura está registrada en el sistema pero aún no tiene un comprobante digital
              asociado.
            </p>
            <p class="workflow-hint">
              <strong>Workflow:</strong> Para crear la factura, primero debés subir el comprobante digital.
              Luego el sistema lo vinculará automáticamente con esta expected y podrás finalizarla.
            </p>
            <Button size="sm" variant="secondary" onclick={() => goto('/comprobantes')}>
              Ir a Comprobantes
            </Button>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<Toaster position="top-right" richColors />

<!-- Dialog de confirmación de eliminación -->
<Dialog
  bind:open={deleteHandler.dialogOpen}
  title={comprobante.final
    ? '⚠️ Eliminar Factura'
    : comprobante.file
      ? '⚠️ Eliminar Archivo Pendiente'
      : '⚠️ Eliminar Comprobante'}
  description="Esta acción no se puede deshacer"
>
  <div class="delete-dialog-content">
    {#if comprobante.final}
      <p>¿Estás seguro de que querés eliminar esta factura?</p>
      <div class="delete-info">
        <p><strong>La factura será eliminada pero:</strong></p>
        <ul>
          <li>• Los archivos se mantendrán</li>
          <li>• Si tiene factura esperada vinculada, volverá a estado "pendiente"</li>
          <li>• Si tiene archivo pendiente vinculado, volverá a "en revisión"</li>
        </ul>
      </div>
    {:else if comprobante.file}
      <p>¿Estás seguro de que querés eliminar este archivo pendiente?</p>
      <div class="delete-info">
        <p><strong>Se eliminará:</strong></p>
        <ul>
          <li>• El registro en base de datos</li>
          <li>
            • El archivo físico del disco <strong
              >solo si no está vinculado a ninguna factura</strong
            >
          </li>
        </ul>
        <p class="info-note">
          📌 Si existe una factura que usa este archivo, el archivo físico se preservará
          automáticamente.
        </p>
      </div>
    {/if}

    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => deleteHandler.close()}>Cancelar</Button>
      <Button variant="danger" onclick={() => deleteHandler.confirm(comprobante)}>Eliminar</Button>
    </div>
  </div>
</Dialog>

<!-- Dialog para vincular expected -->
<Dialog bind:open={linkExpectedDialogOpen} title="Buscar factura esperada">
  <div class="link-expected-content">
    <EmitterCombobox
      value={selectedEmitterForSearch
        ? {
            name: selectedEmitterForSearch.name,
            displayName: selectedEmitterForSearch.name,
            cuit: selectedEmitterForSearch.cuit,
          }
        : null}
      onselect={(emitter) => {
        if (emitter) {
          searchExpectedByEmitter({ cuit: emitter.cuit, name: emitter.name });
        } else {
          searchExpectedByEmitter(null);
        }
      }}
    />

    {#if loadingExpected}
      <p class="loading-text">Buscando facturas esperadas...</p>
    {:else if !selectedEmitterForSearch}
      <p class="help-text">Buscá un emisor para ver sus facturas esperadas pendientes.</p>
    {:else if availableExpected.length === 0}
      <p class="empty-text">
        No hay facturas esperadas pendientes para {selectedEmitterForSearch.name}.
      </p>
    {:else}
      <p class="help-text">Seleccioná la factura esperada que corresponde:</p>
      <div class="expected-list">
        {#each availableExpected as exp}
          {@const isAlreadyAdded = alternativeCandidates.some((c) => c.id === exp.id)}
          <button
            type="button"
            class="expected-option"
            class:already-added={isAlreadyAdded}
            onclick={() => {
              if (comprobante.final) {
                linkExpected(exp.id);
              } else {
                createFromSelectedExpected(exp.id);
              }
            }}
          >
            <div class="expected-main">
              <span class="expected-type">{getFriendlyType(exp.invoiceType)}</span>
              <span class="expected-number">
                {String(exp.pointOfSale).padStart(4, '0')}-{String(exp.invoiceNumber).padStart(
                  8,
                  '0'
                )}
              </span>
              {#if isAlreadyAdded}
                <span class="added-badge">en lista</span>
              {/if}
            </div>
            <div class="expected-details">
              <span class="expected-date">{formatDateShort(exp.issueDate)}</span>
              {#if exp.total}
                <span class="expected-total">${exp.total.toLocaleString('es-AR')}</span>
              {/if}
            </div>
            {#if exp.emitterName}
              <div class="expected-emitter">{exp.emitterName}</div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => (linkExpectedDialogOpen = false)}>Cancelar</Button>
    </div>
  </div>
</Dialog>

<!-- Dialog para buscar expected invoices para Balance Group -->
<Dialog bind:open={balanceSearchDialogOpen} title="Agregar a grupo de balance">
  <div class="link-expected-content">
    <EmitterCombobox
      value={selectedEmitterForSearch
        ? {
            id: 0,
            cuit: selectedEmitterForSearch.cuit,
            name: selectedEmitterForSearch.name,
            displayName: selectedEmitterForSearch.name,
          }
        : null}
      onselect={(emitter) => {
        if (emitter) {
          selectedEmitterForSearch = { cuit: emitter.cuit, name: emitter.name };
          searchExpectedByEmitter({ cuit: emitter.cuit, name: emitter.name });
        } else {
          selectedEmitterForSearch = null;
          availableExpected = [];
        }
      }}
    />

    {#if selectedEmitterForSearch}
      <div class="balance-search-results">
        {#if loadingExpected}
          <p class="loading-text">Buscando facturas pendientes...</p>
        {:else if availableExpected.length === 0}
          <p class="empty-text">No hay facturas pendientes de este emisor.</p>
        {:else}
          <p class="result-count">{availableExpected.length} factura(s) pendiente(s)</p>
          <div class="balance-candidate-list">
            {#each availableExpected as exp (exp.id)}
              {@const isCurrentExpected = exp.id === comprobante.expected?.id}
              {@const isAlreadyInGroup = balanceGroup?.members.some((m) => m.id === exp.id)}
              <button
                type="button"
                class="balance-candidate"
                class:disabled={isCurrentExpected || isAlreadyInGroup}
                disabled={isCurrentExpected || isAlreadyInGroup}
                onclick={() => handleAddToBalance(exp.id)}
              >
                <span class="candidate-label">
                  {formatInvoiceLabel(exp.invoiceType, exp.pointOfSale, exp.invoiceNumber)}
                </span>
                <span class="candidate-date">{formatDateShort(exp.issueDate)}</span>
                <span class="candidate-total">{formatCurrency(exp.total)}</span>
                <span class="candidate-actions">
                  {#if isCurrentExpected}
                    <span class="candidate-badge">actual</span>
                  {:else if isAlreadyInGroup}
                    <span class="candidate-badge">en grupo</span>
                  {/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <p class="hint-text">Seleccioná un emisor para ver sus facturas pendientes.</p>
    {/if}

    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => (balanceSearchDialogOpen = false)}>Cerrar</Button>
    </div>
  </div>
</Dialog>

<style>
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--spacing-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /*
     * Altura = viewport - topbar (~56px) - content-inner padding (spacing-6 * 2)
     * El topbar es sticky y ocupa ~56px. El content-inner agrega spacing-6 de padding.
     * Usamos un cálculo conservador para evitar doble scroll.
     */
    height: calc(100vh - 56px - var(--spacing-6) * 3);
  }

  .layout {
    display: grid;
    /* Preview ocupa el espacio restante, content tiene mínimo 420px */
    grid-template-columns: 1fr minmax(420px, 480px);
    gap: var(--spacing-4);
    flex: 1;
    min-height: 0; /* Importante para que flex children puedan hacer scroll */
    overflow: hidden;
  }

  /* Cuando hay factura, dar un poco más de espacio al content */
  .layout.has-invoice {
    grid-template-columns: 1fr minmax(440px, 520px);
  }

  /* Preview panel */
  .preview-panel {
    height: 100%;
    min-height: 0; /* Permite que se encoja si es necesario */
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .no-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-tertiary);
  }

  .no-preview p:first-child {
    font-size: 4rem;
    margin: 0;
  }

  /* Content - columna derecha con scroll propio */
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    overflow-y: auto;
    min-height: 0; /* Permite scroll interno */
    padding-right: var(--spacing-2); /* Espacio para scrollbar */
  }

  .section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    background: var(--color-surface);
  }

  /* Comparison section - sin borde propio, el SourceComparison ya tiene */
  .comparison-section {
    border: none;
    padding: 0;
    background: transparent;
  }

  /* Meta row for factura header */
  .meta-row {
    display: flex;
    gap: var(--spacing-3);
    align-items: center;
    margin-bottom: var(--spacing-3);
    color: var(--color-text-secondary);
    flex-wrap: wrap;
  }
  .meta-row.small {
    font-size: var(--font-size-sm);
  }

  /* Alert box for expected without file */
  .alert {
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-3);
  }

  .alert-info {
    background: var(--color-primary-50);
    border: 1px solid var(--color-primary-200);
    color: var(--color-primary-900);
  }

  .alert strong {
    display: block;
    margin-bottom: var(--spacing-2);
    font-size: var(--font-size-md);
  }

  .alert p {
    margin: 0 0 var(--spacing-2);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .alert .workflow-hint {
    padding: var(--spacing-2);
    background: white;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--color-primary-600);
  }

  /* Balance section - sin borde propio, integrado con el panel padre */
  .balance-section {
    margin-top: var(--spacing-4);
    border: none;
    padding: 0;
    background: transparent;
  }

  /* Expected indicator */
  .expected-indicator {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-primary-50);
    border: 1px solid var(--color-primary-200);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-3);
  }

  .expected-indicator.below-total {
    margin-top: var(--spacing-2);
  }

  .expected-indicator .indicator-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary-700);
  }

  .expected-indicator.missing {
    background: var(--color-warning-50);
    border-color: var(--color-warning-200);
  }

  .expected-indicator.missing .indicator-label {
    color: var(--color-warning-700);
  }

  .link-button {
    background: transparent;
    border: none;
    color: var(--color-primary-700);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-decoration: underline;
    padding: 0.25rem 0.5rem;
  }

  .link-button:hover {
    color: var(--color-primary-900);
  }

  /* Dialog de eliminación */
  .delete-dialog-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .delete-info {
    padding: var(--spacing-4);
    background: var(--color-warning-50);
    border-left: 3px solid var(--color-warning);
    border-radius: var(--radius-base);
  }

  .delete-info p {
    margin: 0 0 var(--spacing-2) 0;
    color: var(--color-text-primary);
  }

  .delete-info ul {
    margin: 0;
    padding-left: var(--spacing-4);
    list-style: none;
  }

  .delete-info li {
    margin: var(--spacing-1) 0;
    color: var(--color-text-secondary);
  }

  .delete-info .info-note {
    margin-top: var(--spacing-3);
    padding: var(--spacing-2);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    font-size: 0.9em;
    color: var(--color-text-secondary);
  }

  .dialog-actions {
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
    margin-top: var(--spacing-2);
  }

  code.hash {
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: 0.85em;
    background: var(--color-surface);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  /* Dialog vincular expected */
  .link-expected-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    min-width: 400px;
  }

  .loading-text,
  .empty-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--spacing-4);
  }

  .help-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .expected-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    max-height: 300px;
    overflow-y: auto;
  }

  .expected-option {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .expected-option:hover {
    border-color: var(--color-primary-300);
    background: var(--color-primary-50);
  }

  .expected-main {
    display: flex;
    gap: var(--spacing-2);
    align-items: baseline;
  }

  .expected-type {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .expected-number {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .expected-details {
    display: flex;
    gap: var(--spacing-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .expected-total {
    font-family: var(--font-mono);
  }

  .expected-emitter {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .expected-option.already-added {
    background: var(--color-primary-50);
    border-color: var(--color-primary-200);
  }

  .added-badge {
    font-size: var(--font-size-xs);
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: var(--color-primary-100);
    color: var(--color-primary-700);
    margin-left: auto;
  }

  /* Balance search dialog - table-like results */
  .balance-search-results {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .result-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .hint-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--spacing-4);
  }

  .balance-candidate-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    max-height: 300px;
    overflow-y: auto;
  }

  .balance-candidate {
    display: grid;
    grid-template-columns: 1fr auto auto 4.5rem;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
    text-align: left;
  }

  .balance-candidate:hover:not(:disabled) {
    background: var(--color-primary-50);
    border-color: var(--color-primary-300);
  }

  .balance-candidate.disabled,
  .balance-candidate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .candidate-label {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text);
    white-space: nowrap;
  }

  .candidate-date {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .candidate-total {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-align: right;
    white-space: nowrap;
  }

  .candidate-actions {
    display: flex;
    justify-content: flex-end;
    min-width: 4.5rem;
  }

  .candidate-badge {
    font-size: var(--font-size-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--color-primary-100);
    color: var(--color-primary-700);
    white-space: nowrap;
  }
</style>
