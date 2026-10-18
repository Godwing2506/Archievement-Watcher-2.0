# Generar el instalador (Achievement Watcher)

## Requisitos previos

1. **Node.js 20.x** (x64) con npm instalado.
2. **Inno Setup 6** en `C:\Program Files (x86)\Inno Setup 6\`.  
   El ejecutable que usa el script es: `ISCC.exe`.  
   Si lo tienes en otra ruta, edita la última línea de `buildme.cmd`.
3. **Herramientas globales (opcional, para mkasar):**
   - `asar`: `npm install -g asar`
   - `json`: `npm install -g json`  
   Si no las tienes, `mkasar.cmd` fallará cuando intente empaquetar la app.
4. **Contenido del repo:**
   - `setup\resources\`: debe contener `icon.ico`, `wizard.bmp`, `left.bmp`, `warning.bmp` (para el instalador).
   - `setup\rcedit\rcedit-x64.exe`: para asignar icono y versión al .exe.
   - `setup\{{app}}\icon.ico`: para que rcedit aplique el icono a `AchievementWatcher.exe`.

## Pasos para generar el instalador

### 1. Instalar dependencias (solo la primera vez o tras cambiar de rama)

Desde la **raíz del proyecto**:

```cmd
npm install.cmd
```

Esto hace `npm ci` en `app`, `service\updater` y `service\watchdog`, y `native-rebuild` en app (Electron).

### 2. Ejecutar el build completo

Desde la **raíz del proyecto**:

```cmd
buildme.cmd
```

El script hace, en este orden:

| Paso | Descripción |
|------|-------------|
| **Building service** | `service\buildme.cmd`: `npm prune --production` en updater. Las dependencias runtime del watchdog se preparan en un directorio aislado para no modificar `service\watchdog\node_modules`. |
| **Building Setup** | `setup\rcedit\rcedit.cmd`: copia `electron.exe` → `setup\{{app}}\AchievementWatcher.exe` y aplica icono/versión con rcedit. |
| **prepare_watchdog.ps1** | Descarga Node v20.11.0, extrae `node.exe` en `setup\{{app}}\node\`, instala y valida las dependencias runtime del watchdog con ese Node en `setup\_watchdog_runtime\` y actualiza checksums en `watchdog.json`. El build se detiene si la instalación o la validación falla. |
| **mkasar.cmd** | Copia la app a una carpeta temporal, limpia para producción, empaqueta en `setup\{{app}}\resources\app.asar`. |
| **COMPILE SETUP** | Inno Setup compila `setup\AchievementWatcher.iss`. |

### 3. Resultado

- El instalador se genera en: **`setup\_dist_\Achievement.Watcher.Setup.exe`**  
- Si Inno Setup no está instalado o la ruta en `buildme.cmd` no es correcta, el último paso fallará con un error de “no se encuentra el programa” o similar.

## Si algo falla

- **“npm no reconocido”**  
  Asegúrate de tener Node 20 en el PATH y de haber ejecutado antes `npm install.cmd`.

- **“electron.exe no encontrado”**  
  En la raíz: `cd app && npm ci && npm run native-rebuild`.

- **“json no reconocido” / “asar no reconocido”**  
  Instala las herramientas globales:  
  `npm install -g asar json`

- **“iscc.exe no encontrado”**  
  Instala Inno Setup 6 o cambia la ruta en la última línea de `buildme.cmd` para que apunte a tu `ISCC.exe`.

- **prepare_watchdog.ps1 tarda mucho**  
  Es normal: descarga Node, descomprime e instala dependencias del watchdog. Déjalo terminar.

- **“npm ci failed” o “Watchdog runtime dependency check failed”**  
  La instalación de dependencias quedó incompleta. Revisa la conexión a npm y vuelve a ejecutar `buildme.cmd`; no distribuyas el instalador hasta que la validación termine correctamente.

- **Errores de Inno Setup**  
  Revisa que existan `setup\resources\*` y que `setup\{{app}}\*` se haya generado bien (rcedit, prepare_watchdog, mkasar).

## Resumen rápido

```cmd
npm install.cmd
buildme.cmd
```

El instalador quedará en **`setup\_dist_\Achievement.Watcher.Setup.exe`**.
