# Ficha de producto — Catálogo RORI (ropa de hombre)

Herramienta local, de una sola página, para crear fichas técnicas de prendas, conservarlas en el navegador e intercambiarlas entre analistas de tienda y asesores de venta.

**No necesita servidor ni conexión a internet**: abre `index.html` con doble clic.

---

## Contenido de la carpeta

| Archivo | Función |
|---|---|
| `index.html` | Estructura y accesibilidad de la interfaz. |
| `styles.css` | Estilos propios, tipografía local y foco de teclado. |
| `app.js` | Toda la lógica: almacenamiento, imágenes, importación y exportación. |
| `catalogo_hombre.json`, `catalogo_hombre.xlsx` | Catálogo de ejemplo (2 prendas) listo para importar. |
| `logo_RORI.png` | Logo local; también se usa como favicon. |
| `vendor/` | Dependencias versionadas (Tailwind generado, SheetJS y Roboto). Ver `vendor/README.md`. |

---

## Uso

1. Abre `index.html` en un navegador moderno (Chrome, Edge, Firefox o Safari recientes).
2. Rellena el formulario o pulsa **Cargar ejemplo masculino**.
3. Adjunta una foto: botón «Adjuntar foto», arrastrarla a la vista previa o pulsar `Enter` con el foco en la zona de imagen. Se redimensiona a 1280 px y se comprime (WebP; JPEG si el navegador no soporta WebP).
4. **Guardar producto**. La ficha pasa a modo consulta y queda en la barra del catálogo.
5. Desde la barra puedes abrir «Ver catálogo» (buscar, ordenar y seleccionar), crear otra ficha, editar, borrar o exportar. Cuando hay varias fichas, ese botón muestra el nombre de la ficha activa y el contador (`1/3`), y sirve de selector; no hay lista de píldoras.

### Copias de seguridad e intercambio

Todas estas acciones están agrupadas en el menú **⋯** de la cabecera (junto al indicador «Local · N guardados»). Se abre con clic o con `Enter`/`Espacio`, se recorre con las flechas del teclado y se cierra con `Escape` o haciendo clic fuera.

| Opción del menú ⋯ | Qué genera | Cuándo usarlo |
|---|---|---|
| **Exportar JSON** | `catalogo_hombre.json` sin fotos | Intercambio ligero de datos de texto. |
| **JSON + fotos (.zip)** | `catalogo_hombre_fotos.zip` con el JSON y la carpeta `imagenes/` | **Copia de seguridad completa** o traspaso a otro equipo. |
| **Exportar Excel (.xlsx)** | Hoja con filtros y fechas ISO | Compartir con quien trabaja en Excel. Si la librería no carga, se genera CSV compatible. |
| **Importar** | Acepta `.json`, `.zip`, `.xlsx`, `.xls` y `.csv` | Restaurar una copia o cargar el catálogo de ejemplo incluido. |

Al importar, las fichas se combinan por `id` o, si no viene, por `referencia`: las coincidencias se actualizan y conservan su foto si el archivo no trae una; el resto se añaden. Se muestra un resumen de altas, actualizaciones y omisiones.

> El ZIP generado por la aplicación se puede importar de vuelta. Los ZIP comprimidos con DEFLATE también se admiten en navegadores con `DecompressionStream` (Chrome 103+, Firefox 113+, Safari 16.4+).

---

## Almacenamiento

Se usa **IndexedDB** (`TextilHombreCatalogoDB`, el mismo nombre de la versión anterior, para conservar las fichas ya guardadas) por defecto. Si el navegador lo bloquea (modo incógnito, iframes, políticas de privacidad), se activa automáticamente **localStorage** y, si ese también falla, memoria de la sesión. El badge junto al encabezado muestra el modo al pasar el ratón.

Para diagnosticar los modos de respaldo se puede forzar con `index.html?storage=localstorage` o `index.html?storage=memory` (este último no persiste al recargar).

Las fotos se guardan como `Blob` en IndexedDB (no como texto base64) para no inflar la memoria. En los modos de respaldo se guardan como base64; localStorage tiene un límite aproximado de 5 MB, así que conviene exportar el ZIP con regularidad. Si se supera la cuota se avisa y los datos siguen disponibles solo durante la sesión.

---

## Campos y validación

`referencia`, `producto`, `foto` y `colección` son obligatorios.

- **Referencia**: se normaliza a mayúsculas, sin acentos y con guiones (`HOM 67543` → `HOM-67543`). Si se deja vacía se genera la siguiente disponible, aunque se hayan borrado fichas. Se rechazan duplicados.
- **Ocasión**: se escribe con inicial mayúscula. Los campos de colección, ocasión y silueta ofrecen sugerencias, pero admiten texto libre.
- **`archivo_imagen`** es la ruta relativa dentro del ZIP (`imagenes/hom-024.webp`); el nombre se genera a partir de la referencia, sin espacios ni caracteres especiales.
- **`fecha_registro`** siempre se guarda y exporta en ISO 8601 (UTC), independientemente de la zona horaria del equipo.

Ejemplo de registro:

```json
{
  "id": "prd_1795144898736",
  "referencia": "HOM-67543",
  "producto": "Sporty Casual Style",
  "coleccion": "Colección RORI 2026",
  "ocasion": "Casual",
  "silueta": "Comfort-focused outfits",
  "composicion": "100 % algodón…",
  "inspiracion": "Clásico moderno…",
  "cuidado": "Lavar a máquina…",
  "archivo_imagen": "imagenes/hom-67543.webp",
  "fecha_registro": "2026-11-20T03:21:38.736Z"
}
```

En el ZIP, cada registro lleva además `imagen_base64` solo si el archivo original la incluía; las imágenes se guardan como archivos independientes.

---

## Accesibilidad y seguridad

- Modal con `role="dialog"`, foco inicial, cierre con `Escape` y bucle de foco.
- Avisos con `aria-live`, errores asociados a cada campo mediante `aria-describedby` y `aria-invalid`.
- Zona de imagen utilizable con teclado y zonas de la cuadrícula con `role="button"`.
- Aviso de cambios sin guardar antes de cambiar de ficha, limpiar, cerrar o recargar.
- Se respeta `prefers-reduced-motion`.
- Sin scripts remotos: no hay hotlinking de logo, ni CDN de Tailwind, fuentes o librerías. Sin contenido HTML dinámico vía `innerHTML` con datos del usuario.

---

## Desarrollo

No hay paso de compilación. Para servirlo localmente:

```powershell
python -m http.server 8123
# abrir http://127.0.0.1:8123/index.html
```

Si cambias clases de Tailwind en `index.html` o `app.js`, regenera `vendor/tailwind.generated.css` (el CSS estático solo contiene las utilidades usadas). Las dependencias y sus licencias están detalladas en `vendor/README.md`.

### Límites conocidos

- La capacidad depende del navegador; el ZIP es la única forma garantizada de conservar fotos y datos a largo plazo.
- Importar un XLSX/CSV no puede recuperar fotos: si la referencia coincide con una ficha existente, se mantiene la foto anterior.
- Los ZIP con métodos de compresión distintos a *store* y *deflate* requieren un navegador con `DecompressionStream`.
