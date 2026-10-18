# Análisis del proyecto Achievement-Watcher — Oportunidades de mejora

Este documento resume el análisis del código y las oportunidades de mejora priorizadas (seguridad, código, dependencias, tests, documentación y build).

**Correcciones ya aplicadas (resumen):** XSS en nombre de juego (steam.js textContent + app.js .text()), path.join en steam.js, icon null-safe, catch vacíos sustituidos por logging, CSP sin `unsafe-inline` en scripts (script externo init-window.js), preload + IPC para app-getAppPath/getPath, Node 20 en updater, README de build actualizado, Jest y tests básicos añadidos.

---

## Resumen ejecutivo

| Área            | Prioridad | Cantidad |
|-----------------|-----------|----------|
| Seguridad       | Alta      | 4        |
| Código/errores  | Media     | 5        |
| Dependencias    | Alta/Media| 3        |
| Tests           | Media     | 1        |
| Documentación   | Baja      | 2        |
| Build/consistencia | Baja  | 2        |

---

## 1. Seguridad (prioridad alta)

### 1.1 Configuración insegura de Electron

**Ubicación:** `app/electron/init.js` (líneas 79–86)

**Problema:** La ventana del renderer tiene:
- `nodeIntegration: true`
- `contextIsolation: false`
- `enableRemoteModule: true`

Esto expone todo Node y el módulo `remote` al contenido web y va en contra de las [recomendaciones actuales de Electron](https://www.electronjs.org/docs/latest/tutorial/security).

**Recomendación:**
1. Activar `contextIsolation: true` y desactivar `nodeIntegration` en el renderer.
2. Crear un script **preload** que use `contextBridge.exposeInMainWorld()` para exponer solo las APIs necesarias (por ejemplo `appPath`, `getPath`, `dialog`, `shell`, etc.).
3. Planificar la eliminación de `@electron/remote`: usar `ipcRenderer.invoke()` para las operaciones que hoy se hacen vía `remote` y exponerlas desde el preload.

### 1.2 Riesgo de XSS con el nombre del juego (Steam)

**Ubicación:**  
- `app/parser/steam.js` línea 606: se asigna `html.querySelector('.apphub_AppName').innerHTML` a `name`.  
- `app/app.js` línea 143: ese valor se inserta en HTML con  
  `<div class="title">${list[game].name}</div>` y luego se hace `elem.append(template)`.

**Problema:** Cualquier HTML/script en la página de Steam (o en un nombre malicioso) se interpreta en el DOM y puede provocar XSS.

**Recomendación:**
- En `steam.js`: usar **texto plano** en lugar de HTML, por ejemplo  
  `html.querySelector('.apphub_AppName')?.textContent?.trim() ?? ''` (o el equivalente seguro del parser que uses).
- En `app.js`: para el nombre del juego no insertar HTML; usar creación de nodos y `.textContent` o `.text()` de jQuery para el contenido del `.title`, por ejemplo:
  - Crear el nodo y asignar `element.textContent = list[game].name`, o
  - Construir el template con un único nodo de texto y rellenar el nombre por API segura (evitando `${list[game].name}` dentro de HTML).

### 1.3 CSP con `unsafe-inline`

**Ubicación:** `app/view/app.html` línea 7

**Problema:**  
`script-src 'self' 'unsafe-inline'` y `style-src 'self' 'unsafe-inline'` reducen la efectividad de la CSP frente a inyección de scripts/estilos.

**Recomendación:**  
A largo plazo, eliminar `unsafe-inline`: usar nonces o hashes para los scripts inline necesarios y mover estilos a archivos externos o bloques con nonce.

### 1.4 Uso de `require` y rutas en la página

**Ubicación:** `app/view/app.html` (bloque script líneas 507–521 y 523)

**Problema:** En el HTML se hace `require('path')`, `require('@electron/remote')` y `require('../ui/lib/jquery-3.3.1.min.js')`. Con un preload y contextIsolation, este código no podrá usar `require` en el renderer.

**Recomendación:**  
Al migrar a preload + contextIsolation, exponer desde el proceso main (vía preload) lo que el renderer necesite (`appPath`, APIs de ventana/dialog/shell, etc.) y cargar jQuery y el resto de scripts como módulos o mediante el preload sin depender de `require` en el HTML.

---

## 2. Código y manejo de errores (prioridad media)

### 2.1 Catch vacíos o que no registran

**Ubicaciones detectadas:**
- `app/app.js`: líneas 36, 43, 44, 54, 56 (WebSocket y arranque).
- `app/ui/settings.js`: líneas 16, 145, 317.
- `app/parser/greenluma.js`: líneas 29, 47.
- `app/electron/init.js`: línea 59 (`catch (e) {}` en migración de config).
- `service/watchdog/notification-test.js`: línea 22.
- `tools/validate-re4.js`: línea 121.

**Problema:** Los errores se tragan sin log ni feedback, lo que dificulta depuración y resiliencia.

**Recomendación:**  
Sustituir por al menos `console.error(e)` o el logger existente (`debug.log` / `@xan105/log`). En puntos críticos (por ejemplo conexión al watchdog), considerar reintentos o notificación al usuario.

### 2.2 Construcción de rutas con concatenación

**Ubicación:** `app/parser/steam.js` línea 34

```js
path.join(process.env['PROGRAMDATA'],"Steam")+"/*",
```

**Problema:** Concatenar `"/*"` al resultado de `path.join` es frágil (depende de que el último carácter sea el esperado).

**Recomendación:**  
Usar `path.join(process.env['PROGRAMDATA'], 'Steam', '*')` o mantener el path sin `*` y aplicar el patrón en la llamada a `fast-glob` (o equivalente).

### 2.3 Mezcla ESM / CommonJS en componentes

**Ubicación:** `app/components/userAvatar/index.js`, `app/components/register.js`

**Problema:** Estos archivos usan `import`/`export` (ESM) mientras el resto de la app usa `require`. En `userAvatar` puede haber mezcla de ambos en el mismo flujo.

**Recomendación:**  
Unificar criterio: o bien todo ESM en componentes cargados como `type="module"`, o bien convertir estos a CommonJS para consistencia con el resto del proyecto. Evitar mezclar ambos en el mismo componente.

### 2.4 Posible null/undefined en `steam.js`

**Ubicación:** `app/parser/steam.js` línea 607

```js
icon: html.querySelector('.apphub_AppIcon img').attributes.src.match(...)[0]...
```

**Problema:** Si `querySelector` devuelve `null` o no hay `img`/`attributes.src`, el código puede lanzar.

**Recomendación:**  
Comprobar cada paso (elemento, `attributes`, `src`, resultado de `match`) y usar optional chaining y valores por defecto antes de acceder a `[0]` o hacer `replace`.

### 2.5 Dependencia implícita de globales en locale

**Ubicación:** `app/locale/loader.js`

**Problema:** Se menciona uso de `appPath`/`path` que podrían depender de globales inyectadas desde el HTML en lugar de `require('path')` explícito.

**Recomendación:**  
Asegurar que `path` (y si aplica `appPath`) se obtengan de forma explícita y estable (require en el módulo o argumentos), para no depender del orden de carga de scripts en el HTML.

---

## 3. Dependencias (prioridad alta/media)

### 3.1 Node.js en el updater

**Ubicación:** `service/updater/package.json` — `"node": "~14.0.0"`

**Problema:** Node 14 está fuera de mantenimiento. El watchdog ya usa `^20.0.0`.

**Recomendación:**  
Alinear el updater a la misma línea (por ejemplo Node 20 LTS) y actualizar `engines` y el script `prepare_watchdog.ps1` si descarga Node para el updater.

### 3.2 Paquetes deprecados o con vulnerabilidades

**Problema:** En el árbol de dependencias pueden aparecer paquetes deprecados o con avisos (por ejemplo `glob`, `tar`, o dependencias transitivas de `request-zero`). Conviene revisar con `npm audit` y listas de deprecaciones.

**Recomendación:**  
- Ejecutar `npm audit` en `app/`, `service/watchdog/` y `service/updater/`.
- Actualizar o sustituir paquetes con vulnerabilidades o deprecados (por ejemplo, si se recomienda migrar de `request-zero` a `@xan105/request`, valorar el cambio).

### 3.3 jQuery 3.3.1

**Ubicación:** `app/ui/lib/jquery-3.3.1.min.js`

**Problema:** Versión antigua; hay versiones más recientes con correcciones de seguridad y mejoras.

**Recomendación:**  
Actualizar a una versión 3.x reciente (o la última 3.x compatible) y comprobar que no se rompa la UI (sobre todo uso de `.append`, `.text`, `.html`, eventos y datos en `data-*`).

---

## 4. Tests (prioridad media)

### 4.1 Ausencia de tests automatizados

**Problema:** No hay framework de tests (Jest, Mocha, etc.) ni script `test` en los `package.json`. Solo pruebas manuales en la UI (Toast, GNTP, etc.).

**Recomendación:**  
- Añadir Jest (o similar) en `app/` y/o `service/watchdog/`.
- Añadir tests unitarios para lógica crítica: parsers (`steam.js`, `userDir.js`), normalización de rutas, opciones en `settings.js`, y utilidades reutilizables.
- Incluir en `package.json`: `"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"` (o el comando que corresponda).

---

## 5. Documentación y consistencia (prioridad baja)

### 5.1 README y build

**Ubicación:** `README.md` sección "How to build"

**Problema:** Se menciona "Innosetup 5" y "Node.js 14.x", mientras que el build actual usa Inno Setup 6 y se está recomendando Node 20 para el watchdog/updater.

**Recomendación:**  
Actualizar el README: indicar Inno Setup 6, Node 20 (o la versión que se decida), y que la ruta de Inno en `buildme.cmd` sea la correcta (ya apunta a Inno 6).

### 5.2 JSDoc / tipos

**Problema:** Casi no hay JSDoc ni tipos; solo algunas referencias en `steam.js`. Dificulta mantenimiento y refactors.

**Recomendación:**  
Añadir JSDoc en funciones públicas y módulos clave (parsers, settings, init). Opcional: introducir TypeScript en módulos nuevos o críticos.

---

## 6. Build y scripts (prioridad baja)

### 6.1 Ruta fija de Inno Setup

**Ubicación:** `buildme.cmd` (raíz)

**Problema:** Si la ruta a `iscc.exe` está fija (por ejemplo `C:\Program Files (x86)\Inno Setup 6\iscc.exe`), el build falla en máquinas con otra instalación.

**Recomendación:**  
Documentar el requisito de Inno Setup 6 y, si es posible, buscar `iscc.exe` en PATH o en rutas estándar, o usar una variable de entorno (por ejemplo `INNO_PATH`) para que el usuario pueda ajustarla.

### 6.2 Restos de NW.js

**Ubicación:** Carpetas o referencias bajo `setup/{{app}}/nw`, README en esa ruta.

**Problema:** La aplicación ya usa Electron; las referencias a NW.js pueden confundir a quien mantenga el build.

**Recomendación:**  
Limpiar o documentar que son legacy y no se usan en el flujo actual de Electron.

---

## 7. Priorización sugerida para implementar

1. **Inmediato (seguridad):**  
   - Corregir XSS del nombre del juego (texto plano en `steam.js` + uso seguro en `app.js`).  
   - Revisar y, si es posible, endurecer CSP (evitar `unsafe-inline` donde se pueda).

2. **Corto plazo:**  
   - Migrar Electron a `contextIsolation: true`, preload y sin `nodeIntegration` en el renderer; eliminar dependencia de `require` en `app.html`.  
   - Sustituir catch vacíos por logging en los puntos más críticos (app.js, watchdog, parsers).  
   - Unificar Node (updater) a Node 20 y ejecutar `npm audit` en todos los paquetes.

3. **Medio plazo:**  
   - Añadir tests automatizados para parsers y settings.  
   - Actualizar jQuery y dependencias con vulnerabilidades.  
   - Corregir `path.join` + `"/*"` en `steam.js` y comprobaciones null en el mismo archivo.

4. **Largo plazo:**  
   - Actualizar README y documentación de build.  
   - Añadir JSDoc y, si se desea, tipos (TypeScript) en módulos clave.  
   - Limpiar o documentar referencias a NW.js en setup.

---

*Documento generado a partir del análisis del repositorio Achievement-Watcher. Conviene revisar `npm audit` y las guías oficiales de Electron y Node.js para alinear versiones y prácticas.*
