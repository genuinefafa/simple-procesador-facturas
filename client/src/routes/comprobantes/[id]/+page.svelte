<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import CategoryPills from '$lib/components/CategoryPills.svelte';
  import EmitterCombobox from '$lib/components/EmitterCombobox.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import InvoiceTypeSelect from '$lib/components/InvoiceTypeSelect.svelte';
  import DuplicateHashAlert from '$lib/components/DuplicateHashAlert.svelte';
  import { Accordion } from 'melt/builders';
  import type { PageData } from './$types';
  import { toast, Toaster } from 'svelte-sonner';
  import { invalidateAll, goto } from '$app/navigation';
  import {
    formatDateTime,
    formatDateISO,
    formatDateShort,
    getFriendlyType,
    getInvoiceTypeFromARCA,
  } from '$lib/formatters';

  let { data } = $props();
  let comprobante = $derived(data.comprobante);
  let categories = $derived(data.categories || []);

  type Emitter = {
    id?: number;
    name: string;
    displayName: string;
    cuit: string;
    cuitNumeric?: string;
    legalName?: string;
    aliases?: string[];
  };

  let selectedEmitter = $state<Emitter | null>(null);
  let registeredEmitterForExpected = $state<Emitter | null>(null);
  let registeredEmitterForPending = $state<Emitter | null>(null);
  let confirmReprocess = $state(false);
  let processing = $state(false);
  let selectedExpectedId = $state<number | null>(null);
  let lastCopiedEmitterName = $state<string | null>(null);
  let editMode = $state(false);
  let selectedCategoryId = $state<number | null>(null);
  let deleteDialogOpen = $state(false);

  let categorySelectValue = $derived.by(() => {
    const val = selectedCategoryId === null ? '' : String(selectedCategoryId);
    console.log(
      '[DERIVED] categorySelectValue:',
      val,
      'from selectedCategoryId:',
      selectedCategoryId
    );
    return val;
  });

  let facuraData = $state({
    cuit: '',
    invoiceType: null as number | null, // Código ARCA numérico
    pointOfSale: null as number | null,
    invoiceNumber: null as number | null,
    issueDate: '',
    total: null as number | null,
  });

  const formatDateInput = (value: string) => (value ? value.slice(0, 10) : '');
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  };
  const formatHash = (hash: string | null | undefined) => {
    if (!hash) return '—';
    return `${hash.substring(0, 16)}...`;
  };

  // Determinar si es una expected sin archivo (no permite crear factura directamente)
  const isExpectedWithoutFile = $derived(
    comprobante.kind === 'expected' && !comprobante.pending && !comprobante.final
  );

  // Sincronizar facturaData con comprobante cuando cambie
  $effect(() => {
    facuraData.cuit = comprobante.final?.cuit || comprobante.expected?.cuit || facuraData.cuit;
    facuraData.invoiceType =
      comprobante.final?.invoiceType || comprobante.expected?.invoiceType || facuraData.invoiceType;
    facuraData.pointOfSale =
      comprobante.final?.pointOfSale ?? comprobante.expected?.pointOfSale ?? facuraData.pointOfSale;
    facuraData.invoiceNumber =
      comprobante.final?.invoiceNumber ??
      comprobante.expected?.invoiceNumber ??
      facuraData.invoiceNumber;
    facuraData.issueDate =
      comprobante.final?.issueDate || comprobante.expected?.issueDate || facuraData.issueDate;
    facuraData.total = comprobante.final?.total ?? comprobante.expected?.total ?? facuraData.total;

    if (comprobante.expected) {
      selectedExpectedId = comprobante.expected.id;
      lastCopiedEmitterName = comprobante.expected.emitterName || lastCopiedEmitterName;
    }

    // Preseleccionar categoría desde la factura final si existe (solo en modo lectura)
    // NO resetear si la factura aún no existe (pending file sin finalizar)
    console.log('[EFFECT] comprobante.final?.categoryId:', comprobante.final?.categoryId);
    if (!editMode && comprobante.final) {
      selectedCategoryId = comprobante.final.categoryId ?? null;
      console.log('[EFFECT] selectedCategoryId set to:', selectedCategoryId);
    } else if (!comprobante.final) {
      console.log(
        '[EFFECT] comprobante.final no existe aún, preservando selectedCategoryId:',
        selectedCategoryId
      );
    } else {
      console.log('[EFFECT] editMode=true, no se pisa selectedCategoryId');
    }

    // Preseleccionar emisor SOLO en modo lectura
    if (!editMode && !selectedEmitter && comprobante.final?.cuit) {
      const emitterName = comprobante.emitterName || comprobante.final.cuit;
      selectedEmitter = {
        name: emitterName,
        displayName: emitterName,
        cuit: comprobante.final.cuit,
        cuitNumeric: comprobante.final.cuit.replace(/\D/g, ''),
      };
    }
  });

  // Cargar emisor registrado para expected invoice (independiente)
  $effect(() => {
    if (comprobante.expected?.cuit) {
      fetch(`/api/emisores?cuit=${encodeURIComponent(comprobante.expected.cuit)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.emitters && data.emitters.length > 0) {
            const emitter = data.emitters[0];
            registeredEmitterForExpected = {
              name: emitter.name,
              displayName: emitter.displayName,
              cuit: emitter.cuit,
              cuitNumeric: emitter.cuitNumeric,
              legalName: emitter.legalName,
              aliases: emitter.aliases || [],
            };
          } else {
            registeredEmitterForExpected = null;
          }
        })
        .catch(() => {
          registeredEmitterForExpected = null;
        });
    } else {
      registeredEmitterForExpected = null;
    }
  });

  // Cargar emisor registrado para pending file (independiente)
  $effect(() => {
    if (comprobante.pending?.extractedCuit) {
      fetch(`/api/emisores?cuit=${encodeURIComponent(comprobante.pending.extractedCuit)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.emitters && data.emitters.length > 0) {
            const emitter = data.emitters[0];
            registeredEmitterForPending = {
              name: emitter.name,
              displayName: emitter.displayName,
              cuit: emitter.cuit,
              cuitNumeric: emitter.cuitNumeric,
              legalName: emitter.legalName,
              aliases: emitter.aliases || [],
            };
          } else {
            registeredEmitterForPending = null;
          }
        })
        .catch(() => {
          registeredEmitterForPending = null;
        });
    } else {
      registeredEmitterForPending = null;
    }
  });

  // Accordion para expected/pending
  let accordionValue = $derived(comprobante.pending ? 'pending' : undefined);
  const accordion = new Accordion({
    get value() {
      return accordionValue;
    },
  });

  function onEmitterSelect(emitter: Emitter | null) {
    selectedEmitter = emitter;
    if (emitter) facuraData.cuit = emitter.cuit;
  }

  function copyFromSection(source: 'final' | 'expected' | 'pending') {
    const sourceData =
      source === 'final'
        ? comprobante.final
        : source === 'expected'
          ? comprobante.expected
          : comprobante.pending;
    if (!sourceData) return;

    if (source === 'final') {
      const f = sourceData as any;
      facuraData.cuit = f.cuit || facuraData.cuit;
      facuraData.invoiceType = f.invoiceType || facuraData.invoiceType;
      facuraData.pointOfSale = f.pointOfSale || facuraData.pointOfSale;
      facuraData.invoiceNumber = f.invoiceNumber || facuraData.invoiceNumber;
      facuraData.issueDate = f.issueDate || facuraData.issueDate;
      facuraData.total = f.total || facuraData.total;
    } else if (source === 'expected') {
      const e = sourceData as any;
      facuraData.cuit = e.cuit || facuraData.cuit;
      facuraData.invoiceType = e.invoiceType || facuraData.invoiceType;
      facuraData.pointOfSale = e.pointOfSale || facuraData.pointOfSale;
      facuraData.invoiceNumber = e.invoiceNumber || facuraData.invoiceNumber;
      facuraData.issueDate = e.issueDate || facuraData.issueDate;
      facuraData.total = e.total || facuraData.total;
    } else {
      const p = sourceData as any;
      facuraData.cuit = p.extractedCuit || facuraData.cuit;
      facuraData.issueDate = p.extractedDate || facuraData.issueDate;
      facuraData.total = p.extractedTotal || facuraData.total;
    }
    toast.success('Datos copiados al formulario');
  }

  async function copyFromMatch(match: any) {
    facuraData.cuit = match.cuit;
    facuraData.invoiceType = match.invoiceType;
    facuraData.pointOfSale = match.pointOfSale;
    facuraData.invoiceNumber = match.invoiceNumber;
    facuraData.issueDate = match.issueDate;
    facuraData.total = match.total || facuraData.total;
    selectedExpectedId = match.id || null;
    lastCopiedEmitterName = match.emitterName || null;

    // Si el match tiene emisor, verificar si existe o crearlo
    if (match.emitterName && match.cuit) {
      try {
        // Buscar si el emisor ya existe
        const searchRes = await fetch(`/api/emisores?q=${encodeURIComponent(match.cuit)}`);
        const searchData = await searchRes.json();

        if (searchData.emitters && searchData.emitters.length > 0) {
          // Emisor existe, seleccionarlo
          selectedEmitter = searchData.emitters[0];
          toast.success('Datos copiados y emisor seleccionado');
        } else {
          // Emisor no existe, crearlo
          const createRes = await fetch('/api/emisores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cuit: match.cuit,
              nombre: match.emitterName,
            }),
          });

          if (createRes.ok) {
            const createData = await createRes.json();
            selectedEmitter = createData.emitter;
            toast.success(`Emisor "${match.emitterName}" creado y seleccionado`);
          } else {
            toast.warning('Datos copiados pero no se pudo crear el emisor');
          }
        }
      } catch (err) {
        console.error('Error al verificar/crear emisor:', err);
        toast.warning('Datos copiados pero hubo un error con el emisor');
      }
    } else {
      toast.success('Datos copiados al formulario');
    }
  }

  /**
   * Actualiza la categoría de la factura
   * Si la factura ya existe (final), persiste en servidor
   * Si está en creación, solo actualiza estado local
   */
  async function updateCategory(categoryId: number | null | undefined) {
    const normalizedId = categoryId === undefined ? null : categoryId;
    selectedCategoryId = normalizedId;

    // Si la factura no existe aún (pending/expected en creación), solo actualizar estado local
    if (!comprobante.final) {
      return;
    }

    // Si existe factura, persistir en servidor
    try {
      const res = await fetch(`/api/invoices/${comprobante.final.id}/category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: normalizedId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error actualizando categoría');
      }

      toast.success('Categoría actualizada');
      await invalidateAll();
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error(error instanceof Error ? error.message : 'Error actualizando categoría');
      // Revertir cambio local si falló el guardado
      selectedCategoryId = comprobante.final.categoryId ?? null;
    }
  }

  function validateFactura(): string[] {
    const errors: string[] = [];
    if (!facuraData.cuit?.trim()) errors.push('CUIT es requerido');
    if (facuraData.invoiceType === null) errors.push('Tipo de comprobante es requerido');
    if (!facuraData.pointOfSale) errors.push('Punto de venta es requerido');
    if (!facuraData.invoiceNumber) errors.push('Número de factura es requerido');
    if (!facuraData.issueDate) errors.push('Fecha es requerida');
    return errors;
  }

  async function saveFactura() {
    // Bloquear creación desde expected sin archivo
    if (isExpectedWithoutFile) {
      toast.error(
        'No se puede crear factura directamente desde una expected sin archivo.\nPrimero debés subir el comprobante digital.'
      );
      return;
    }

    const errors = validateFactura();
    if (errors.length > 0) {
      toast.error('Errores de validación:\n' + errors.join('\n'));
      return;
    }

    const toastId = toast.loading('Guardando factura...');

    try {
      let response;
      let newInvoiceId;

      // Determinar qué hacer según el tipo de comprobante
      if (comprobante.kind === 'factura' && comprobante.final) {
        // Actualizar factura existente
        response = await fetch(`/api/invoices/${comprobante.final.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emitterCuit: facuraData.cuit,
            invoiceType: facuraData.invoiceType,
            pointOfSale: facuraData.pointOfSale,
            invoiceNumber: facuraData.invoiceNumber,
            issueDate: facuraData.issueDate,
            total: facuraData.total,
            expectedInvoiceId: selectedExpectedId,
          }),
        });
      } else if (comprobante.kind === 'pending' && comprobante.pending) {
        // Crear factura desde pending
        // Buscar categoryKey desde selectedCategoryId
        const categoryKey =
          selectedCategoryId !== null
            ? categories.find((c) => c.id === selectedCategoryId)?.key
            : undefined;

        response = await fetch(`/api/pending-files/${comprobante.pending.id}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emitterCuit: facuraData.cuit,
            invoiceType: facuraData.invoiceType,
            pointOfSale: facuraData.pointOfSale,
            invoiceNumber: facuraData.invoiceNumber,
            issueDate: facuraData.issueDate,
            total: facuraData.total,
            expectedInvoiceId: selectedExpectedId,
            emitterName: selectedEmitter?.name || lastCopiedEmitterName || undefined,
            categoryKey,
          }),
        });

        const data = await response.json();
        if (data.success && data.invoiceId) {
          newInvoiceId = data.invoiceId;
        }
      }

      if (response && response.ok) {
        toast.success('✅ Factura guardada correctamente', { id: toastId });

        // Navegación / recarga
        // Salir de modo edición para evitar confusiones
        editMode = false;
        if (newInvoiceId) {
          await goto(`/comprobantes/factura:${newInvoiceId}`);
        } else {
          await invalidateAll();
        }
      } else {
        const data = await response?.json();
        toast.error(data?.error || 'Error al guardar factura', { id: toastId });
      }
    } catch (err) {
      console.error('Error al guardar factura:', err);
      toast.error('Error al guardar factura', { id: toastId });
    }
  }

  function openDeleteDialog() {
    if (!comprobante.final && !comprobante.pending) {
      toast.error('No hay nada que eliminar');
      return;
    }
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    deleteDialogOpen = false;

    // Eliminar factura final
    if (comprobante.final) {
      const toastId = toast.loading('Eliminando factura...');

      try {
        const response = await fetch(`/api/invoices/${comprobante.final.id}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (response.ok && data.success) {
          toast.success(data.message, { id: toastId });
          await goto('/comprobantes');
        } else {
          toast.error(data.error || 'Error al eliminar factura', { id: toastId });
        }
      } catch (err) {
        console.error('Error al eliminar factura:', err);
        toast.error('Error al eliminar factura', { id: toastId });
      }
      return;
    }

    // Eliminar pending file
    if (comprobante.pending) {
      const toastId = toast.loading('Eliminando archivo pendiente...');

      try {
        const response = await fetch(`/api/pending-files/${comprobante.pending.id}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (response.ok && data.success) {
          toast.success(data.message || 'Archivo pendiente eliminado', { id: toastId });
          await goto('/comprobantes');
        } else {
          toast.error(data.error || 'Error al eliminar archivo pendiente', { id: toastId });
        }
      } catch (err) {
        console.error('Error al eliminar archivo pendiente:', err);
        toast.error('Error al eliminar archivo pendiente', { id: toastId });
      }
    }
  }

  // Determinar si se procesó alguna vez (tiene datos de extracción)
  const hasExtraction = $derived(
    comprobante.pending?.status === 'reviewing' || comprobante.pending?.status === 'processed'
  );
  const wasProcessed = $derived(comprobante.final != null);
  const isReadOnly = $derived(
    (comprobante.kind === 'factura' && !editMode) || isExpectedWithoutFile
  );

  async function processPending() {
    if (!comprobante.pending) return;

    if (hasExtraction && !confirmReprocess) {
      toast.error('Confirmá el reprocesamiento marcando el checkbox');
      return;
    }

    processing = true;
    const toastId = toast.loading(hasExtraction ? 'Reprocesando...' : 'Procesando...');

    try {
      const endpoint = hasExtraction
        ? `/api/pending-files/${comprobante.pending.id}/reprocess`
        : `/api/pending-files/${comprobante.pending.id}/process`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `✅ ${hasExtraction ? 'Reprocesado' : 'Procesado'}: ${data.extraction?.confidence || 0}% confianza`,
          { id: toastId }
        );
        // Revalidar los datos de la página sin recargar completamente
        await invalidateAll();
      } else {
        toast.error(data.error || 'Error al procesar', { id: toastId });
      }
    } catch (err) {
      toast.error('Error al procesar archivo', { id: toastId });
      console.error('Error:', err);
    } finally {
      processing = false;
      confirmReprocess = false;
    }
  }

  async function createInvoiceFromPending() {
    if (!comprobante.pending) return;

    const pending = comprobante.pending;
    if (
      !pending.extractedCuit ||
      !pending.extractedDate ||
      !pending.extractedType ||
      pending.extractedPointOfSale === null ||
      pending.extractedInvoiceNumber === null
    ) {
      toast.error(
        'Faltan datos obligatorios. Completá todos los campos antes de crear la factura.'
      );
      return;
    }

    const confirmed = confirm(
      `¿Crear factura ${pending.extractedType}-${String(pending.extractedPointOfSale).padStart(4, '0')}-${String(pending.extractedInvoiceNumber).padStart(8, '0')}?`
    );
    if (!confirmed) return;

    processing = true;
    const toastId = toast.loading('Creando factura...');

    try {
      const response = await fetch(`/api/pending-files/${pending.id}/finalize`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('✅ Factura creada correctamente', { id: toastId });
        // Navegar a la factura creada
        if (data.invoice?.id) {
          goto(`/comprobantes/factura:${data.invoice.id}`);
        } else {
          await invalidateAll();
        }
      } else {
        toast.error(data.error || 'Error al crear factura', { id: toastId });
      }
    } catch (err) {
      toast.error('Error al crear factura', { id: toastId });
      console.error('Error:', err);
    } finally {
      processing = false;
    }
  }

  // Obtener ruta del archivo para preview
  const fileUrl = $derived.by(() => {
    // Para pending files, usar el endpoint de API que maneja HEIC
    if (comprobante.pending?.id) {
      const url = `/api/pending-files/${comprobante.pending.id}/file`;
      console.log('[FilePreview] URL para pending:', url, comprobante.pending);
      return url;
    }
    if (comprobante.final?.filePath) {
      const url = `/api/files/${comprobante.final.filePath}`;
      console.log('[FilePreview] URL para final:', url);
      return url;
    }
    if (comprobante.expected?.filePath) {
      const url = `/api/files/${comprobante.expected.filePath}`;
      console.log('[FilePreview] URL para expected:', url);
      return url;
    }
    console.log('[FilePreview] No hay fileUrl disponible', comprobante);
    return null;
  });

  const previewFilename = $derived.by(() => {
    if (comprobante.pending?.originalFilename) {
      return comprobante.pending.originalFilename;
    }
    if (comprobante.final?.filePath) {
      return comprobante.final.filePath.split('/').pop() || 'documento';
    }
    if (comprobante.expected?.filePath) {
      return comprobante.expected.filePath.split('/').pop() || 'documento';
    }
    return 'documento';
  });
</script>

<svelte:head>
  <title>Detalle Comprobante</title>
</svelte:head>

<div class="container">
  <header class="header">
    <div class="header-left">
      <a href="/comprobantes">← Volver</a>
      <h1>Detalle Comprobante</h1>
    </div>
    <div class="header-actions">
      <Button variant="danger" size="sm" onclick={openDeleteDialog}>🗑️ Eliminar</Button>
    </div>
  </header>

  <!-- Alerta de duplicados por hash (global, arriba) -->
  {#if comprobante.final?.fileHash || comprobante.pending?.fileHash}
    {@const fileHash = comprobante.final?.fileHash || comprobante.pending?.fileHash}
    {@const currentType = comprobante.final ? 'invoice' : 'pending'}
    {@const currentId = comprobante.final?.id || comprobante.pending?.id || 0}
    {@const linkedPendingId = comprobante.final?.pendingFileId || null}
    {@const linkedInvoiceId = comprobante.pending?.linkedInvoiceId || null}
    <DuplicateHashAlert {fileHash} {currentId} {currentType} {linkedPendingId} {linkedInvoiceId} />
  {/if}

  <div class="layout">
    <!-- Columna izquierda: Preview -->
    <aside class="preview-panel">
      {#if fileUrl}
        <FilePreview
          src={fileUrl}
          filename={previewFilename}
          showZoom={true}
          maxHeight="calc(100vh - 200px)"
        />
      {:else}
        <div class="no-preview">
          <p>📄</p>
          <p>Sin archivo asociado</p>
        </div>
      {/if}
    </aside>

    <!-- Columna derecha: Formulario + Accordions -->
    <div {...accordion.root} class="content">
      <!-- Formulario Factura (ARRIBA, siempre visible) -->
      <section class="section factura-section">
        <h2>Factura Final (Verificada)</h2>

        {#if isExpectedWithoutFile}
          <div class="alert alert-info">
            <strong>📋 Factura esperada sin archivo</strong>
            <p>
              Esta factura está registrada en el sistema pero aún no tiene un comprobante digital
              asociado.
            </p>
            <p class="workflow-hint">
              <strong>Workflow:</strong> Para crear la factura, primero debés subir el comprobante digital.
              Luego el sistema lo vinculará automáticamente con esta expected y podrás finalizarla.
            </p>
            <Button size="sm" variant="secondary" onclick={() => goto('/comprobantes')}>
              ← Ir a Comprobantes
            </Button>
          </div>
        {/if}

        {#if comprobante.final}
          <div class="meta-row small">
            <span class="meta">Creada: {formatDateTime(comprobante.final.processedAt)}</span>
          </div>
          {#if comprobante.final.fileHash}
            <div class="meta-row small">
              <span class="meta"
                >Hash SHA-256: <code class="hash">{formatHash(comprobante.final.fileHash)}</code
                ></span
              >
            </div>
          {/if}
        {/if}

        <EmitterCombobox value={selectedEmitter} onselect={onEmitterSelect} disabled={isReadOnly} />

        <!-- Categoría -->
        <div class="form-group">
          <label for="categoria">Categoría</label>
          {#if isReadOnly && isExpectedWithoutFile}
            <!-- Readonly solo para expected sin archivo (no se puede asignar aún) -->
            <div class="readonly-value">— Sin categoría —</div>
          {:else}
            <!-- Siempre mostrar pills para facturas, pending y expected con archivo -->
            <CategoryPills
              {categories}
              selected={selectedCategoryId}
              onselect={(id) => updateCategory(id)}
              mode="single"
            />
          {/if}
        </div>

        <!-- Indicador de expected vinculado -->
        <div class="form-group">
          <label for="cuit">CUIT *</label>
          <input
            id="cuit"
            type="text"
            bind:value={facuraData.cuit}
            required
            readonly={isReadOnly}
            class:view-only={isReadOnly}
          />
        </div>
        <div class="form-group">
          <InvoiceTypeSelect bind:value={facuraData.invoiceType} readonly={isReadOnly} />
        </div>
        <div class="form-group">
          <label for="pv">Punto de Venta *</label>
          <input
            id="pv"
            type="number"
            bind:value={facuraData.pointOfSale}
            required
            readonly={isReadOnly}
            class:view-only={isReadOnly}
          />
        </div>
        <div class="form-group">
          <label for="num">Número *</label>
          <input
            id="num"
            type="number"
            bind:value={facuraData.invoiceNumber}
            required
            readonly={isReadOnly}
            class:view-only={isReadOnly}
          />
        </div>
        <div class="form-group">
          <label for="fecha">Fecha *</label>
          {#if isReadOnly}
            <input
              id="fecha"
              type="text"
              value={formatDateISO(formatDateInput(facuraData.issueDate))}
              readonly
              class:view-only={true}
            />
          {:else}
            <input
              id="fecha"
              type="date"
              value={formatDateInput(facuraData.issueDate)}
              oninput={(e) => (facuraData.issueDate = (e.target as HTMLInputElement).value)}
              required
            />
          {/if}
        </div>
        <div class="form-group">
          <label for="total">Total</label>
          {#if isReadOnly}
            <div class="readonly-value align-right">{formatCurrency(facuraData.total)}</div>
          {:else}
            <input
              id="total"
              type="number"
              step="0.01"
              bind:value={facuraData.total}
              readonly={false}
            />
          {/if}
        </div>

        {#if selectedExpectedId}
          <div class="expected-indicator below-total">
            <span class="indicator-label">📋 Vinculado a expected #{selectedExpectedId}</span>
            <button
              type="button"
              class="link-button"
              disabled={!editMode}
              onclick={() => {
                if (!editMode) return;
                selectedExpectedId = null;
                lastCopiedEmitterName = null;
                toast.info('Vinculación con expected removida. Podés seleccionar otro.');
              }}
            >
              ✕ Desvincular
            </button>
          </div>
        {/if}
        {#if !isExpectedWithoutFile}
          <div class="actions">
            {#if comprobante.kind === 'factura'}
              <Button variant="secondary" onclick={() => (editMode = !editMode)}>
                {editMode ? 'Cancelar edición' : 'Editar'}
              </Button>
              <Button variant="danger" onclick={openDeleteDialog}>🗑️ Eliminar Factura</Button>
            {/if}
            <Button onclick={saveFactura} disabled={isReadOnly}>Guardar Factura</Button>
          </div>
        {/if}
      </section>

      <!-- Accordion: Expected -->
      {#if comprobante.expected}
        {@const item = accordion.getItem({ id: 'expected' })}
        <div class="accordion">
          <h3 {...item.heading}>
            <button type="button" {...item.trigger} class="accordion-trigger">
              <span>📋 Del Fisco (Expected)</span>
              <span class="accordion-icon">▼</span>
            </button>
          </h3>
          <div {...item.content} class="accordion-content">
            <div class="accordion-header">
              <Button size="sm" variant="secondary" onclick={() => copyFromSection('expected')}>
                Copiar a Factura
              </Button>
            </div>
            <div class="data-list">
              <div class="data-item">
                <span class="label">CUIT:</span>
                <span class="value">{comprobante.expected.cuit}</span>
              </div>
              {#if comprobante.expected.emitterName}
                <div class="data-item">
                  <span class="label">Nombre (ARCA):</span>
                  <span class="value">{comprobante.expected.emitterName}</span>
                </div>
              {/if}
              {#if registeredEmitterForExpected}
                <div class="data-item">
                  <span class="label">Emisor Nuestro:</span>
                  <span class="value">{registeredEmitterForExpected.displayName}</span>
                </div>
              {/if}
              <div class="data-item">
                <span class="label">Tipo:</span>
                <span class="value">
                  {#if comprobante.expected.invoiceType}
                    {getInvoiceTypeFromARCA(comprobante.expected.invoiceType).icon}
                    {getInvoiceTypeFromARCA(comprobante.expected.invoiceType).description}
                    ({comprobante.expected.invoiceType})
                  {:else}
                    —
                  {/if}
                </span>
              </div>
              <div class="data-item">
                <span class="label">Punto de Venta:</span>
                <span class="value">{comprobante.expected.pointOfSale}</span>
              </div>
              <div class="data-item">
                <span class="label">Número:</span>
                <span class="value">{comprobante.expected.invoiceNumber}</span>
              </div>
              <div class="data-item">
                <span class="label">Fecha:</span>
                <span class="value">{comprobante.expected.issueDate}</span>
              </div>
              <div class="data-item">
                <span class="label">Total:</span>
                <span class="value">{comprobante.expected.total}</span>
              </div>
              <div class="data-item">
                <span class="label">Estado:</span>
                <span class="value">{comprobante.expected.status}</span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Accordion: Pending -->
      {#if comprobante.pending}
        {@const item = accordion.getItem({ id: 'pending' })}
        <div class="accordion">
          <h3 {...item.heading}>
            <button type="button" {...item.trigger} class="accordion-trigger">
              <span>📦 Documento Subido (OCR Extraído)</span>
              <span class="accordion-icon">▼</span>
            </button>
          </h3>
          <div {...item.content} class="accordion-content">
            <div class="accordion-header">
              <Button size="sm" variant="secondary" onclick={() => copyFromSection('pending')}>
                Copiar a Factura
              </Button>
              {#if hasExtraction}
                <label class="reprocess-confirm">
                  <input type="checkbox" bind:checked={confirmReprocess} />
                  <span>Confirmar reprocesamiento</span>
                </label>
              {/if}
              <Button
                size="sm"
                variant={hasExtraction ? 'ghost' : 'secondary'}
                onclick={processPending}
                disabled={processing}
              >
                {#if processing}
                  ⏳ Procesando...
                {:else if hasExtraction}
                  🔄 Reprocesar
                {:else}
                  ▶️ Procesar
                {/if}
              </Button>
            </div>
            <div class="data-list">
              <div class="data-item">
                <span class="label">Archivo:</span>
                <span class="value">{comprobante.pending.originalFilename}</span>
              </div>
              <div class="data-item">
                <span class="label">Estado:</span>
                <span class="value">{comprobante.pending.status}</span>
              </div>
              {#if comprobante.pending.fileHash}
                <div class="data-item">
                  <span class="label">Hash SHA-256:</span>
                  <span class="value"
                    ><code class="hash">{formatHash(comprobante.pending.fileHash)}</code></span
                  >
                </div>
              {/if}

              {#if comprobante.pending.extractionConfidence !== null && comprobante.pending.extractionConfidence !== undefined}
                <div class="data-item">
                  <span class="label">Confianza:</span>
                  <span
                    class="value confidence"
                    class:high={comprobante.pending.extractionConfidence >= 90}
                    class:medium={comprobante.pending.extractionConfidence >= 70 &&
                      comprobante.pending.extractionConfidence < 90}
                    class:low={comprobante.pending.extractionConfidence < 70}
                  >
                    {comprobante.pending.extractionConfidence}%
                  </span>
                </div>
              {/if}

              {#if comprobante.pending.extractionMethod}
                <div class="data-item">
                  <span class="label">Método:</span>
                  <span class="value">{comprobante.pending.extractionMethod}</span>
                </div>
              {/if}

              <div class="data-item">
                <span class="label">CUIT (detectado):</span>
                <span class="value">{comprobante.pending.extractedCuit || '—'}</span>
              </div>
              {#if registeredEmitterForPending}
                <div class="data-item">
                  <span class="label">Emisor Nuestro:</span>
                  <span class="value">{registeredEmitterForPending.displayName}</span>
                </div>
              {/if}
              <div class="data-item">
                <span class="label">Tipo:</span>
                <span class="value">
                  {#if comprobante.pending.extractedType}
                    {getInvoiceTypeFromARCA(comprobante.pending.extractedType).icon}
                    {getInvoiceTypeFromARCA(comprobante.pending.extractedType).description}
                    ({comprobante.pending.extractedType})
                  {:else}
                    —
                  {/if}
                </span>
              </div>
              <div class="data-item">
                <span class="label">P.V.:</span>
                <span class="value">{comprobante.pending.extractedPointOfSale ?? '—'}</span>
              </div>
              <div class="data-item">
                <span class="label">Número:</span>
                <span class="value">{comprobante.pending.extractedInvoiceNumber ?? '—'}</span>
              </div>
              <div class="data-item">
                <span class="label">Fecha (detectada):</span>
                <span class="value">{formatDateShort(comprobante.pending.extractedDate)}</span>
              </div>
              <div class="data-item">
                <span class="label">Total (detectado):</span>
                <span class="value"
                  >{comprobante.pending.extractedTotal?.toLocaleString('es-AR', {
                    style: 'currency',
                    currency: 'ARS',
                  }) || '—'}</span
                >
              </div>

              {#if comprobante.pending.extractionErrors}
                <div class="data-item full-width">
                  <span class="label">⚠️ Errores:</span>
                  <span class="value error">{comprobante.pending.extractionErrors}</span>
                </div>
              {/if}
            </div>

            <!-- Matches con Expected Invoices -->
            {#if comprobante.matches && comprobante.matches.length > 0}
              <div class="matches-section">
                <h4>
                  🎯 Posibles coincidencias con facturas esperadas ({comprobante.matches.length})
                </h4>
                <div class="matches-list">
                  {#each comprobante.matches as match}
                    <div class="match-card">
                      <div class="match-header">
                        <span class="match-title">
                          {getFriendlyType(match.invoiceType)}
                          {String(match.pointOfSale).padStart(4, '0')}-{String(
                            match.invoiceNumber
                          ).padStart(8, '0')}
                        </span>
                        <span
                          class="match-score"
                          class:high={match.matchScore >= 80}
                          class:medium={match.matchScore >= 50 && match.matchScore < 80}
                          class:low={match.matchScore < 50}
                        >
                          {match.matchScore}% match
                        </span>
                      </div>
                      <div class="match-details">
                        <span>CUIT: {match.cuit}</span>
                        {#if match.emitterName}
                          <span>Emisor: {match.emitterName}</span>
                        {/if}
                        <span>Fecha: {match.issueDate}</span>
                        {#if match.total}
                          <span
                            >Total: {match.total.toLocaleString('es-AR', {
                              style: 'currency',
                              currency: 'ARS',
                            })}</span
                          >
                        {/if}
                        {#if match.status}
                          <span class="status">Estado: {match.status}</span>
                        {/if}
                      </div>
                      <Button size="sm" variant="secondary" onclick={() => copyFromMatch(match)}>
                        📋 Usar estos datos
                      </Button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<Toaster position="top-right" richColors />

<!-- Dialog de confirmación de eliminación -->
<Dialog
  bind:open={deleteDialogOpen}
  title={comprobante.final
    ? '⚠️ Eliminar Factura'
    : comprobante.pending
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
    {:else if comprobante.pending}
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
      <Button variant="secondary" onclick={() => (deleteDialogOpen = false)}>Cancelar</Button>
      <Button variant="danger" onclick={confirmDelete}>Eliminar</Button>
    </div>
  </div>
</Dialog>

<style>
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--spacing-4);
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
  }
  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .header a {
    color: var(--color-primary-700);
    text-decoration: none;
  }
  .header h1 {
    margin: 0;
  }
  .header-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .layout {
    display: grid;
    grid-template-columns: 500px 1fr;
    gap: var(--spacing-4);
  }

  /* Preview panel */
  .preview-panel {
    position: sticky;
    top: var(--spacing-4);
    height: calc(100vh - var(--spacing-8));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .pdf-preview,
  .img-preview {
    width: 100%;
    height: 100%;
    object-fit: contain;
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

  /* Content */
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    background: var(--color-surface);
  }

  .section h2 {
    margin: 0 0 var(--spacing-3);
    font-size: var(--font-size-lg);
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
  .meta-row .meta.strong {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-semibold);
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

  /* Form */
  .form-group {
    margin-bottom: var(--spacing-2);
  }

  .form-group label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .form-group input.view-only {
    text-align: right;
  }

  .readonly-value {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-alt);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .align-right {
    text-align: right;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-3);
  }

  /* Accordion */
  .accordion {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .accordion-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-surface-alt);
    border: none;
    cursor: pointer;
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    transition: background var(--transition-fast);
  }

  .accordion-trigger:hover {
    background: var(--color-neutral-100);
  }

  .accordion-trigger[data-state='open'] .accordion-icon {
    transform: rotate(180deg);
  }

  .accordion-icon {
    transition: transform var(--transition-base);
    font-size: var(--font-size-sm);
  }

  .accordion-content {
    padding: var(--spacing-4);
  }

  .accordion-content[data-state='closed'] {
    display: none;
  }

  .accordion-header {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
    margin-bottom: var(--spacing-3);
    flex-wrap: wrap;
  }

  .reprocess-confirm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .reprocess-confirm input[type='checkbox'] {
    width: auto;
    cursor: pointer;
  }

  /* Data display */
  .data-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  .link-button {
    background: transparent;
    border: none;
    color: var(--color-primary-700);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-decoration: underline;
    padding: 0.25rem 0.5rem;
  }

  .link-button[disabled] {
    cursor: not-allowed;
    opacity: 0.6;
    text-decoration: none;
  }

  .link-button:hover {
    color: var(--color-primary-900);
  }

  .data-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
  }

  .data-item .label {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .data-item .value {
    color: var(--color-text-primary);
  }

  .data-item.full-width {
    flex-direction: column;
    gap: 0.5rem;
  }

  .data-item .value.confidence {
    font-weight: var(--font-weight-bold);
  }

  .data-item .value.confidence.high {
    color: var(--color-success);
  }

  .data-item .value.confidence.medium {
    color: var(--color-warning);
  }

  .data-item .value.confidence.low {
    color: var(--color-danger);
  }

  .data-item .value.error {
    color: var(--color-danger);
    font-size: var(--font-size-xs);
  }

  /* Matches Section */
  .matches-section {
    margin-top: var(--spacing-4);
    padding: var(--spacing-3);
    background: var(--color-surface-alt);
    border-radius: var(--radius-md);
  }

  .matches-section h4 {
    margin: 0 0 var(--spacing-3) 0;
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  .matches-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .match-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-2) var(--spacing-3);
  }

  .match-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .match-title {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .match-score {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-full);
  }

  .match-score.high {
    background: var(--color-success-50);
    color: var(--color-success);
  }

  .match-score.medium {
    background: var(--color-warning-50);
    color: var(--color-warning);
  }

  .match-score.low {
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
  }

  .match-details {
    display: flex;
    gap: var(--spacing-3);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
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
</style>
