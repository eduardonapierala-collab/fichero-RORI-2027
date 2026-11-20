/* ==========================================================================
 * Ficha de producto RORI — lógica de la aplicación
 *
 * Sin módulos ES ni dependencias de red: se puede abrir directamente con
 * doble clic (file://) o servir por HTTP. Todo se persiste en el navegador.
 * ==========================================================================
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
   * 1. Constantes y referencias DOM
   * -------------------------------------------------------------------- */
  // Se conserva el nombre original para no perder las fichas ya guardadas.
  const DB_NAME = 'TextilHombreCatalogoDB';
  const DB_VERSION = 1;
  const STORE_PRODUCTS = 'productos';
  const STORE_META = 'meta';
  const LS_KEY = 'TextilHombreCatalogo_Fallback';
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_IMAGE_WIDTH = 1280;

  const byId = (id) => document.getElementById(id);

  const el = {
    toastContainer: byId('toast-container'),
    confirmModal: byId('confirm-modal'),
    confirmTitle: byId('confirm-title'),
    confirmMessage: byId('confirm-message'),
    confirmCancel: byId('confirm-cancel'),
    confirmAccept: byId('confirm-accept'),

    workspaceGrid: byId('workspace-grid'),
    previewColumn: byId('preview-column'),
    formColumn: byId('form-column'),
    previewHeading: byId('preview-heading'),
    previewSubheading: byId('preview-subheading'),
    previewHeadingBlock: byId('preview-heading-block'),
    modeIndicator: byId('mode-indicator'),
    editorTipBox: byId('editor-tip-box'),
    viewModeActions: byId('view-mode-actions'),

    dropzone: byId('preview-dropzone'),
    emptyImgState: byId('preview-empty-image'),
    previewImg: byId('preview-image'),
    inputFoto: byId('input-foto'),
    btnAttachPhoto: byId('btn-attach-photo'),
    fileNameLabel: byId('file-name-label'),

    prevColeccion: byId('preview-coleccion-badge'),
    prevNombre: byId('preview-nombre'),
    prevOcasion: byId('preview-ocasion'),
    prevSilueta: byId('preview-silueta'),
    prevComposicion: byId('preview-composicion'),
    prevInspiracion: byId('preview-inspiracion'),
    prevReferencia: byId('preview-referencia'),
    prevCuidado: byId('preview-cuidado'),

    form: byId('product-form'),
    inProducto: byId('input-producto'),
    inColeccion: byId('input-coleccion'),
    inOcasion: byId('input-ocasion'),
    inSilueta: byId('input-silueta'),
    inReferencia: byId('input-referencia'),
    inComposicion: byId('input-composicion'),
    inInspiracion: byId('input-inspiracion'),
    inCuidado: byId('input-cuidado'),

    errFoto: byId('error-foto'),
    errProducto: byId('error-producto'),
    errColeccion: byId('error-coleccion'),
    errReferencia: byId('error-referencia'),

    statusBadge: byId('status-badge'),
    statusDot: byId('status-dot'),
    statusText: byId('status-text'),
    catalogBar: byId('catalog-bar'),
    savedPills: byId('saved-pills-container'),
    catalogGridView: byId('catalog-grid-view'),
    catalogCardsGrid: byId('catalog-cards-grid'),
    catalogGridCount: byId('catalog-grid-count'),
    catalogSearchInput: byId('catalog-search-input'),
    catalogSort: byId('catalog-sort'),
    catalogEmptySearch: byId('catalog-empty-search'),
    btnToggleCatalogGrid: byId('btn-toggle-catalog-grid'),
    btnGridLabel: byId('btn-grid-label'),
    btnCancelEdit: byId('btn-cancel-edit'),

    dataMenuWrap: byId('data-menu-wrap'),
    btnDataMenu: byId('btn-data-menu'),
    dataMenu: byId('data-menu'),
    btnImport: byId('btn-import'),
    inputImport: byId('input-import'),
    btnExportJson: byId('btn-export-json'),
    btnExportZip: byId('btn-export-zip'),
    btnExportExcel: byId('btn-export-excel')
  };

  /* ----------------------------------------------------------------------
   * 2. Estado de la aplicación
   * -------------------------------------------------------------------- */
  let db = null;
  let storageMode = 'memory'; // 'indexeddb' | 'localstorage' | 'memory'
  let memoryProducts = [];
  let productosGuardados = [];
  let isCatalogGridOpen = false;
  let currentEditingId = null;
  let activeProductId = null;
  let currentImageDataUrl = '';
  let currentImageFileName = '';
  let isDirty = false;

  // Las URL blob se crean una sola vez por producto para no duplicar imágenes en RAM.
  const imageUrlCache = new Map();

  /* ----------------------------------------------------------------------
   * 3. Utilidades de texto, fecha y archivo
   * -------------------------------------------------------------------- */
  function normalizeReferencia(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function slug(value) {
    return normalizeReferencia(value).toLowerCase();
  }

  function titleCase(value) {
    return String(value || '').trim().toLowerCase()
      .replace(/(^|[\s,;(-])([a-záéíóúñü])/g, (match, sep, ch) => sep + ch.toUpperCase());
  }

  function toIsoDate(value) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
  }

  function generateReference() {
    const used = new Set(productosGuardados.map((p) => normalizeReferencia(p.referencia)));
    const max = productosGuardados.reduce((acc, p) => {
      const m = normalizeReferencia(p.referencia).match(/(\d+)$/);
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 0);
    let n = max + 1;
    let ref;
    do {
      ref = 'HOM-' + String(n).padStart(3, '0');
      n += 1;
    } while (used.has(ref));
    return ref;
  }

  function mimeFromDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,/);
    return match ? match[1] : 'image/webp';
  }

  function extensionFromMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    return 'webp';
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = String(dataUrl).slice(String(dataUrl).indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function dataUrlToBlob(dataUrl) {
    return new Blob([dataUrlToBytes(dataUrl)], { type: mimeFromDataUrl(dataUrl) });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer la imagen almacenada.'));
      reader.readAsDataURL(blob);
    });
  }

  function bytesToDataUrl(bytes, name) {
    const n = String(name || '').toLowerCase();
    const mime = n.endsWith('.png') ? 'image/png'
      : (n.endsWith('.jpg') || n.endsWith('.jpeg')) ? 'image/jpeg'
        : n.endsWith('.webp') ? 'image/webp' : 'image/webp';
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return 'data:' + mime + ';base64,' + btoa(binary);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ----------------------------------------------------------------------
   * 4. ZIP mínimo (escritura sin compresión + lectura store/defle-raw)
   *    Evita añadir otra librería externa al proyecto.
   * -------------------------------------------------------------------- */
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const time = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() >> 1) & 31);
    const date = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

    const locals = [];
    const centrals = [];
    let offset = 0;

    files.forEach((file) => {
      const name = encoder.encode(file.name.replace(/\\/g, '/').replace(/^\/+/, ''));
      const data = file.bytes;
      const checksum = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // nombres en UTF-8
      lv.setUint16(8, 0, true);      // método: guardar sin comprimir
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, checksum, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);

      locals.push(local, data);
      centrals.push(central);
      offset += local.length + data.length;
    });

    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const parts = locals.concat(centrals, [end]);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let cursor = 0;
    parts.forEach((part) => { result.set(part, cursor); cursor += part.length; });
    return result;
  }

  async function readZip(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    const min = Math.max(0, bytes.length - 66000);
    for (let i = bytes.length - 22; i >= min; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo ZIP no es válido.');

    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries = {};

    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error('El índice del ZIP está dañado.');
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('El ZIP contiene entradas corruptas.');
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

      let content;
      if (method === 0) {
        content = compressed;
      } else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('Este navegador no puede descomprimir ZIP. Solicita el ZIP sin comprimir.');
        }
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        content = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error('Método de compresión ZIP no soportado (' + method + ').');
      }

      entries[name.replace(/\\/g, '/')] = content;
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  /* ----------------------------------------------------------------------
   * 5. Almacenamiento (una sola implementación, con respaldo real)
   * -------------------------------------------------------------------- */
  function activateFallbackStorage() {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      storageMode = 'localstorage';
    } catch (e) {
      storageMode = 'memory';
    }
  }

  function initStorage() {
    return new Promise((resolve) => {
      // ?storage=localstorage o ?storage=memory fuerza el modo de respaldo
      // (diagnóstico en entornos donde IndexedDB está bloqueado).
      const forced = new URLSearchParams(window.location.search).get('storage');
      if (forced === 'localstorage' || forced === 'memory') {
        activateFallbackStorage();
        storageMode = forced === 'memory' ? 'memory' : storageMode;
        resolve();
        return;
      }
      if (!('indexedDB' in window) || !window.indexedDB) {
        activateFallbackStorage();
        resolve();
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const database = event.target.result;
          if (!database.objectStoreNames.contains(STORE_PRODUCTS)) {
            database.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains(STORE_META)) {
            database.createObjectStore(STORE_META, { keyPath: 'key' });
          }
        };
        request.onsuccess = (event) => { db = event.target.result; storageMode = 'indexeddb'; resolve(); };
        request.onerror = () => { activateFallbackStorage(); resolve(); };
        request.onblocked = () => { activateFallbackStorage(); resolve(); };
      } catch (e) {
        activateFallbackStorage();
        resolve();
      }
    });
  }

  function readFallbackList() {
    if (storageMode === 'localstorage') {
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [...memoryProducts];
      }
    }
    return [...memoryProducts];
  }

  // Devuelve false cuando se supera la cuota; en ese caso se conserva la sesión en memoria.
  function writeFallbackList(list) {
    memoryProducts = [...list];
    if (storageMode === 'localstorage') {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(list));
      } catch (e) {
        storageMode = 'memory';
        return false;
      }
    }
    return true;
  }

  function sortByDate(list) {
    return list.sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro));
  }

  async function getAllProducts() {
    if (storageMode === 'indexeddb' && db) {
      try {
        const list = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_PRODUCTS, 'readonly');
          const request = tx.objectStore(STORE_PRODUCTS).getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        return sortByDate(list);
      } catch (e) {
        console.warn('IndexedDB no disponible; se activa el almacenamiento de respaldo.', e);
        activateFallbackStorage();
      }
    }
    return sortByDate(readFallbackList());
  }

  function saveProduct(product) {
    if (storageMode === 'indexeddb' && db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
          const request = tx.objectStore(STORE_PRODUCTS).put(product);
          request.onsuccess = () => resolve({ ok: true });
          request.onerror = () => {
            const quota = request.error && request.error.name === 'QuotaExceededError';
            activateFallbackStorage();
            const list = readFallbackList().filter((p) => p.id !== product.id);
            list.unshift(product);
            const persisted = writeFallbackList(list);
            resolve({ ok: true, warning: quota || !persisted
              ? 'Cuota de almacenamiento superada: exporta un ZIP para no perder los datos.'
              : 'IndexedDB no estuvo disponible; se usó almacenamiento de respaldo.' });
          };
        } catch (e) {
          activateFallbackStorage();
          const list = readFallbackList().filter((p) => p.id !== product.id);
          list.unshift(product);
          writeFallbackList(list);
          resolve({ ok: true, warning: 'Se usó almacenamiento de respaldo.' });
        }
      });
    }

    const list = readFallbackList().filter((p) => p.id !== product.id);
    list.unshift(product);
    const persisted = writeFallbackList(list);
    return Promise.resolve({
      ok: true,
      warning: persisted ? null : 'Cuota de almacenamiento superada: los cambios solo durarán esta sesión. Exporta un ZIP.'
    });
  }

  function deleteProduct(id) {
    if (storageMode === 'indexeddb' && db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
          const request = tx.objectStore(STORE_PRODUCTS).delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => {
            activateFallbackStorage();
            writeFallbackList(readFallbackList().filter((p) => p.id !== id));
            resolve();
          };
        } catch (e) {
          activateFallbackStorage();
          writeFallbackList(readFallbackList().filter((p) => p.id !== id));
          resolve();
        }
      });
    }
    writeFallbackList(readFallbackList().filter((p) => p.id !== id));
    return Promise.resolve();
  }

  function getImageUrl(product) {
    if (!product) return '';
    if (imageUrlCache.has(product.id)) return imageUrlCache.get(product.id);
    let url = '';
    if (product.imagen_blob) url = URL.createObjectURL(product.imagen_blob);
    else if (product.imagen_base64) url = product.imagen_base64;
    imageUrlCache.set(product.id, url);
    return url;
  }

  function clearImageUrl(id) {
    if (!imageUrlCache.has(id)) return;
    const url = imageUrlCache.get(id);
    if (url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
    imageUrlCache.delete(id);
  }

  /* ----------------------------------------------------------------------
   * 6. Imágenes: validación, compresión y soporte WebP
   * -------------------------------------------------------------------- */
  const webpSupported = (function () {
    try {
      return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) {
      return false;
    }
  })();

  function processAndCompressImage(file) {
    return new Promise((resolve, reject) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        reject(new Error('Formato no válido. Usa JPG, PNG o WEBP.'));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error('La imagen supera el máximo permitido de 5 MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > MAX_IMAGE_WIDTH) {
            height = Math.round((height * MAX_IMAGE_WIDTH) / width);
            width = MAX_IMAGE_WIDTH;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!webpSupported) {
            // JPEG no soporta transparencia: se rellena el fondo en blanco.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(img, 0, 0, width, height);

          const mime = webpSupported ? 'image/webp' : 'image/jpeg';
          const ext = extensionFromMime(mime);
          resolve({
            dataUrl: canvas.toDataURL(mime, 0.86),
            name: file.name,
            ext: ext
          });
        };
        img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error('Error leyendo el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  async function handleImageSelected(file) {
    if (!file) return;
    try {
      const result = await processAndCompressImage(file);
      currentImageDataUrl = result.dataUrl;
      currentImageFileName = result.name;
      el.fileNameLabel.textContent = result.name;
      el.errFoto.classList.add('hidden');
      isDirty = true;
      syncLivePreview();
      updateModeIndicator();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  /* ----------------------------------------------------------------------
   * 7. Interfaz: vista previa, estados y catálogo
   * -------------------------------------------------------------------- */
  function syncLivePreview() {
    const producto = el.inProducto.value.trim();
    const coleccion = el.inColeccion.value.trim();
    el.prevNombre.textContent = producto || 'Nombre del producto';
    el.prevColeccion.textContent = coleccion ? coleccion.toUpperCase() : 'SIN COLECCIÓN';
    el.prevOcasion.textContent = el.inOcasion.value.trim() || '—';
    el.prevSilueta.textContent = el.inSilueta.value.trim() || '—';
    el.prevComposicion.textContent = el.inComposicion.value.trim() || '—';
    el.prevInspiracion.textContent = el.inInspiracion.value.trim() || '—';
    el.prevReferencia.textContent = normalizeReferencia(el.inReferencia.value) || '—';
    el.prevCuidado.textContent = el.inCuidado.value.trim() || '—';

    if (currentImageDataUrl) {
      el.previewImg.src = currentImageDataUrl;
      el.previewImg.classList.remove('hidden');
      el.emptyImgState.classList.add('hidden');
    } else {
      el.previewImg.removeAttribute('src');
      el.previewImg.classList.add('hidden');
      el.emptyImgState.classList.remove('hidden');
    }
  }

  function updateModeIndicator() {
    if (!el.formColumn.classList.contains('hidden')) {
      el.modeIndicator.textContent = isDirty
        ? (currentEditingId ? 'Editando · sin guardar' : 'En edición · sin guardar')
        : (currentEditingId ? 'Editando ficha' : 'En edición');
      el.modeIndicator.className = 'text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#e8edf3] text-[#0f2942]';
    }
  }

  function setWorkspaceMode(mode) {
    if (mode === 'edit') {
      el.formColumn.classList.remove('hidden');
      el.previewColumn.classList.remove('lg:col-span-6', 'lg:col-start-4', 'max-w-lg', 'mx-auto', 'w-full');
      el.previewColumn.classList.add('lg:col-span-5');
      el.previewHeadingBlock.classList.remove('hidden');
      el.previewHeading.textContent = 'Vista previa de la ficha';
      el.previewSubheading.textContent = 'Se actualiza mientras completas el formulario.';
      el.modeIndicator.removeAttribute('title');
      el.modeIndicator.removeAttribute('aria-label');
      el.editorTipBox.classList.remove('hidden');
      el.viewModeActions.classList.add('hidden');
      el.btnCancelEdit.classList.toggle('hidden', productosGuardados.length === 0);
      el.dropzone.setAttribute('aria-disabled', 'false');
      updateModeIndicator();
    } else {
      el.formColumn.classList.add('hidden');
      el.previewColumn.classList.remove('lg:col-span-5');
      el.previewColumn.classList.add('lg:col-span-6', 'lg:col-start-4', 'max-w-lg', 'mx-auto', 'w-full');
      // En modo guardado el texto es redundante con el piloto y el badge de estado:
      // se oculta y se conserva la información en el tooltip del piloto.
      el.previewHeadingBlock.classList.add('hidden');
      el.previewHeading.textContent = 'Ficha técnica guardada';
      el.previewSubheading.textContent = 'Registro almacenado localmente en el catálogo.';
      el.modeIndicator.title = 'Registro almacenado localmente en el catálogo.';
      el.modeIndicator.setAttribute('aria-label', 'Guardado. Registro almacenado localmente en el catálogo.');
      el.modeIndicator.textContent = 'Guardado';
      el.modeIndicator.className = 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
      el.editorTipBox.classList.add('hidden');
      el.viewModeActions.classList.remove('hidden');
      el.dropzone.setAttribute('aria-disabled', 'true');
    }
  }

  function hideValidationErrors() {
    [el.errFoto, el.errProducto, el.errColeccion, el.errReferencia].forEach((node) => node.classList.add('hidden'));
    [el.inProducto, el.inColeccion, el.inReferencia].forEach((node) => node.removeAttribute('aria-invalid'));
  }

  function clearFormFields() {
    el.form.reset();
    currentEditingId = null;
    currentImageDataUrl = '';
    currentImageFileName = '';
    el.fileNameLabel.textContent = 'Ningún archivo seleccionado.';
    isDirty = false;
    hideValidationErrors();
    syncLivePreview();
    updateModeIndicator();
  }

  async function fillProduct(product, switchToEdit = false) {
    activeProductId = product.id;
    currentEditingId = switchToEdit ? product.id : null;

    el.inProducto.value = product.producto || '';
    el.inColeccion.value = product.coleccion || '';
    el.inOcasion.value = product.ocasion || '';
    el.inSilueta.value = product.silueta || '';
    el.inReferencia.value = product.referencia || '';
    el.inComposicion.value = product.composicion || '';
    el.inInspiracion.value = product.inspiracion || '';
    el.inCuidado.value = product.cuidado || '';

    const imageUrl = getImageUrl(product);
    if (imageUrl && imageUrl.indexOf('data:') === 0) {
      currentImageDataUrl = imageUrl;
    } else if (product.imagen_blob) {
      currentImageDataUrl = await blobToDataUrl(product.imagen_blob);
    } else {
      currentImageDataUrl = '';
    }
    currentImageFileName = product.archivo_imagen || (currentImageDataUrl ? 'imagen_guardada.webp' : '');
    el.fileNameLabel.textContent = currentImageFileName || 'Ningún archivo seleccionado.';

    isDirty = false;
    hideValidationErrors();
    syncLivePreview();
    renderCatalogBar();
    setWorkspaceMode(switchToEdit ? 'edit' : 'view');
  }

  function renderCatalogBar() {
    const count = productosGuardados.length;
    el.statusText.textContent = 'Local · ' + count + ' ' + (count === 1 ? 'guardado' : 'guardados');
    const storageLabel = storageMode === 'indexeddb' ? 'IndexedDB'
      : storageMode === 'localstorage' ? 'localStorage' : 'memoria (solo esta sesión)';
    el.statusBadge.title = 'Almacenamiento: ' + storageLabel + ' · exporta un ZIP para hacer copia de seguridad';
    el.statusDot.className = count > 0
      ? 'w-2 h-2 rounded-full bg-emerald-600'
      : 'w-2 h-2 rounded-full bg-amber-500';

    if (count === 0) {
      el.catalogBar.classList.add('hidden');
      isCatalogGridOpen = false;
      el.catalogGridView.classList.add('hidden');
      el.workspaceGrid.classList.remove('hidden');
      return;
    }

    el.catalogBar.classList.remove('hidden');

    // La lista de píldoras se sustituye por el propio botón «Ver catálogo»,
    // que muestra la ficha activa y cuántas hay guardadas.
    el.savedPills.innerHTML = '';
    el.savedPills.classList.add('hidden');

    const activeIndex = productosGuardados.findIndex((item) => item.id === activeProductId);
    const active = activeIndex >= 0 ? productosGuardados[activeIndex] : null;
    let label = 'Ver catálogo';
    let tooltip = 'Abrir el catálogo para buscar y seleccionar una prenda';
    if (count > 1) {
      label = active
        ? active.producto + ' · ' + (activeIndex + 1) + '/' + count
        : 'Ver catálogo · ' + count + ' prendas';
      if (active) {
        tooltip = [
          'Ficha activa: ' + active.producto,
          active.referencia ? 'Ref. ' + active.referencia : '',
          active.coleccion,
          active.ocasion
        ].filter(Boolean).join('\n');
      }
    }
    el.btnGridLabel.textContent = label;
    el.btnGridLabel.title = tooltip;
    el.btnToggleCatalogGrid.title = tooltip;
    el.btnToggleCatalogGrid.setAttribute('aria-label', label + '. Abrir catálogo');

    el.btnToggleCatalogGrid.setAttribute('aria-expanded', String(isCatalogGridOpen));
    if (isCatalogGridOpen) renderCatalogCardsGrid();
  }

  async function switchProduct(product) {
    const canLeave = await confirmIfDirty();
    if (!canLeave) return;
    setCatalogGridOpen(false);
    await fillProduct(product, false);
  }

  function setCatalogGridOpen(open) {
    isCatalogGridOpen = Boolean(open && productosGuardados.length > 0);
    if (isCatalogGridOpen) {
      el.catalogGridView.classList.remove('hidden');
      el.workspaceGrid.classList.add('hidden');
      el.btnGridLabel.textContent = 'Volver a ficha';
      renderCatalogCardsGrid();
    } else {
      el.catalogGridView.classList.add('hidden');
      el.workspaceGrid.classList.remove('hidden');
      el.btnGridLabel.textContent = 'Ver catálogo';
    }
    el.btnToggleCatalogGrid.setAttribute('aria-expanded', String(isCatalogGridOpen));
  }

  function renderCatalogCardsGrid() {
    const term = (el.catalogSearchInput.value || '').trim().toLowerCase();
    const sort = el.catalogSort.value;
    const filtered = productosGuardados.filter((item) => {
      if (!term) return true;
      return [item.producto, item.referencia, item.coleccion, item.silueta, item.composicion]
        .some((field) => String(field || '').toLowerCase().includes(term));
    });

    filtered.sort((a, b) => {
      if (sort === 'nombre') return String(a.producto).localeCompare(String(b.producto), 'es');
      if (sort === 'referencia') return String(a.referencia).localeCompare(String(b.referencia), 'es');
      if (sort === 'antiguos') return new Date(a.fecha_registro) - new Date(b.fecha_registro);
      return new Date(b.fecha_registro) - new Date(a.fecha_registro);
    });

    el.catalogGridCount.textContent = 'Mostrando ' + filtered.length + ' de ' + productosGuardados.length + ' '
      + (productosGuardados.length === 1 ? 'prenda guardada' : 'prendas guardadas') + '.';
    el.catalogCardsGrid.innerHTML = '';

    if (filtered.length === 0) {
      el.catalogEmptySearch.classList.remove('hidden');
      return;
    }
    el.catalogEmptySearch.classList.add('hidden');

    filtered.forEach((item) => {
      const card = document.createElement('article');
      const isCurrent = item.id === activeProductId;
      card.className = 'group bg-[#f8fafc] hover:bg-white rounded-2xl border ' + (isCurrent ? 'border-[#0f2942] ring-1 ring-[#0f2942]/20' : 'border-[#d6dfea]') + ' overflow-hidden transition flex flex-col cursor-pointer shadow-2xs hover:shadow-sm';
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'Abrir ficha de ' + item.producto);

      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'relative aspect-[4/3] w-full bg-[#dce3ec] overflow-hidden';
      const imageUrl = getImageUrl(item);
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = item.producto;
        img.className = 'w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300';
        imgWrapper.appendChild(img);
      }
      const badge = document.createElement('span');
      badge.className = 'absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-white/95 text-[#0d1b2a] text-[11px] font-bold uppercase tracking-wider shadow-2xs';
      badge.textContent = item.coleccion || 'SIN COLECCIÓN';
      imgWrapper.appendChild(badge);

      const body = document.createElement('div');
      body.className = 'p-4 flex-1 flex flex-col justify-between gap-3';
      const topInfo = document.createElement('div');
      const refText = document.createElement('p');
      refText.className = 'font-mono text-[11px] font-semibold text-[#0f2942]';
      refText.textContent = item.referencia || 'SIN REF';
      const titleText = document.createElement('h3');
      titleText.className = 'text-sm font-bold text-[#0d1b2a] mt-0.5 line-clamp-1';
      titleText.textContent = item.producto;
      const metaText = document.createElement('p');
      metaText.className = 'text-xs text-[#5c6b7c] mt-1 line-clamp-1';
      metaText.textContent = [item.silueta, item.composicion].filter(Boolean).join(' · ') || 'Sin especificaciones adicionales';
      topInfo.appendChild(refText);
      topInfo.appendChild(titleText);
      topInfo.appendChild(metaText);

      const footerHint = document.createElement('div');
      footerHint.className = 'pt-2.5 border-t border-[#e8edf3] flex items-center justify-between text-[11px] font-medium text-[#0f2942]';
      const openLabel = document.createElement('span');
      openLabel.textContent = 'Abrir ficha';
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      arrow.setAttribute('aria-hidden', 'true');
      footerHint.appendChild(openLabel);
      footerHint.appendChild(arrow);

      body.appendChild(topInfo);
      body.appendChild(footerHint);
      card.appendChild(imgWrapper);
      card.appendChild(body);

      const open = () => { void switchProduct(item); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
      el.catalogCardsGrid.appendChild(card);
    });
  }

  /* ----------------------------------------------------------------------
   * 8. Validación y guardado
   * -------------------------------------------------------------------- */
  function validateForm() {
    hideValidationErrors();
    let valid = true;

    if (!currentImageDataUrl) {
      el.errFoto.classList.remove('hidden');
      valid = false;
    }
    if (!el.inProducto.value.trim()) {
      el.errProducto.classList.remove('hidden');
      el.inProducto.setAttribute('aria-invalid', 'true');
      valid = false;
    }
    if (!el.inColeccion.value.trim()) {
      el.errColeccion.classList.remove('hidden');
      el.inColeccion.setAttribute('aria-invalid', 'true');
      valid = false;
    }

    const ref = normalizeReferencia(el.inReferencia.value);
    if (ref && !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(ref)) {
      el.errReferencia.textContent = 'Usa solo letras, números y guiones (Ej. HOM-024).';
      el.errReferencia.classList.remove('hidden');
      el.inReferencia.setAttribute('aria-invalid', 'true');
      valid = false;
    } else if (ref && productosGuardados.some((p) => p.referencia === ref && p.id !== currentEditingId)) {
      el.errReferencia.textContent = 'Ya existe una ficha con esa referencia.';
      el.errReferencia.classList.remove('hidden');
      el.inReferencia.setAttribute('aria-invalid', 'true');
      valid = false;
    }
    return valid;
  }

  async function handleSaveProduct(event) {
    event.preventDefault();
    if (!validateForm()) {
      showToast('Completa los campos obligatorios y revisa la referencia.', 'error');
      return;
    }

    const referencia = normalizeReferencia(el.inReferencia.value) || generateReference();
    const id = currentEditingId || ('prd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    const mime = mimeFromDataUrl(currentImageDataUrl);
    const ext = extensionFromMime(mime);
    const imagenPath = 'imagenes/' + slug(referencia) + '.' + ext;

    const record = {
      id: id,
      referencia: referencia,
      producto: el.inProducto.value.trim(),
      coleccion: el.inColeccion.value.trim(),
      ocasion: titleCase(el.inOcasion.value),
      silueta: el.inSilueta.value.trim(),
      composicion: el.inComposicion.value.trim(),
      inspiracion: el.inInspiracion.value.trim(),
      cuidado: el.inCuidado.value.trim(),
      archivo_imagen: imagenPath,
      imagen_base64: '',
      imagen_blob: null,
      fecha_registro: new Date().toISOString()
    };

    const previous = productosGuardados.find((p) => p.id === id);
    if (previous) record.fecha_registro = previous.fecha_registro;

    if (storageMode === 'indexeddb' && db && currentImageDataUrl) {
      record.imagen_blob = dataUrlToBlob(currentImageDataUrl);
    } else {
      record.imagen_base64 = currentImageDataUrl;
    }

    try {
      const result = await saveProduct(record);
      clearImageUrl(id);
      productosGuardados = await getAllProducts();
      activeProductId = id;
      currentEditingId = null;
      isDirty = false;
      el.inReferencia.value = referencia;
      syncLivePreview();
      renderCatalogBar();
      setWorkspaceMode('view');
      showToast('Ficha «' + record.producto + '» guardada correctamente.');
      if (result.warning) showToast(result.warning, 'error');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el producto en el navegador.', 'error');
    }
  }

  /* ----------------------------------------------------------------------
   * 9. Exportación
   * -------------------------------------------------------------------- */
  function cleanRecords() {
    return productosGuardados.map((p) => {
      const copy = { ...p };
      delete copy.imagen_base64;
      delete copy.imagen_blob;
      return copy;
    });
  }

  function exportToJson() {
    if (!productosGuardados.length) return showToast('Aún no hay productos guardados para exportar.', 'error');
    const blob = new Blob([JSON.stringify(cleanRecords(), null, 2)], { type: 'application/json;charset=utf-8' });
    triggerDownload(blob, 'catalogo_hombre.json');
    showToast('Exportados ' + productosGuardados.length + ' productos a JSON (sin fotos). Usa «JSON + fotos» para copiar el catálogo completo.');
  }

  async function exportToZip() {
    if (!productosGuardados.length) return showToast('Aún no hay productos guardados para exportar.', 'error');
    try {
      const encoder = new TextEncoder();
      const records = cleanRecords();
      const files = [{
        name: 'catalogo_hombre.json',
        bytes: encoder.encode(JSON.stringify(records, null, 2))
      }];

      for (const product of productosGuardados) {
        const source = product.imagen_blob
          ? await blobToDataUrl(product.imagen_blob)
          : product.imagen_base64;
        if (!source) continue;
        files.push({
          name: String(product.archivo_imagen || 'imagenes/' + slug(product.referencia) + '.webp').replace(/^\/+/, ''),
          bytes: dataUrlToBytes(source)
        });
      }

      files.push({
        name: 'LEEME.txt',
        bytes: encoder.encode(
          'Catálogo RORI — copia completa\r\n' +
          'Arrastra este ZIP al botón «Importar» de la aplicación para restaurar las fichas y sus fotos.\r\n' +
          'También puedes importar solo catalogo_hombre.json si no necesitas las imágenes.\r\n'
        )
      });

      triggerDownload(new Blob([createZip(files)], { type: 'application/zip' }), 'catalogo_hombre_fotos.zip');
      showToast('Copia completa exportada: ' + files.length + ' archivos en ZIP.');
    } catch (err) {
      console.error(err);
      showToast('No se pudo generar el ZIP.', 'error');
    }
  }

  function exportToExcel() {
    if (!productosGuardados.length) return showToast('Aún no hay productos guardados para exportar.', 'error');

    const rows = productosGuardados.map((p) => ({
      'Referencia': p.referencia,
      'Producto': p.producto,
      'Colección': p.coleccion,
      'Ocasión': p.ocasion || '',
      'Silueta': p.silueta || '',
      'Composición': p.composicion || '',
      'Inspiración': p.inspiracion || '',
      'Cuidado del producto': p.cuidado || '',
      'Archivo imagen': p.archivo_imagen || '',
      'Fecha de registro (ISO)': p.fecha_registro
    }));

    if (typeof XLSX !== 'undefined') {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 16 }, { wch: 30 }, { wch: 20 }, { wch: 20 },
        { wch: 22 }, { wch: 34 }, { wch: 38 }, { wch: 38 },
        { wch: 26 }, { wch: 26 }
      ];
      worksheet['!autofilter'] = { ref: 'A1:J' + (rows.length + 1) };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Catalogo Hombre');
      XLSX.writeFile(workbook, 'catalogo_hombre.xlsx');
      showToast('Excel generado con ' + rows.length + ' productos.');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(';'),
      ...rows.map((r) => headers.map((h) => '"' + String(r[h]).replace(/"/g, '""') + '"').join(';'))
    ];
    triggerDownload(new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), 'catalogo_hombre.csv');
    showToast('Librería Excel no disponible: se exportó CSV compatible.', 'error');
  }

  /* ----------------------------------------------------------------------
   * 10. Importación
   * -------------------------------------------------------------------- */
  function pick(row, ...names) {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') return row[name];
    }
    return '';
  }

  function findImageInZip(record, entries) {
    const wanted = String(record.archivo_imagen || '').split('/').pop().toLowerCase();
    const alt = slug(record.referencia);
    const names = Object.keys(entries);
    if (wanted) {
      const exact = names.find((name) => name.split('/').pop().toLowerCase() === wanted);
      if (exact) return entries[exact];
    }
    const byRef = names.find((name) => {
      const base = name.split('/').pop().toLowerCase();
      return alt && base.indexOf(alt) === 0 && /\.(png|jpe?g|webp)$/.test(base);
    });
    return byRef ? entries[byRef] : null;
  }

  function normalizeImportedRecord(raw, imageBytes) {
    const producto = String(pick(raw, 'producto', 'Producto')).trim();
    const coleccion = String(pick(raw, 'coleccion', 'Colección')).trim();
    if (!producto || !coleccion) return null;

    const referencia = normalizeReferencia(pick(raw, 'referencia', 'Referencia'));
    const imagenBase64 = typeof raw.imagen_base64 === 'string' && raw.imagen_base64.startsWith('data:')
      ? raw.imagen_base64 : '';
    let archivoImagen = String(pick(raw, 'archivo_imagen', 'Archivo imagen', 'Imagen')).trim();
    if (imageBytes && !archivoImagen) archivoImagen = 'imagenes/' + (referencia || slug(producto)) + '.webp';

    return {
      id: String(pick(raw, 'id', 'ID') || ''),
      referencia: referencia,
      producto: producto,
      coleccion: coleccion,
      ocasion: titleCase(pick(raw, 'ocasion', 'Ocasión')),
      silueta: String(pick(raw, 'silueta', 'Silueta')).trim(),
      composicion: String(pick(raw, 'composicion', 'Composición')).trim(),
      inspiracion: String(pick(raw, 'inspiracion', 'Inspiración')).trim(),
      cuidado: String(pick(raw, 'cuidado', 'Cuidado del producto', 'Cuidado')).trim(),
      archivo_imagen: archivoImagen,
      imagen_base64: imageBytes ? bytesToDataUrl(imageBytes, archivoImagen) : imagenBase64,
      imagen_blob: null,
      fecha_registro: toIsoDate(pick(raw, 'fecha_registro', 'Fecha de registro (ISO)', 'Fecha de registro'))
    };
  }

  async function parseImportFile(file) {
    const lower = file.name.toLowerCase();
    let rawRecords = [];
    let entries = null;

    if (lower.endsWith('.zip')) {
      entries = await readZip(file);
      const jsonName = Object.keys(entries).find((name) => name.toLowerCase().endsWith('.json'));
      if (!jsonName) throw new Error('El ZIP no contiene ningún archivo JSON.');
      const text = new TextDecoder().decode(entries[jsonName]);
      rawRecords = JSON.parse(text);
    } else if (lower.endsWith('.json')) {
      rawRecords = JSON.parse(await file.text());
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
      if (typeof XLSX === 'undefined') throw new Error('La librería Excel no está disponible.');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRecords = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    } else {
      throw new Error('Formato no soportado. Usa JSON, ZIP, XLSX o CSV.');
    }

    if (!Array.isArray(rawRecords)) throw new Error('El archivo debe contener una lista de productos.');

    const records = [];
    rawRecords.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const imageBytes = entries ? findImageInZip(raw, entries) : null;
      const normalized = normalizeImportedRecord(raw, imageBytes);
      if (normalized) records.push(normalized);
    });
    return records;
  }

  async function applyImportedRecords(records) {
    if (!records.length) {
      showToast('No se encontraron fichas válidas en el archivo.', 'error');
      return;
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const usedRefs = new Set(productosGuardados.map((p) => p.referencia));
    let refCounter = productosGuardados.reduce((acc, p) => {
      const m = normalizeReferencia(p.referencia).match(/(\d+)$/);
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 0);

    for (const incoming of records) {
      if (!incoming.referencia) {
        let candidate;
        do {
          refCounter += 1;
          candidate = 'HOM-' + String(refCounter).padStart(3, '0');
        } while (usedRefs.has(candidate));
        incoming.referencia = candidate;
        usedRefs.add(candidate);
      }
      const existingById = productosGuardados.find((p) => p.id && p.id === incoming.id);
      const byRef = productosGuardados.find((p) => p.referencia === incoming.referencia);
      const target = existingById || byRef;

      if (target) {
        incoming.id = target.id;
        if (!incoming.imagen_base64 && target.imagen_blob) incoming.imagen_blob = target.imagen_blob;
        if (!incoming.imagen_base64 && !incoming.imagen_blob && target.imagen_base64) incoming.imagen_base64 = target.imagen_base64;
      } else if (!incoming.id) {
        incoming.id = 'prd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      }

      clearImageUrl(incoming.id);
      const result = await saveProduct(incoming);
      if (!result.ok) { skipped += 1; continue; }
      if (target) updated += 1; else added += 1;
      if (result.warning) showToast(result.warning, 'error');
    }

    productosGuardados = await getAllProducts();
    renderCatalogBar();
    if (productosGuardados.length) {
      await fillProduct(productosGuardados[0], false);
    } else {
      await startNewProduct(true);
    }
    showToast('Importación: ' + added + ' nuevas, ' + updated + ' actualizadas, ' + skipped + ' omitidas.');
  }

  async function handleImportFile(file) {
    try {
      showToast('Leyendo ' + file.name + '…');
      const records = await parseImportFile(file);
      await applyImportedRecords(records);
    } catch (err) {
      console.error(err);
      showToast('No se pudo importar: ' + err.message, 'error');
    }
  }

  /* ----------------------------------------------------------------------
   * 11. Toasts, confirmaciones y navegación sin pérdida de datos
   * -------------------------------------------------------------------- */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const colors = type === 'error'
      ? 'bg-red-800 text-white border-red-900'
      : 'bg-[#0f2942] text-[#f5f7fa] border-[#1d3f61]';
    toast.className = 'pointer-events-auto px-4 py-3 rounded-xl border shadow-lg text-xs font-medium flex items-center gap-2.5 transition-all duration-300 ' + colors;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      window.setTimeout(() => toast.remove(), 300);
    }, 3600);
  }

  let confirmResolver = null;
  let confirmPreviousFocus = null;
  const ACCEPT_BASE = 'px-4 py-2 text-sm font-medium rounded-xl transition';
  const ACCEPT_DANGER = 'bg-red-700 text-white hover:bg-red-800';
  const ACCEPT_PRIMARY = 'bg-[#0f2942] text-white hover:bg-[#091b2d]';

  function askConfirmation(options) {
    const config = typeof options === 'string'
      ? { message: options, confirmLabel: 'Eliminar', danger: true }
      : options;

    return new Promise((resolve) => {
      confirmResolver = resolve;
      confirmPreviousFocus = document.activeElement;
      el.confirmTitle.textContent = config.title || 'Confirmar acción';
      el.confirmMessage.textContent = config.message || '';
      el.confirmAccept.textContent = config.confirmLabel || 'Aceptar';
      el.confirmAccept.className = ACCEPT_BASE + ' ' + (config.danger ? ACCEPT_DANGER : ACCEPT_PRIMARY);
      el.confirmModal.classList.remove('hidden');
      el.confirmModal.classList.add('flex');
      el.confirmCancel.focus();
    });
  }

  function closeConfirmation(result) {
    if (!confirmResolver) return;
    el.confirmModal.classList.add('hidden');
    el.confirmModal.classList.remove('flex');
    const resolve = confirmResolver;
    confirmResolver = null;
    if (confirmPreviousFocus && typeof confirmPreviousFocus.focus === 'function') confirmPreviousFocus.focus();
    confirmPreviousFocus = null;
    resolve(result);
  }

  function confirmIfDirty() {
    if (!isDirty) return Promise.resolve(true);
    return askConfirmation({
      title: 'Cambios sin guardar',
      message: 'Hay cambios en la ficha que todavía no se han guardado. ¿Descartarlos y continuar?',
      confirmLabel: 'Descartar cambios',
      danger: true
    });
  }

  async function startNewProduct(force = false) {
    if (!force && !(await confirmIfDirty())) return;
    setCatalogGridOpen(false);
    activeProductId = null;
    clearFormFields();
    renderCatalogBar();
    setWorkspaceMode('edit');
  }

  /* ----------------------------------------------------------------------
   * 12. Ejemplo de prueba (Canvas, sin archivos externos)
   * -------------------------------------------------------------------- */
  function loadMenswearSample() {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dce3ec';
    ctx.fillRect(0, 0, 800, 720);
    ctx.strokeStyle = 'rgba(15, 41, 66, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 800; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 720); ctx.stroke();
    }
    ctx.fillStyle = '#0f2942';
    ctx.beginPath();
    ctx.moveTo(270, 175); ctx.lineTo(355, 150); ctx.lineTo(400, 185); ctx.lineTo(445, 150);
    ctx.lineTo(530, 175); ctx.lineTo(615, 310); ctx.lineTo(560, 345); ctx.lineTo(515, 265);
    ctx.lineTo(515, 555); ctx.lineTo(285, 555); ctx.lineTo(285, 265); ctx.lineTo(240, 345);
    ctx.lineTo(185, 310); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8edf3';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(318, 255, 54, 62);
    ctx.strokeRect(428, 255, 54, 62);
    ctx.fillStyle = '#e8edf3';
    [215, 275, 335, 395, 455, 515].forEach((y) => {
      ctx.beginPath(); ctx.arc(400, y, 4.5, 0, Math.PI * 2); ctx.fill();
    });

    currentImageDataUrl = canvas.toDataURL(webpSupported ? 'image/webp' : 'image/jpeg', 0.9);
    currentImageFileName = 'sobrecamisa_sarga_hom108.' + (webpSupported ? 'webp' : 'jpg');
    el.fileNameLabel.textContent = currentImageFileName;
    el.inProducto.value = 'Sobrecamisa de sarga de algodón';
    el.inColeccion.value = 'Otoño 2026';
    el.inOcasion.value = 'Casual, entretiempo, oficina';
    el.inSilueta.value = 'Overshirt regular fit';
    el.inReferencia.value = 'HOM-108';
    el.inComposicion.value = '98% algodón orgánico peinado, 2% elastano (290 g/m²)';
    el.inInspiracion.value = 'Sastrería utilitaria contemporánea en azul marino profundo';
    el.inCuidado.value = 'Lavar a máquina máx. 30 °C con colores similares, planchar a temperatura media';

    isDirty = true;
    hideValidationErrors();
    syncLivePreview();
    updateModeIndicator();
    showToast('Ejemplo de prenda masculina cargado.');
  }

  /* ----------------------------------------------------------------------
   * 13. Eventos e inicialización
   * -------------------------------------------------------------------- */
  function bindEvents() {
    [el.inProducto, el.inColeccion, el.inOcasion, el.inSilueta, el.inReferencia,
      el.inComposicion, el.inInspiracion, el.inCuidado].forEach((input) => {
      input.addEventListener('input', () => {
        syncLivePreview();
        if (!isDirty) { isDirty = true; updateModeIndicator(); }
      });
    });

    const openFilePicker = () => {
      if (el.formColumn.classList.contains('hidden')) return;
      el.inputFoto.click();
    };
    el.btnAttachPhoto.addEventListener('click', openFilePicker);
    el.dropzone.addEventListener('click', openFilePicker);
    el.dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFilePicker(); }
    });
    el.inputFoto.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) handleImageSelected(event.target.files[0]);
      event.target.value = '';
    });

    ['dragenter', 'dragover'].forEach((name) => {
      el.dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!el.formColumn.classList.contains('hidden')) el.dropzone.classList.add('dropzone-active');
      });
    });
    ['dragleave', 'drop'].forEach((name) => {
      el.dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        event.stopPropagation();
        el.dropzone.classList.remove('dropzone-active');
      });
    });
    el.dropzone.addEventListener('drop', (event) => {
      if (el.formColumn.classList.contains('hidden')) return;
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files[0]) handleImageSelected(files[0]);
    });

    el.form.addEventListener('submit', handleSaveProduct);

    byId('btn-clear-form').addEventListener('click', async () => {
      if (!(await confirmIfDirty())) return;
      clearFormFields();
      showToast('Formulario limpiado.');
    });
    byId('btn-fill-sample').addEventListener('click', loadMenswearSample);

    const newProduct = async () => { await startNewProduct(false); };
    byId('btn-new-product-top').addEventListener('click', newProduct);
    byId('btn-new-product-card').addEventListener('click', newProduct);

    el.btnToggleCatalogGrid.addEventListener('click', () => {
      setCatalogGridOpen(!isCatalogGridOpen);
      if (!isCatalogGridOpen) el.workspaceGrid.classList.remove('hidden');
    });
    el.catalogSearchInput.addEventListener('input', renderCatalogCardsGrid);
    el.catalogSort.addEventListener('change', renderCatalogCardsGrid);

    byId('btn-edit-card').addEventListener('click', async () => {
      const current = productosGuardados.find((p) => p.id === activeProductId);
      if (current) await fillProduct(current, true);
    });

    el.btnCancelEdit.addEventListener('click', async () => {
      const fallback = productosGuardados.find((p) => p.id === activeProductId) || productosGuardados[0];
      if (!(await confirmIfDirty())) return;
      if (fallback) await fillProduct(fallback, false);
      else await startNewProduct(true);
    });

    byId('btn-delete-card').addEventListener('click', async () => {
      const current = productosGuardados.find((p) => p.id === activeProductId);
      if (!current) return;
      const confirmed = await askConfirmation({
        title: 'Eliminar ficha',
        message: '¿Deseas eliminar «' + current.producto + '» (' + current.referencia + ') del catálogo local?',
        confirmLabel: 'Eliminar',
        danger: true
      });
      if (!confirmed) return;

      await deleteProduct(current.id);
      clearImageUrl(current.id);
      productosGuardados = await getAllProducts();
      renderCatalogBar();
      showToast('Ficha eliminada del catálogo.');
      if (productosGuardados.length) await fillProduct(productosGuardados[0], false);
      else await startNewProduct(true);
    });

    /* --- Menú desplegable de datos (⋯) -------------------------------- */
    function openDataMenu() {
      if (!el.dataMenu.classList.contains('hidden')) return;
      el.dataMenu.classList.remove('hidden');
      el.btnDataMenu.setAttribute('aria-expanded', 'true');
      const firstItem = el.dataMenu.querySelector('[role="menuitem"]');
      if (firstItem) firstItem.focus();
    }

    function closeDataMenu(restoreFocus = false) {
      if (el.dataMenu.classList.contains('hidden')) return;
      el.dataMenu.classList.add('hidden');
      el.btnDataMenu.setAttribute('aria-expanded', 'false');
      if (restoreFocus) el.btnDataMenu.focus();
    }

    el.btnDataMenu.addEventListener('click', () => {
      if (el.dataMenu.classList.contains('hidden')) openDataMenu();
      else closeDataMenu(true);
    });

    el.dataMenuWrap.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDataMenu(true);
        return;
      }
      if (el.dataMenu.classList.contains('hidden')) return;

      const items = Array.from(el.dataMenu.querySelectorAll('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement);
      const move = (nextIndex) => {
        event.preventDefault();
        items[nextIndex].focus();
      };

      if (event.key === 'ArrowDown') move((index + 1) % items.length);
      else if (event.key === 'ArrowUp') move((index - 1 + items.length) % items.length);
      else if (event.key === 'Home') move(0);
      else if (event.key === 'End') move(items.length - 1);
      else if (event.key === 'Tab') closeDataMenu();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!el.dataMenu.classList.contains('hidden') && !el.dataMenuWrap.contains(event.target)) {
        closeDataMenu();
      }
    });

    /* Cada acción cierra el menú antes de ejecutarse. */
    el.btnImport.addEventListener('click', () => {
      closeDataMenu();
      el.inputImport.click();
    });
    el.inputImport.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) handleImportFile(event.target.files[0]);
      event.target.value = '';
    });
    el.btnExportJson.addEventListener('click', () => { closeDataMenu(); exportToJson(); });
    el.btnExportZip.addEventListener('click', () => { closeDataMenu(); exportToZip(); });
    el.btnExportExcel.addEventListener('click', () => { closeDataMenu(); exportToExcel(); });

    el.confirmCancel.addEventListener('click', () => closeConfirmation(false));
    el.confirmAccept.addEventListener('click', () => closeConfirmation(true));
    el.confirmModal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeConfirmation(false); }
      if (event.key !== 'Tab') return;
      const focusables = [el.confirmCancel, el.confirmAccept];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    window.addEventListener('beforeunload', (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  async function init() {
    bindEvents();
    try {
      await initStorage();
      productosGuardados = await getAllProducts();
      renderCatalogBar();
      if (productosGuardados.length) await fillProduct(productosGuardados[0], false);
      else setWorkspaceMode('edit');
    } catch (err) {
      console.warn('Iniciando sin persistencia:', err);
      activateFallbackStorage();
      setWorkspaceMode('edit');
      showToast('El almacenamiento no está disponible: los datos solo durarán esta sesión.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
