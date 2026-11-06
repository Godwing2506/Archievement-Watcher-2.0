/**
 * Achievement Watcher 2.0 - UI Improvements Integration
 * Integra las mejoras visuales con el código existente
 * Fecha: 4 de Noviembre, 2026
 */

(function() {
  'use strict';
  let keyboardActivationBound = false;

  console.log('🎨 Integrando mejoras UI con Achievement Watcher...');

  // ============================================
  // MEJORAR TOOLTIPS EN ELEMENTOS CLAVE
  // ============================================

  function enhanceTooltips() {
    // Botón de refrescar logros
    const refreshBtn = document.getElementById('btn-refresh-ach');
    if (refreshBtn) {
      addTooltip(refreshBtn, 'Actualizar lista de logros');
    }

    // Botón de master unlock
    const masterBtn = document.getElementById('btn-master-unlock');
    if (masterBtn) {
      addTooltip(masterBtn, 'Desbloquear todos los logros (Modo Master)');
    }

    // Botón de reset track
    const resetBtn = document.getElementById('btn-reset-track');
    if (resetBtn) {
      addTooltip(resetBtn, 'Reiniciar seguimiento de logros');
    }

    // Botones de ordenamiento
    document.querySelectorAll('#sort-box .sort').forEach((btn, index) => {
      const tooltips = [
        'Ordenar alfabéticamente',
        'Ordenar por porcentaje de completado',
        'Ordenar por última vez jugado'
      ];
      addTooltip(btn, tooltips[index] || 'Ordenar');
    });

    // Botón de agregar juego manualmente
    const addBtn = document.getElementById('btn-add-manual');
    if (addBtn) {
      addTooltip(addBtn, 'Agregar juego por AppID de Steam');
    }
  }

  // ============================================
  // ANIMACIÓN DE ESTADÍSTICAS AL ACTUALIZAR
  // ============================================

  function animateStats() {
    // Observar cambios en las estadísticas del usuario
    const statsElements = document.querySelectorAll('#user-info .stats .data');

    statsElements.forEach(element => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            element.classList.add('updated');
            setTimeout(() => element.classList.remove('updated'), 600);
          }
        });
      });

      observer.observe(element, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });

    // También para los trofeos
    const trophyElements = document.querySelectorAll('.trophy span');
    trophyElements.forEach(element => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            element.classList.add('updated');
            setTimeout(() => element.classList.remove('updated'), 600);
          }
        });
      });

      observer.observe(element, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
  }

  // ============================================
  // MEJORAR FEEDBACK VISUAL EN ACCIONES
  // ============================================

  function enhanceButtons() {
    // Agregar clase ripple-container a botones importantes (opcional)
    const buttons = document.querySelectorAll('.btn, .game-box, #sort-box .sort');
    buttons.forEach(btn => {
      btn.classList.add('ripple-container');
    });

    // Inicializar ripple effects
    // initRippleEffects(); // Descomentar si quieres el efecto ripple
  }

  function enableKeyboardActivation() {
    const selector = [
      '#sort-box .sort',
      '#settingNav li',
      '#btn-add-manual',
      '#settings .btn:not(a)',
      '#btn-previous',
      '#btn-refresh-ach',
      '#btn-master-unlock',
      '#btn-reset-track',
      '#btn-scrollup'
    ].join(', ');

    document.querySelectorAll(selector).forEach((element) => {
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      if (!element.hasAttribute('aria-label')) {
        const label = element.getAttribute('title') ||
          element.getAttribute('data-tooltip') ||
          element.textContent.trim();
        if (label) element.setAttribute('aria-label', label);
      }
    });

    if (keyboardActivationBound) return;
    keyboardActivationBound = true;
    document.addEventListener('keydown', (event) => {
      const element = event.target.closest?.('[role="button"][tabindex="0"]');
      if (!element || element.tagName === 'BUTTON' || element.hasAttribute('disabled')) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      element.click();
    });
  }

  // ============================================
  // MEJORAR LA BARRA DE BÚSQUEDA
  // ============================================

  function enhanceSearchBar() {
    const searchInputs = document.querySelectorAll('#search-bar input, #search-bar-float input');

    searchInputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.parentElement.style.transform = 'scale(1.02)';
        this.parentElement.style.transition = 'transform 0.2s ease';
      });

      input.addEventListener('blur', function() {
        this.parentElement.style.transform = 'scale(1)';
      });
    });
  }

  // ============================================
  // ESTADO DEL WATCHDOG
  // ============================================

  function initWatchdogState() {
    // Verificar el estado inicial del watchdog
    const indicator = document.getElementById('watchdog-indicator');
    if (indicator) {
      indicator.setAttribute('aria-live', 'polite');
    }
  }

  // ============================================
  // INICIALIZACIÓN COMPLETA
  // ============================================

  function initIntegration() {
    console.log('⚙️ Aplicando integraciones UI...');

    // Esperar a que el DOM esté completamente cargado
    setTimeout(() => {
      enhanceTooltips();
      animateStats();
      enhanceButtons();
      enableKeyboardActivation();
      enhanceSearchBar();
      initWatchdogState();

      console.log('✓ Integraciones UI aplicadas correctamente');

      // Mostrar notificación de bienvenida (opcional)
      // showToast('Achievement Watcher 2.0 - UI Mejorado', 'info', 3000);
    }, 1000);
  }

  // Auto-inicializar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntegration);
  } else {
    initIntegration();
  }

  // ============================================
  // HELPERS PARA DEBUGGING
  // ============================================

  // Exponer funciones útiles en la consola
  window.uiDebug = {
    showSuccessToast: () => showToast('Mensaje de éxito', 'success'),
    showInfoToast: () => showToast('Mensaje informativo', 'info'),
    showWarningToast: () => showToast('Mensaje de advertencia', 'warning'),
    showErrorToast: () => showToast('Mensaje de error', 'error'),
    setWatchdogScanning: () => updateWatchdogState('scanning'),
    setWatchdogConnected: () => updateWatchdogState('connected'),
    setWatchdogDisconnected: () => updateWatchdogState('disconnected'),
    animateStat: (value) => updateStat('#user-info .stats .data', value || 999)
  };

  console.log('💡 Debug helpers disponibles en: window.uiDebug');
  console.log('   Ejemplo: uiDebug.showSuccessToast()');

})();
