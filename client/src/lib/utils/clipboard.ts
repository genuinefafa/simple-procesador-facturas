/**
 * Clipboard helpers con fallback a document.execCommand para contextos no seguros
 * (HTTP sobre LAN, donde navigator.clipboard no está disponible).
 *
 * navigator.clipboard requiere "secure context" (HTTPS o localhost). Cuando la app
 * corre sobre HTTP en una IP de LAN (deploys homelab), la API falla. execCommand
 * está deprecada pero sigue funcionando en todos los browsers actuales.
 */

function isClipboardApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard && window.isSecureContext;
}

function fallbackCopyText(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.setAttribute('readonly', '');
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }

  document.body.removeChild(textarea);

  if (savedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  return success;
}

function fallbackCopyHtml(html: string): boolean {
  const container = document.createElement('div');
  container.contentEditable = 'true';
  container.innerHTML = html;
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.opacity = '0';
  document.body.appendChild(container);

  const selection = document.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }

  document.body.removeChild(container);

  if (savedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  return success;
}

/**
 * Copia texto plano al portapapeles. Intenta navigator.clipboard primero,
 * cae a document.execCommand si el contexto no es seguro (HTTP).
 */
export async function copyText(text: string): Promise<void> {
  if (isClipboardApiAvailable()) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ok = fallbackCopyText(text);
  if (!ok) throw new Error('Fallback copy failed');
}

/**
 * Copia rich content (HTML + texto plano alternativo) al portapapeles.
 * Sobre contexto seguro usa ClipboardItem (Gmail/apps que aceptan HTML lo
 * reciben con formato). Sobre contexto inseguro cae a execCommand con HTML
 * en un contenedor contentEditable.
 */
export async function copyRich(payload: { html: string; text: string }): Promise<void> {
  if (isClipboardApiAvailable() && typeof ClipboardItem !== 'undefined') {
    const htmlBlob = new Blob([payload.html], { type: 'text/html' });
    const textBlob = new Blob([payload.text], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      }),
    ]);
    return;
  }
  const ok = fallbackCopyHtml(payload.html);
  if (!ok) {
    const okText = fallbackCopyText(payload.text);
    if (!okText) throw new Error('Fallback copy failed');
  }
}
