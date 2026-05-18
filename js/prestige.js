'use strict';

/* ============================================
   prestige.js — sistema "Big Bang".

   Premisa: cuando el jugador alcanza el Universo, puede colapsar
   el run actual a cambio de Constantes Universales (CU). Las CU
   son una moneda permanente que multiplica la producción para
   siempre, así que cada Big Bang acelera el siguiente run.

   Fórmulas:
     CU_ganadas  = floor(sqrt(runEnergyEarned / 1e10))
     multiplier  = 1 + cu_total × 0.05

   La función Prestige.multiplier() la consume Game.calculateEps().
   ============================================ */

const Prestige = {
  // ¿Está disponible el Big Bang? Sólo al llegar a la era Universo (índice 11).
  available() {
    return Game.state.eraIndex >= 11;
  },

  // Cuántas CU otorga el run actual según la E ganada en este run.
  computeCUGained() {
    const e = Game.state.runEnergyEarned;
    if (e < 1e10) return 0;
    // Math.sqrt mantiene la curva manejable a números muy grandes (1e54 → ~6e21 CU).
    return Math.floor(Math.sqrt(e / 1e10));
  },

  // Multiplicador permanente que se aplica a la producción de generadores.
  multiplier() {
    return 1 + (Game.state.cu || 0) * 0.05;
  },

  // Modal de confirmación previo al Big Bang. Resume el run y muestra
  // las CU que se ganan + el multiplicador resultante.
  showModal() {
    if (!this.available()) return;

    const state = Game.state;
    const cuGained = this.computeCUGained();
    const newCU = state.cu + cuGained;
    const newMult = 1 + newCU * 0.05;
    const runSeconds = (Date.now() - state.runStartTime) / 1000;

    const body = document.createElement('div');
    body.innerHTML = `
      <p class="modal-lead">
        Vas a colapsar el universo. Todo se reinicia, pero ganás
        <strong>Constantes Universales</strong> que multiplican la
        producción para siempre.
      </p>
      <dl class="kv">
        <dt>Energía del run</dt><dd>${formatNumber(state.runEnergyEarned)}</dd>
        <dt>Tiempo del run</dt><dd>${formatTime(runSeconds)}</dd>
        <dt>CU a ganar</dt><dd class="hilite">+${formatNumber(cuGained)}</dd>
        <dt>Total de CU</dt><dd>${formatNumber(newCU)}</dd>
        <dt>Multiplicador</dt><dd class="hilite">×${formatNumber(newMult)}</dd>
      </dl>
      ${cuGained === 0
        ? '<p class="warn">No vas a ganar ninguna CU con este run. Probablemente convenga seguir un poco.</p>'
        : ''}
    `;

    Modal.show({
      title: 'Big Bang',
      body,
      buttons: [
        { label: 'Cancelar' },
        { label: 'Colapsar el universo', primary: true, onClick: () => this.collapse() },
      ],
    });
  },

  // Aplica el reset y suma las CU ganadas. Dispara la animación visual.
  collapse() {
    const state = Game.state;
    const cuGained = this.computeCUGained();

    state.cu += cuGained;
    state.bigBangs++;

    // Reset selectivo del run actual.
    state.energy = 0;
    state.eraIndex = 0;
    state.generators = {};
    state.upgrades = {};         // las mejoras de click se re-compran cada run
    state.baseClick = 1;
    state.clickMultiplier = 1;
    state.runEnergyEarned = 0;
    state.runStartTime = Date.now();

    // Forzar a UI a reconstruir los paneles desde cero.
    UI.generatorEls = {};
    UI.upgradeEls = {};
    UI.lastEraRendered = -1;
    document.getElementById('generators-list').innerHTML = '';
    document.getElementById('upgrades-list').innerHTML = '';

    // Animación visual + notificación.
    Visuals.startBigBang();
    UI.showEraNotification(
      cuGained > 0 ? `+${formatNumber(cuGained)} CU` : 'Universo colapsado'
    );

    // Pausa el game loop mientras dura la animación de Big Bang.
    Game.pauseUntil = performance.now() + 4000;

    // Persistimos de inmediato para que un cierre accidental no pierda las CU.
    Save.save(state);
  },
};
