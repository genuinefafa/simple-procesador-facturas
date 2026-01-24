/**
 * Store reactivo para eliminación de facturas y archivos.
 * Maneja el dialog de confirmación, la llamada API, y redirect.
 */

import { toast } from 'svelte-sonner';
import { goto } from '$app/navigation';
import type { Comprobante } from '$lib/types/comprobante';

export function createDeleteHandler() {
  let dialogOpen = $state(false);

  function open(comprobante: Comprobante) {
    if (!comprobante.final && !comprobante.file) {
      toast.error('No hay nada que eliminar');
      return;
    }
    dialogOpen = true;
  }

  function close() {
    dialogOpen = false;
  }

  async function confirm(comprobante: Comprobante) {
    dialogOpen = false;

    if (comprobante.final) {
      const toastId = toast.loading('Eliminando factura...');
      try {
        const response = await fetch(`/api/invoices/${comprobante.final.id}`, {
          method: 'DELETE',
        });
        const data = await response.json();

        if (response.ok && data.success) {
          toast.success(data.message, { id: toastId });
          if (comprobante.file?.id) {
            await goto(`/comprobantes/file:${comprobante.file.id}`);
          } else if (comprobante.expected?.id) {
            await goto(`/comprobantes/expected:${comprobante.expected.id}`);
          } else {
            await goto('/comprobantes');
          }
        } else {
          toast.error(data.error || 'Error al eliminar factura', { id: toastId });
        }
      } catch (err) {
        console.error('Error al eliminar factura:', err);
        toast.error('Error al eliminar factura', { id: toastId });
      }
      return;
    }

    if (comprobante.file) {
      const toastId = toast.loading('Eliminando archivo...');
      try {
        const response = await fetch(`/api/files/${comprobante.file.id}`, {
          method: 'DELETE',
        });
        const data = await response.json();

        if (response.ok && data.success) {
          toast.success(data.message || 'Archivo eliminado', { id: toastId });
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

  return {
    get dialogOpen() {
      return dialogOpen;
    },
    set dialogOpen(v: boolean) {
      dialogOpen = v;
    },
    open,
    close,
    confirm,
  };
}
