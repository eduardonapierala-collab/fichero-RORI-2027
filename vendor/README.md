# Dependencias versionadas

Todos los archivos de esta carpeta se sirven localmente para que la aplicación funcione sin red.

| Archivo | Origen | Versión | Licencia |
|---|---|---|---|
| `tailwind.generated.css` | CSS generado con Tailwind Play CDN a partir del markup de `index.html` (20/11/2026). Contiene solo las utilidades utilizadas. | Tailwind CSS 3.x (salida estática) | MIT |
| `xlsx.full.min.js` | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js | SheetJS 0.20.3 | Apache-2.0 (Community Edition) |
| `roboto-latin.woff2`, `roboto-latin-ext.woff2` | Google Fonts (Roboto variable, v51, subconjuntos latin y latin-ext) | Roboto v51 | Apache-2.0 |

## Notas

- **No actualizar SheetJS desde npm**: la versión publicada en npm se quedó en 0.18.5. Las versiones nuevas se distribuyen en `cdn.sheetjs.com`.
- Si se añaden utilidades nuevas de Tailwind al HTML o al JS, hay que regenerar `tailwind.generated.css`; el archivo no incluye clases que no aparecieran en el momento de generarlo.
- Las fuentes se declaran en `styles.css` como `font-weight: 400 700` porque los WOFF2 son variables.
