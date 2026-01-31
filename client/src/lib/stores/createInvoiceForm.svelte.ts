/**
 * Store reactivo para el formulario de creación de facturas.
 * Maneja estado del formulario, validación, y submit vía /api/invoices/from-file.
 */

import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';

export interface InvoiceFormData {
  cuit: string;
  invoiceType: number | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  issueDate: string;
  total: number | null;
}

export function createInvoiceForm() {
  let editMode = $state(false);
  let selectedExpectedId = $state<number | null>(null);
  let selectedCategoryId = $state<number | null>(null);
  let resolvedEmitterName = $state<string | null>(null);

  let formData = $state<InvoiceFormData>({
    cuit: '',
    invoiceType: null,
    pointOfSale: null,
    invoiceNumber: null,
    issueDate: '',
    total: null,
  });

  function reset() {
    editMode = false;
    formData.cuit = '';
    formData.invoiceType = null;
    formData.pointOfSale = null;
    formData.invoiceNumber = null;
    formData.issueDate = '';
    formData.total = null;
    selectedCategoryId = null;
    selectedExpectedId = null;
    resolvedEmitterName = null;
  }

  function populateFromFile(file: {
    extractedCuit?: string | null;
    extractedType?: number | null;
    extractedPointOfSale?: number | null;
    extractedInvoiceNumber?: number | null;
    extractedDate?: string | null;
    extractedTotal?: number | null;
    categoryId?: number | null;
  }) {
    formData.cuit = file.extractedCuit || '';
    formData.invoiceType = file.extractedType ?? null;
    formData.pointOfSale = file.extractedPointOfSale ?? null;
    formData.invoiceNumber = file.extractedInvoiceNumber ?? null;
    formData.issueDate = file.extractedDate || '';
    formData.total = file.extractedTotal ?? null;
    selectedCategoryId = file.categoryId ?? null;
    editMode = true;
    toast.info('Datos copiados del archivo. Revisá y guardá.');
  }

  function populateFromExpected(
    expected: {
      id: number;
      cuit: string;
      invoiceType: number | null;
      pointOfSale: number;
      invoiceNumber: number;
      issueDate: string;
      total?: number | null;
      categoryId?: number | null;
    },
    emitterName: string | null
  ) {
    formData.cuit = expected.cuit;
    formData.invoiceType = expected.invoiceType ?? null;
    formData.pointOfSale = expected.pointOfSale ?? null;
    formData.invoiceNumber = expected.invoiceNumber ?? null;
    formData.issueDate = expected.issueDate || '';
    formData.total = expected.total ?? null;
    selectedCategoryId = expected.categoryId ?? null;
    selectedExpectedId = expected.id;
    resolvedEmitterName = emitterName;
    editMode = true;
    toast.info('Datos copiados del fisco. Revisá y guardá.');
  }

  function validate(data: {
    cuit?: string | null;
    invoiceType?: number | null;
    pointOfSale?: number | null;
    invoiceNumber?: number | null;
    issueDate?: string | null;
  }): boolean {
    if (!data.cuit?.trim()) {
      toast.error('CUIT es requerido');
      return false;
    }
    if (data.invoiceType === null || data.invoiceType === undefined) {
      toast.error('Tipo de comprobante es requerido');
      return false;
    }
    if (!data.pointOfSale) {
      toast.error('Punto de venta es requerido');
      return false;
    }
    if (!data.invoiceNumber) {
      toast.error('Número de factura es requerido');
      return false;
    }
    if (!data.issueDate) {
      toast.error('Fecha es requerida');
      return false;
    }
    return true;
  }

  async function submit(
    fileId: number | undefined,
    data: {
      cuit: string;
      invoiceType: number | null;
      pointOfSale: number | null;
      invoiceNumber: number | null;
      issueDate: string;
      total: number | null;
      categoryId?: number | null;
    }
  ) {
    if (!validate(data)) return;
    if (!fileId) {
      toast.error('No hay archivo asociado');
      return;
    }

    const toastId = toast.loading('Creando factura...');
    try {
      const response = await fetch(`/api/invoices/from-file/${fileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: selectedExpectedId ? 'expected' : 'manual',
          expectedId: selectedExpectedId,
          data: {
            cuit: data.cuit,
            invoiceType: data.invoiceType,
            pointOfSale: data.pointOfSale,
            invoiceNumber: data.invoiceNumber,
            issueDate: data.issueDate,
            total: data.total,
            categoryId: data.categoryId,
            currency: 'ARS',
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.invoice?.id) {
        toast.success('Factura creada', { id: toastId });
        await goto(`/comprobantes/factura:${result.invoice.id}`);
      } else {
        toast.error(result.error || 'Error al crear factura', { id: toastId });
      }
    } catch {
      toast.error('Error al crear factura', { id: toastId });
    }
  }

  function unlinkExpected() {
    selectedExpectedId = null;
    resolvedEmitterName = null;
    toast.info('Vinculación con expected removida.');
  }

  return {
    get editMode() {
      return editMode;
    },
    set editMode(v: boolean) {
      editMode = v;
    },
    get formData() {
      return formData;
    },
    get selectedExpectedId() {
      return selectedExpectedId;
    },
    set selectedExpectedId(v: number | null) {
      selectedExpectedId = v;
    },
    get selectedCategoryId() {
      return selectedCategoryId;
    },
    set selectedCategoryId(v: number | null) {
      selectedCategoryId = v;
    },
    get resolvedEmitterName() {
      return resolvedEmitterName;
    },
    reset,
    populateFromFile,
    populateFromExpected,
    validate,
    submit,
    unlinkExpected,
  };
}
