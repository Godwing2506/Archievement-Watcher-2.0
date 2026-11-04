/**
 * Achievement Watcher 2.0 - UI Improvements Integration
 * Integra las mejoras visuales con el código existente
 * Fecha: 4 de Noviembre, 2026
 */

(function() {
  'use strict';

  console.log('🎨 Integrando mejoras UI con Achievement Watcher...');

  // ============================================
  // INTEGRACIÓN CON EL ESCANEO DE JUEGOS
  // ============================================

  // Hook al inicio del escaneo
  const originalParse = window.parse;
  if (originalParse) {
    window.parse = async function(...args) {
      // Actualizar watchdog a estado "scanning"
      updateWatchdogState('scanning');

      try {
        const result = await originalParse.apply(this, args);

        // Al completar el escaneo
        updateWatchdogState('connected');

        // Mostrar notificación de éxito
        const gameCount = result?.length || 0;
        if (gameCount > 0) {
          showToast(
            `Escaneo completado: ${gameCount} ${gameCount === 1 ? 'juego encontrado' : 'juegos encontrados'}`,
            'success'
          );
        }

        return result;
      } catch (error) {
        updateWatchdogState('disconnected');
        showToast('Error al escanear juegos', 'error');
        throw error;
      }
    };
  }

  // ============================================
  // MEJORAR TRANSICIONES ENTRE SECCIONES
  // ============================================

  // Interceptar navegación a logros
  const originalShowAchievements = window.goToAchievements;
  if (originalShowAchievements) {
    window.goToAchievements = function(...args) {
      const homeSection = document.getElementById('home');
      const achievementSection = document.getElementById('achievement');

      if (homeSection && achievementSection) {
        transitionToSection(homeSection, achievementSection);
      }

      return originalShowAchievements.apply(this, args);
    };
  }

  // Interceptar navegación a home
  const originalShowHome = window.goToHome;
  if (originalShowHome) {
    window.goToHome = function(...args) {
      const homeSection = document.getElementById('home');
      const achievementSection = document.getElementById('achievement');

      if (homeSection && achievementSection) {
        transitionToSection(achievementSection, homeSection);
      }

      return originalShowHome.apply(this, args);
    };
  }

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

  // ============================================
  // NOTIFICACIONES PARA EVENTOS IMPORTANTES
  // ============================================

  function setupEventNotifications() {
    // Notificar cuando se agrega un juego manualmente
    const addManualBtn = document.getElementById('btn-add-manual');
    if (addManualBtn) {
      const originalClick = addManualBtn.onclick;
      addManualBtn.addEventListener('click', function() {
        // Mostrar toast después de agregar
        setTimeout(() => {
          showToast('Juego agregado correctamente', 'success', 3000);
        }, 500);
      });
    }

    // Notificar cuando se guarda la configuración
    const saveSettingsBtn = document.getElementById('btn-settings-save');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', function() {
        setTimeout(() => {
          showToast('Configuración guardada', 'success', 2000);
        }, 300);
      });
    }

    // Notificar cuando se resetea el tracking
    const resetTrackBtn = document.getElementById('btn-reset-track');
    if (resetTrackBtn) {
      resetTrackBtn.addEventListener('click', function() {
        setTimeout(() => {
          showToast('Registro de logros reiniciado', 'info', 2500);
        }, 300);
      });
    }
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
  // ESTADO INICIAL DEL WATCHDOG
  // ============================================

  function initWatchdogState() {
    // Verificar el estado inicial del watchdog
    const indicator = document.getElementById('watchdog-indicator');
    if (indicator) {
      // Comienza desconectado
      updateWatchdogState('disconnected');

      // Si hay un watchdog service activo, actualizar estado
      if (window.watchdog && window.watchdog.isConnected) {
        updateWatchdogState('connected');
      }
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
      setupEventNotifications();
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
