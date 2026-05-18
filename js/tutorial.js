'use strict';

/* ============================================
   tutorial.js — tooltips contextuales que aparecen UNA vez.

   Tres pasos:
     1. intro      — al primer load: "click para generar Energía"
     2. generator  — al tener 10 E: "comprá generadores"
     3. era2       — al desbloquear Átomo: "cada era trae más"

   El estado "ya visto" se guarda en state.tutorialSeen y se persiste
   con el resto del save. UI.update() llama a Tutorial.check() cada
   frame; si nada cumple condiciones, sale rápido.
   ============================================ */

const Tutorial = {
  showing: null,    // id del tooltip actualmente abierto
  tip: null,        // referencia al elemento del tooltip
  arrow: null,      // referencia a la flecha
  text: null,       // referencia al texto
  btn: null,        // referencia al botón "Entendido"

  init() {
    this.tip   = document.getElementById('tooltip');
    this.arrow = document.getElementById('tooltip-arrow');
    this.text  = document.getElementById('tooltip-text');
    this.btn   = document.getElementById('tooltip-btn');

    this.btn.addEventListener('click', () => this.dismiss());
    // Reposicionar al cambiar el tamaño de la ventana mientras está abierto.
    window.addEventListener('resize', () => this.reposition());
  },

  // Llamado cada frame por UI.update.
  check(state) {
    if (this.showing) {
      // Si el anchor cambió de posición, lo seguimos.
      this.reposition();
      return;
    }
    if (!state.tutorialSeen) return;

    if (!state.tutorialSeen.intro) {
      this.show('intro', 'Hacé click en la luz para generar Energía.', '#canvas', 'center');
      return;
    }
    if (!state.tutorialSeen.generator && state.energy >= 10 && state.eraIndex >= 1) {
      const card = document.querySelector('.generator');
      if (card) this.show('generator', 'Comprá generadores: producen Energía solos, sin clickear.', card, 'left');
      return;
    }
    if (!state.tutorialSeen.era2 && state.eraIndex >= 2) {
      this.show('era2', 'Cada era nueva trae generadores más poderosos. Llegá hasta el Universo.', '#era-name', 'bottom');
      return;
    }
  },

  // Muestra el tooltip apuntando a un elemento (selector o nodo).
  // side: 'top' | 'bottom' | 'left' | 'right' | 'center'
  show(id, message, anchor, side = 'bottom') {
    this.showing = id;
    this.currentAnchor = anchor;
    this.currentSide = side;
    this.text.textContent = message;
    this.tip.hidden = false;
    this.reposition();
  },

  reposition() {
    if (!this.showing) return;
    const anchor = typeof this.currentAnchor === 'string'
      ? document.querySelector(this.currentAnchor)
      : this.currentAnchor;
    if (!anchor) return;

    const r = anchor.getBoundingClientRect();
    // Aseguramos que el tooltip ya esté en el flujo para medirlo.
    const tipRect = this.tip.getBoundingClientRect();
    const tw = tipRect.width || 280;
    const th = tipRect.height || 100;
    const margin = 14;

    let x, y;
    let arrowSide = 'top'; // dónde sale la flecha del tooltip

    switch (this.currentSide) {
      case 'top':
        x = r.left + r.width / 2 - tw / 2;
        y = r.top - th - margin;
        arrowSide = 'bottom';
        break;
      case 'left':
        x = r.left - tw - margin;
        y = r.top + r.height / 2 - th / 2;
        arrowSide = 'right';
        break;
      case 'right':
        x = r.right + margin;
        y = r.top + r.height / 2 - th / 2;
        arrowSide = 'left';
        break;
      case 'center':
        x = r.left + r.width / 2 - tw / 2;
        y = r.top + r.height / 2 + 60;  // un poco debajo del centro
        arrowSide = 'top';
        break;
      case 'bottom':
      default:
        x = r.left + r.width / 2 - tw / 2;
        y = r.bottom + margin;
        arrowSide = 'top';
    }

    // Mantener el tooltip dentro del viewport.
    const pad = 8;
    x = Math.max(pad, Math.min(window.innerWidth  - tw - pad, x));
    y = Math.max(pad, Math.min(window.innerHeight - th - pad, y));

    this.tip.style.left = x + 'px';
    this.tip.style.top  = y + 'px';
    this.tip.dataset.arrow = arrowSide;
  },

  dismiss() {
    if (!this.showing) return;
    Game.state.tutorialSeen[this.showing] = true;
    this.showing = null;
    this.tip.hidden = true;
    Save.save(Game.state); // persistimos el "ya visto" enseguida
  },
};
