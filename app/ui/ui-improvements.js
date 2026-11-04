/**
 * Achievement Watcher 2.0 - UI Improvements
 * JavaScript utilities para mejoras visuales
 * Fecha: 4 de Noviembre, 2026
 */

(function() {
  'use strict';

  // ============================================
  // 1. SISTEMA DE TOAST NOTIFICATIONS
  // ============================================

  /**
   * Muestra una notificación toast
   * @param {string} message - Mensaje a mostrar
   * @param {string} type - Tipo: 'success', 'info', 'warning', 'error'
   * @param {number} duration - Duración en ms (0 = permanente)
   */
  window.showToast = function(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;

    // Icono según el tipo
    const icons = {
      success: '✓',
      info: 'ℹ',
      warning: '⚠',
      error: '✕'
    };

    const icon = icons[type] || icons.info;

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${message}</div>
      <div class="toast-close">×</div>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remove si tiene duración
    let autoRemoveTimeout;
    if (duration > 0) {
      autoRemoveTimeout = setTimeout(() => {
        removeToast(toast);
      }, duration);
    }

    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
      if (autoRemoveTimeout) clearTimeout(autoRemoveTimeout);
      removeToast(toast);
    });

    return toast;
  };

  function removeToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }

  // ============================================
  // 2. ANIMACIÓN DE CONTEO DE NÚMEROS
  // ============================================

  /**
   * Anima un número desde start hasta end
   * @param {HTMLElement} element - Elemento que contiene el número
   * @param {number} start - Valor inicial
   * @param {number} end - Valor final
   * @param {number} duration - Duración en ms
   */
  window.animateValue = function(element, start, end, duration = 1000) {
    if (!element) return;

    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current);
    }, 16);

    // Añadir clase de animación
    element.classList.add('updated');
    setTimeout(() => element.classList.remove('updated'), 600);
  };

  /**
   * Actualiza estadísticas con animación
   * @param {string} selector - Selector CSS del elemento
   * @param {number} newValue - Nuevo valor
   */
  window.updateStat = function(selector, newValue) {
    const element = document.querySelector(selector);
    if (!element) return;

    const oldValue = parseInt(element.textContent) || 0;
    animateValue(element, oldValue, newValue);
  };

  // ============================================
  // 3. TRANSICIONES SUAVES ENTRE SECCIONES
  // ============================================

  /**
   * Transiciona suavemente entre dos secciones
   * @param {HTMLElement} fromSection - Sección actual
   * @param {HTMLElement} toSection - Sección destino
   */
  window.transitionToSection = function(fromSection, toSection) {
    if (!fromSection || !toSection) return;

    fromSection.classList.add('leaving');
    toSection.classList.add('entering');

    setTimeout(() => {
      fromSection.style.display = 'none';
      fromSection.classList.remove('leaving');
      toSection.style.display = 'block';

      setTimeout(() => {
        toSection.classList.remove('entering');
      }, 500);
    }, 400);
  };

  // ============================================
  // 4. SCROLL PROGRESS INDICATOR
  // ============================================

  /**
   * Inicializa el indicador de progreso de scroll
   * @param {HTMLElement} scrollContainer - Contenedor con scroll
   */
  window.initScrollProgress = function(scrollContainer) {
    if (!scrollContainer) return;

    scrollContainer.addEventListener('scroll', function() {
      const scrollPercent = (this.scrollTop / (this.scrollHeight - this.clientHeight)) * 100;
      this.style.setProperty('--scroll-progress', scrollPercent + '%');
    });
  };

  // ============================================
  // 5. WATCHDOG INDICATOR STATES
  // ============================================

  /**
   * Actualiza el estado del watchdog indicator
   * @param {string} state - Estado: 'disconnected', 'connected', 'scanning'
   */
  window.updateWatchdogState = function(state) {
    const indicator = document.getElementById('watchdog-indicator');
    if (!indicator) return;

    // Remover todas las clases de estado
    indicator.classList.remove('connected', 'scanning');

    // Agregar la clase apropiada
    if (state === 'connected') {
      indicator.classList.add('connected');
      indicator.setAttribute('title', 'Watchdog conectado');
    } else if (state === 'scanning') {
      indicator.classList.add('scanning', 'connected');
      indicator.setAttribute('title', 'Escaneando juegos...');
    } else {
      indicator.setAttribute('title', 'Watchdog desconectado');
    }
  };

  // ============================================
  // 6. RIPPLE EFFECT (OPCIONAL)
  // ============================================

  /**
   * Agrega efecto ripple a un elemento al hacer clic
   * @param {Event} event - Evento de clic
   * @param {HTMLElement} element - Elemento contenedor
   */
  window.createRipple = function(event, element) {
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');

    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    element.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  };

  /**
   * Inicializa ripple effect en elementos con clase .ripple-container
   */
  window.initRippleEffects = function() {
    document.querySelectorAll('.ripple-container').forEach(element => {
      element.addEventListener('click', function(e) {
        createRipple(e, this);
      });
    });
  };

  // ============================================
  // 7. LOADING STATES
  // ============================================

  /**
   * Muestra skeleton loading en la lista de juegos
   * @param {number} count - Número de placeholders a mostrar
   */
  window.showLoadingGames = function(count = 6) {
    const gameList = document.querySelector('#game-list > ul');
    if (!gameList) return;

    // Limpiar lista actual
    gameList.innerHTML = '';

    // Crear placeholders
    for (let i = 0; i < count; i++) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="game-box loading">
          <div class="header" style="height: 150px;"></div>
          <div class="content" style="padding: 10px;"></div>
        </div>
      `;
      gameList.appendChild(li);
    }
  };

  /**
   * Oculta loading y muestra contenido real
   */
  window.hideLoadingGames = function() {
    document.querySelectorAll('.game-box.loading').forEach(box => {
      box.classList.remove('loading');
    });
  };

  // ============================================
  // 8. TOOLTIPS HELPER
  // ============================================

  /**
   * Agrega tooltip a un elemento
   * @param {HTMLElement} element - Elemento
   * @param {string} text - Texto del tooltip
   */
  window.addTooltip = function(element, text) {
    if (!element) return;
    element.setAttribute('data-tooltip', text);
  };

  /**
   * Remueve tooltip de un elemento
   * @param {HTMLElement} element - Elemento
   */
  window.removeTooltip = function(element) {
    if (!element) return;
    element.removeAttribute('data-tooltip');
  };

  // ============================================
  // 9. FADE IN OBSERVER (PARA ELEMENTOS QUE ENTRAN)
  // ============================================

  /**
   * Inicializa observer para fade in de elementos
   */
  window.initFadeInObserver = function() {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1
    });

    // Observar elementos con clase .observe-fade-in
    document.querySelectorAll('.observe-fade-in').forEach(element => {
      observer.observe(element);
    });
  };

  // ============================================
  // 10. UTILITY FUNCTIONS
  // ============================================

  /**
   * Debounce function para optimizar eventos frecuentes
   */
  window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * Formatea números grandes (ej: 1000 -> 1K)
   */
  window.formatNumber = function(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  // ============================================
  // 11. INICIALIZACIÓN AUTOMÁTICA
  // ============================================

  /**
   * Inicializa todas las mejoras UI
   */
  window.initUIImprovements = function() {
    console.log('🎨 Inicializando mejoras UI...');

    // Inicializar scroll progress en game-list
    const gameList = document.getElementById('game-list');
    if (gameList) {
      initScrollProgress(gameList);
    }

    // Inicializar fade in observer
    initFadeInObserver();

    // Inicializar ripple effects (opcional)
    // initRippleEffects();

    console.log('✓ Mejoras UI inicializadas');
  };

  // Auto-inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIImprovements);
  } else {
    initUIImprovements();
  }

  // ============================================
  // 12. EJEMPLOS DE USO (COMENTADOS)
  // ============================================

  /*
  // Mostrar toast después de escanear
  showToast('Escaneo completado: 50 juegos encontrados', 'success');

  // Actualizar estadísticas con animación
  updateStat('#user-info .stats .data', 156);

  // Transicionar de home a achievements
  const home = document.getElementById('home');
  const achievements = document.getElementById('achievement');
  transitionToSection(home, achievements);

  // Actualizar estado del watchdog
  updateWatchdogState('scanning'); // o 'connected' o 'disconnected'

  // Mostrar loading mientras se escanean juegos
  showLoadingGames(8);
  // ... después de cargar
  hideLoadingGames();

  // Agregar tooltip a un botón
  const refreshBtn = document.getElementById('btn-refresh-ach');
  addTooltip(refreshBtn, 'Actualizar lista de logros');
  */

})();
