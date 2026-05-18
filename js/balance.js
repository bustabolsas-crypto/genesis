'use strict';

/* ============================================
   balance.js — simulador de pacing.

   Simula a un jugador "promedio" haciendo clicks ocasionales y
   comprando todo lo que puede, para estimar cuánto tarda en cruzar
   cada umbral de era. El resultado se imprime en consola en modo dev.

   La idea es validar el balanceo numérico sin tocar mecánica:
   si la tabla cae fuera del objetivo (±20%), ajustamos los números
   en stages.js y volvemos a correr.
   ============================================ */

const Balance = {
  // Sólo activo en local (localhost, 127.0.0.1 o file://).
  // En producción la tabla no se imprime, no llena la consola del usuario.
  isDev() {
    if (typeof window === 'undefined') return true; // node test
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '';
  },

  // Pacing objetivo en segundos por transición (era N → N+1).
  // Tomado del enunciado: V→P 30s, P→A 2-3min, ..., G→U 2-3h.
  // Usamos el punto medio del rango como objetivo.
  TARGETS: [
    30,      // 0→1   Vacío → Partícula
    150,     // 1→2   Partícula → Átomo (2.5 min)
    270,     // 2→3   Átomo → Molécula (4.5 min)
    420,     // 3→4   Molécula → Célula (7 min)
    660,     // 4→5   Célula → Organismo (11 min)
    990,     // 5→6   Organismo → Especie (16.5 min)
    1350,    // 6→7   Especie → Civilización (22.5 min)
    2100,    // 7→8   Civilización → Planeta (35 min)
    3150,    // 8→9   Planeta → Sistema Solar (52.5 min)
    6300,    // 9→10  Sistema Solar → Galaxia (1h45m)
    9000,    // 10→11 Galaxia → Universo (2h30m)
  ],

  // Modelo del jugador. Estos números los podemos toquetear si la
  // suposición no se siente realista.
  PLAYER: {
    clickRateEra0:  1.5,   // clicks/seg mientras no hay producción auto
    clickRateAfter: 0.2,   // clicks/seg ocasionales una vez que hay generadores
    clickPower:     1,
    multiplier:     1,     // sin CU para una primera partida limpia
  },

  // Simula desde el principio hasta la era 11 (Universo) y devuelve
  // un array donde el índice i contiene el tiempo (segundos) en que
  // se desbloqueó la era i.
  simulateAll() {
    const P = this.PLAYER;
    let energy = 0;
    let owned = {};
    let eraIdx = 0;
    let t = 0;
    const dt = 0.5;                  // paso de simulación (medio segundo)
    const maxT = 24 * 3600;          // cap de 24h por seguridad
    const eraTimes = [0];            // tiempo de desbloqueo de cada era

    while (eraIdx < STAGES.length - 1 && t < maxT) {
      // 1) Producción de generadores poseídos en eras desbloqueadas.
      let eps = 0;
      for (let i = 0; i <= eraIdx; i++) {
        for (const g of STAGES[i].generators) {
          eps += (owned[g.id] || 0) * g.baseProduction;
        }
      }
      eps *= P.multiplier;

      // 2) Tasa de clicks (alta en era 0, baja después — clicks "ocasionales").
      const clickRate = eraIdx === 0 ? P.clickRateEra0 : P.clickRateAfter;

      // 3) Avance del tiempo y de la energía.
      energy += (eps + clickRate * P.clickPower) * dt;
      t += dt;

      // 4) Subir de era si cruzamos el umbral. while por si saltamos varias.
      while (eraIdx + 1 < STAGES.length && energy >= STAGES[eraIdx + 1].unlockAt) {
        eraIdx++;
        eraTimes[eraIdx] = t;
      }

      // 5) Estrategia de compra: mientras se pueda, comprar el generador
      //    de mayor baseCost que sea costeable. Esto simula a un jugador
      //    "informado" que prioriza tier alto cuando puede.
      for (let attempts = 0; attempts < 200; attempts++) {
        let best = null, bestCost = 0;
        for (let i = eraIdx; i >= 0; i--) {
          for (let j = STAGES[i].generators.length - 1; j >= 0; j--) {
            const g = STAGES[i].generators[j];
            const cost = generatorCost(g, owned[g.id] || 0);
            if (energy >= cost && (!best || g.baseCost > best.baseCost)) {
              best = g;
              bestCost = cost;
            }
          }
        }
        if (!best) break;
        energy -= bestCost;
        owned[best.id] = (owned[best.id] || 0) + 1;
      }
    }

    // Para eras que no alcanzamos dentro del cap, marcamos -1.
    for (let i = eraTimes.length; i < STAGES.length; i++) eraTimes[i] = -1;
    return eraTimes;
  },

  // Imprime una tabla con tiempo proyectado, objetivo y delta porcentual
  // por cada transición. Sólo en dev.
  printTable() {
    if (!this.isDev()) return;
    if (typeof STAGES === 'undefined') return;

    const times = this.simulateAll();

    // Estilos de consola para hacerla más legible.
    const css = 'color:#a78bfa;font-weight:600';
    console.groupCollapsed('%cBalance (proyección de pacing)', css);
    console.log('Modelo:', this.PLAYER);
    console.log('Header: era → era    transición    objetivo    Δ');

    let okCount = 0;
    for (let i = 1; i < STAGES.length; i++) {
      const tr = times[i] === -1 ? Infinity : times[i] - times[i - 1];
      const target = this.TARGETS[i - 1];
      const delta = (tr - target) / target;
      const ok = isFinite(tr) && Math.abs(delta) <= 0.20;
      if (ok) okCount++;

      const arrow = (STAGES[i - 1].name + ' → ' + STAGES[i].name).padEnd(28);
      const tStr  = (isFinite(tr) ? formatTime(tr) : '>cap').padStart(8);
      const tgStr = formatTime(target).padStart(8);
      const dStr  = isFinite(tr)
        ? ((delta >= 0 ? '+' : '') + (delta * 100).toFixed(0) + '%').padStart(6)
        : '   --';
      const mark  = ok ? '✓' : '✗';

      // Color verde si OK, naranja si está lejos.
      console.log(
        '%c' + mark + ' %s %s   %s   %s',
        ok ? 'color:#9be39b' : 'color:#ffb37a',
        arrow, tStr, tgStr, dStr
      );
    }

    console.log('%c' + okCount + '/' + (STAGES.length - 1) + ' transiciones dentro de ±20%',
                okCount === STAGES.length - 1 ? 'color:#9be39b;font-weight:600' : 'color:#ffb37a;font-weight:600');
    console.groupEnd();
  },
};
