'use strict';

/* ============================================
   game.js — núcleo del juego.
   - Estado serializable.
   - Game loop (un solo requestAnimationFrame).
   - Compra de generadores y desbloqueo de eras.
   - Multiplicador de prestige (CU) inyectado vía Prestige.multiplier().
   - Auto-save cada 10s, cálculo offline al cargar.
   ============================================ */

// Cap del cálculo offline: 4 horas en segundos.
const OFFLINE_CAP_SECONDS = 14400;

// Devuelve un estado fresco. Usado al arrancar y como base al fusionar
// con un save antiguo (para que campos nuevos tengan default).
function createInitialState() {
  return {
    // -------- Run actual (se resetean en Big Bang) --------
    energy: 0,
    baseClick: 1,            // suma de los flat-adds de mejoras de click
    clickMultiplier: 1,      // producto de los multipliers de mejoras de click
    powerClickMult: 1,       // reservado para futuro upgrade "Power Click"
    eps: 0,
    eraIndex: 0,
    generators: {},          // { quark: 5, electron: 2, ... }
    upgrades: {},            // { resonancia: true, espin: true, ... }
    runEnergyEarned: 0,      // E total ganada en este run (base del cálculo de CU)
    runStartTime: Date.now(),
    activeBuffs: {},         // { id: { endsAtMs, mult, name } }
    buffCooldowns: {},       // { id: cooldownEndsAtMs }

    // -------- Combate --------
    hp:                    100,
    maxHp:                 100,
    coins:                 0,
    debilitatedUntil:      0,   // timestamp: EPS -10% hasta esta hora
    debilitationCooldown:  0,   // timestamp: 2ª muerte antes de esto = penalización

    // -------- Persistente (atraviesa Big Bangs) --------
    cu: 0,                   // Constantes Universales acumuladas
    bigBangs: 0,
    totalEnergyEarned: 0,    // E total ganada en toda la historia del save
    timePlayedSeconds: 0,
    highestEra: 0,

    // -------- Armas --------
    weaponInventory:   ['pulso_cuantico'],   // IDs que posee el jugador
    weaponSlots:       ['pulso_cuantico', null, null],  // 3 slots equipados
    fragments:         {},                  // { weapon_id: count }
    weaponLevels:      {},                  // { weapon_id: level 0-20 }
    weaponEvolutions:  {},                  // { weapon_id: stage 0-5 }
    gems:              0,                   // 💎 gemas (drop de jefes)
    evoPoints:         0,                   // 🌀 puntos de evolución
    // Shield (Campo de Fuerza)
    shieldHp:          0,
    shieldMaxHp:       0,
    shieldBroken:      false,
    shieldBrokenAt:    0,
    shieldLastDamageAt: 0,
    // Segunda capa (E4+)
    shieldHp2:         0,
    shieldMaxHp2:      0,
    shieldBroken2:     false,
    shieldBrokenAt2:   0,

    // -------- Settings & tutorial --------
    soundEnabled: false,
    tutorialSeen: {
      intro: false, generator: false, era2: false,
      firstEnemy: false, firstBoss: false, firstDebilitation: false,
    },

    // -------- Save management --------
    lastSaved: 0,
    totalClicks: 0,
  };
}

const Game = {
  state: createInitialState(),
  lastFrame: 0,
  autoSaveTimer: null,
  AUTO_SAVE_MS: 10000,
  // pauseUntil: timestamp en ms hasta el cual NO se ejecuta tick().
  // Lo usamos al desbloquear una era o al hacer Big Bang para dar un
  // respiro dramático. Visuals sigue corriendo durante la pausa.
  pauseUntil: 0,

  // Pendiente al cargar: si hubo tiempo offline, guardamos el cálculo
  // acá hasta que el usuario lo "recoja" desde el modal.
  pendingOffline: null,

  init() {
    // Cargar guardado (si existe) y fusionarlo con los defaults.
    const loaded = Save.load();
    if (loaded) {
      this.state = Object.assign(createInitialState(), loaded);
      // Fusionar tutorialSeen y generators con sus defaults para que campos
      // nuevos no queden undefined si el save viene de una versión vieja.
      this.state.tutorialSeen = Object.assign(
        { intro: false, generator: false, era2: false,
          firstEnemy: false, firstBoss: false, firstDebilitation: false },
        loaded.tutorialSeen || {}
      );
    }
    // Normalizar generators (en fase 1 era array).
    if (!this.state.generators
        || typeof this.state.generators !== 'object'
        || Array.isArray(this.state.generators)) {
      this.state.generators = {};
    }
    // Normalizar upgrades.
    if (!this.state.upgrades || typeof this.state.upgrades !== 'object'
        || Array.isArray(this.state.upgrades)) {
      this.state.upgrades = {};
    }
    // Migración: clickPower (versiones anteriores) → baseClick.
    if (loaded && typeof loaded.clickPower === 'number'
        && (typeof loaded.baseClick !== 'number')) {
      this.state.baseClick = loaded.clickPower;
    }
    // Asegurar valores numéricos válidos para baseClick / clickMultiplier.
    if (typeof this.state.baseClick !== 'number' || !isFinite(this.state.baseClick)) {
      this.state.baseClick = 1;
    }
    if (typeof this.state.clickMultiplier !== 'number' || !isFinite(this.state.clickMultiplier) || this.state.clickMultiplier <= 0) {
      this.state.clickMultiplier = 1;
    }
    delete this.state.clickPower;
    // Migración silenciosa: si venimos de fase 3 sin tracking de runEnergy,
    // aproximamos con la energía actual para que un Big Bang no dé "0 CU"
    // si ya estaban cerca del Universo.
    if (loaded && this.state.totalEnergyEarned === 0 && this.state.energy > 0) {
      this.state.totalEnergyEarned = this.state.energy;
      this.state.runEnergyEarned   = this.state.energy;
    }
    // Si el jugador ya jugó antes, asumimos que el tutorial es innecesario.
    if (loaded && (this.state.eraIndex > 0 || this.state.totalClicks > 5)) {
      this.state.tutorialSeen = { intro: true, generator: true, era2: true };
    }
    // runStartTime puede haberse perdido en saves viejos.
    if (!this.state.runStartTime) this.state.runStartTime = Date.now();

    // Migración del sistema de armas (Fase C.1)
    if (!Array.isArray(this.state.weaponInventory) || !this.state.weaponInventory.length) {
      this.state.weaponInventory = ['pulso_cuantico'];
    }
    if (!Array.isArray(this.state.weaponSlots) || this.state.weaponSlots.length !== 3) {
      this.state.weaponSlots = ['pulso_cuantico', null, null];
    }
    // Si el slot 1 tenía 'pulso_cosmico' (placeholder), reemplazarlo
    this.state.weaponSlots = this.state.weaponSlots.map(id =>
      id === 'pulso_cosmico' ? 'pulso_cuantico' : id
    );
    // Normalizar fragmentos
    if (!this.state.fragments || typeof this.state.fragments !== 'object'
        || Array.isArray(this.state.fragments)) {
      this.state.fragments = {};
    }
    // Normalizar weaponLevels
    if (!this.state.weaponLevels || typeof this.state.weaponLevels !== 'object'
        || Array.isArray(this.state.weaponLevels)) {
      this.state.weaponLevels = {};
    }
    // Normalizar weaponEvolutions
    if (!this.state.weaponEvolutions || typeof this.state.weaponEvolutions !== 'object'
        || Array.isArray(this.state.weaponEvolutions)) {
      this.state.weaponEvolutions = {};
    }
    if (typeof this.state.gems !== 'number') this.state.gems = 0;
    if (typeof this.state.evoPoints !== 'number') this.state.evoPoints = 0;
    // Normalizar: eliminar del inventario IDs que ya no existen
    this.state.weaponInventory = this.state.weaponInventory.filter(
      id => id === 'pulso_cuantico' || id in WEAPON_DEFS
    );
    if (!this.state.weaponInventory.length) this.state.weaponInventory = ['pulso_cuantico'];
    // Asegurar que las armas equipadas estén en el inventario
    for (let si = 0; si < 3; si++) {
      const id = this.state.weaponSlots[si];
      if (id && !this.state.weaponInventory.includes(id)) {
        this.state.weaponSlots[si] = null;
      }
    }
    // Inicializar / recalcular escudo si Campo de Fuerza está equipado.
    // Siempre recalculamos shieldMaxHp desde la fórmula actual para que saves
    // viejos (con una fórmula anterior) no queden con un valor fijo incorrecto.
    if (this.state.weaponSlots.includes('campo_fuerza')) {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', this.state);
      const shieldMax = shEff.shieldMaxHp;
      this.state.shieldMaxHp = shieldMax;
      if (!(this.state.shieldHp > 0)) {
        this.state.shieldHp = shieldMax;
      } else {
        this.state.shieldHp = Math.min(this.state.shieldHp, shieldMax);
      }
      if (typeof this.state.shieldBroken !== 'boolean')    this.state.shieldBroken = false;
      if (typeof this.state.shieldBrokenAt !== 'number')   this.state.shieldBrokenAt = 0;
      if (typeof this.state.shieldLastDamageAt !== 'number') this.state.shieldLastDamageAt = Date.now();
    }

    // Asegurar campos de combate si viene de un save viejo
    if (typeof this.state.hp !== 'number' || !isFinite(this.state.hp)) {
      this.state.maxHp = 100 + this.state.eraIndex * 50;
      this.state.hp    = this.state.maxHp;
    }
    if (typeof this.state.maxHp !== 'number' || !isFinite(this.state.maxHp)) {
      this.state.maxHp = 100 + this.state.eraIndex * 50;
    }
    if (typeof this.state.coins !== 'number') this.state.coins = 0;
    if (typeof this.state.debilitatedUntil !== 'number') this.state.debilitatedUntil = 0;
    if (typeof this.state.debilitationCooldown !== 'number') this.state.debilitationCooldown = 0;

    // Inicializar UI/visuales/tutorial.
    Modal.init();
    UI.init();
    Visuals.init();
    Tutorial.init();
    Combat.init();

    // Restaurar la era visual al cargar, sin disparar la animación.
    Visuals.setEra(this.state.eraIndex, false);

    // ----- Cálculo offline -----
    // Math.max(0, ...) tolera saltos de reloj hacia atrás.
    if (loaded && this.state.lastSaved) {
      const elapsedSec = Math.max(0, Math.min(
        OFFLINE_CAP_SECONDS,
        (Date.now() - this.state.lastSaved) / 1000
      ));
      // 50% de eficiencia offline: penalización por no estar jugando activamente.
      const eps = this.calculateEps();
      const offlineEnergy = eps * elapsedSec * 0.5;
      // Modal sólo si estuvo > 1 minuto fuera y hay algo que recoger.
      if (elapsedSec >= 60 && offlineEnergy > 0) {
        this.pendingOffline = { energy: offlineEnergy, seconds: elapsedSec, efficiency: 50 };
      }
    }

    // Auto-save silencioso.
    this.autoSaveTimer = setInterval(() => {
      this.state.lastSaved = Date.now();
      Save.save(this.state);
    }, this.AUTO_SAVE_MS);

    // Mostrar modal offline si corresponde (lo dispara el primer frame).
    if (this.pendingOffline) {
      UI.showOfflineModal(this.pendingOffline);
    }

    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop.bind(this));

    // Comodidad de modo dev en consola (gated por Balance.isDev() así
    // un build subido a producción no contamina la consola del usuario).
    if (Balance.isDev()) {
      console.log(
        '%cGénesis listo.',
        'color:#00ffe1;font-weight:600',
        '\nDev:  Game.devSetEra(0..11)       → saltar a una era',
        '\n      Game.devGiveCU(n)           → otorgar CU para probar prestige',
        '\n      Game.devGiveAllWeapons()    → las 26 armas al inventario',
        '\n      Game.devGiveFragments(id,n) → fragmentos de un arma',
        '\n      Game.devForceDropNext(id)   → fuerza drop en próximo kill',
        '\n      Game.devSetDropLuck(true)   → todos los enemigos dropean',
        '\n      Game.devSetWeaponLevel(id,n) → nivel upgrade de un arma',
        '\n      Game.devGiveCoins(n)         → otorgar monedas',
        '\n      Game.devMaxAllWeapons()      → todas las armas del inv a nivel 20',
        '\n      Game.devGiveGems(n)          → otorgar gemas 💎',
        '\n      Game.devGivePoints(n)        → otorgar puntos de evolución 🌀',
        '\n      Game.devSetEvolution(id,n)   → evolución E0-E5 de un arma',
        '\n      Game.devMaxEvolveAll()       → todas las armas del inv a L20/E5',
        '\n      Game.devTestEvolution("id") → arma a L20/E5 y equipa en slot 1',
        '\n      Game.devGiveWeapon("id")    → una arma específica',
        '\n      Game.devEquip("id", 1|2|3)  → equipar en slot',
        '\n      Game.devListWeapons()       → listar IDs de armas',
        '\nÍndices:', STAGES.map((s, i) => i + ':' + s.name).join('  ')
      );
      // Tabla con tiempos proyectados de cada transición (compara con el pacing
      // objetivo definido en balance.js). Útil cuando se toca la fórmula de
      // generadores. Tarda ~1s en correr la simulación completa.
      Balance.printTable();
      console.log(
        '%cDrops de fragmentos',  'color:#fbbf24;font-weight:600',
        '\n  Regular: 20%  ·  1-3 frags',
        '\n  Élite:   60%  ·  5-15 frags',
        '\n  Jefe:   100%  ·  50-150 frags  +  10% arma completa',
      );
    }
  },

  // Saltar manualmente a una era (modo dev). Llamar desde la consola:
  //   Game.devSetEra(11)
  devSetEra(n) {
    if (typeof n !== 'number' || n < 0 || n >= STAGES.length) {
      console.warn('devSetEra: índice fuera de rango (0..' + (STAGES.length - 1) + ')');
      return;
    }
    this.state.eraIndex = n;
    this.state.maxHp = 100 + n * 50;
    this.state.hp    = this.state.maxHp;
    if (this.state.energy < STAGES[n].unlockAt) {
      this.state.energy = STAGES[n].unlockAt;
    }
    if (n > this.state.highestEra) this.state.highestEra = n;
    Combat.reset();
    Combat.bossSpawnCooldownUntil = performance.now() + 2000;
    Visuals.setEra(n, true);
    UI.showEraNotification(STAGES[n].name);
    UI.lastEraRendered = -1;
    this.pauseUntil = performance.now() + 500;
  },

  // Otorga CU instantáneas (modo dev) para probar el multiplicador.
  devGiveCU(n) {
    this.state.cu = (this.state.cu || 0) + (n || 0);
    console.log('CU ahora:', this.state.cu, 'multiplicador:', Prestige.multiplier());
  },

  // Dev: lista todas las armas disponibles.
  devListWeapons() {
    console.table(
      Object.values(WEAPON_DEFS).map(d => ({
        id: d.id, nombre: d.nombre, tier: d.tier, tipo: d.tipo,
        damage: d.damage, interval: d.attackInterval + 'ms',
      }))
    );
  },

  // Dev: agrega un arma al inventario.
  devGiveWeapon(id) {
    if (!WEAPON_DEFS[id]) {
      console.warn('ID no existe. Usa Game.devListWeapons() para ver los IDs válidos.');
      return;
    }
    if (!this.state.weaponInventory.includes(id)) {
      this.state.weaponInventory.push(id);
      console.log('[Dev] Arma añadida al inventario:', id);
    } else {
      console.log('[Dev] Ya tenías:', id);
    }
  },

  // Dev: agrega las 26 armas al inventario.
  devGiveAllWeapons() {
    for (const id of Object.keys(WEAPON_DEFS)) {
      if (!this.state.weaponInventory.includes(id)) {
        this.state.weaponInventory.push(id);
      }
    }
    console.log('[Dev] Inventario con las 26 armas:', this.state.weaponInventory);
  },

  // Dev: agrega fragmentos de un arma.
  devGiveFragments(weaponId, count) {
    if (!WEAPON_DEFS[weaponId]) {
      console.warn('ID inválido. Usa Game.devListWeapons() para ver los IDs válidos.');
      return;
    }
    if (!this.state.fragments) this.state.fragments = {};
    this.state.fragments[weaponId] = (this.state.fragments[weaponId] || 0) + (count || 1);
    console.log('[Dev] Fragmentos de', weaponId, ':', this.state.fragments[weaponId]);
  },

  // Dev: fuerza que el próximo enemigo dropee el arma indicada.
  // full=true → arma completa; full=false → fragmentos.
  devForceDropNext(weaponId, full = false) {
    if (!WEAPON_DEFS[weaponId]) { console.warn('ID inválido'); return; }
    Combat._forcedNextDrop = { weaponId, full };
    console.log('[Dev] Próximo drop forzado:', weaponId, full ? '(arma completa)' : '(fragmentos)');
  },

  // Dev: activa/desactiva que todos los enemigos dropeen 100%.
  devSetDropLuck(on) {
    Combat._dropLuck = !!on;
    console.log('[Dev] Drop luck:', Combat._dropLuck ? 'ON' : 'OFF');
  },

  // Dev: establece el nivel de upgrade de un arma (0-20).
  devSetWeaponLevel(weaponId, level) {
    if (!WEAPON_DEFS[weaponId]) { console.warn('ID inválido'); return; }
    if (!this.state.weaponLevels) this.state.weaponLevels = {};
    const clamped = Math.max(0, Math.min(20, level || 0));
    this.state.weaponLevels[weaponId] = clamped;
    if (weaponId === 'campo_fuerza') {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', this.state);
      this.state.shieldMaxHp = shEff.shieldMaxHp;
    }
    console.log('[Dev] Nivel de', weaponId, 'ahora:', clamped);
  },

  // Dev: otorga monedas.
  devGiveCoins(amount) {
    this.state.coins = (this.state.coins || 0) + (amount || 0);
    console.log('[Dev] Monedas ahora:', this.state.coins);
  },

  // Dev: pone todas las armas del inventario a nivel 20.
  devMaxAllWeapons() {
    if (!this.state.weaponLevels) this.state.weaponLevels = {};
    for (const id of this.state.weaponInventory) {
      this.state.weaponLevels[id] = 20;
    }
    if (this.state.weaponSlots && this.state.weaponSlots.includes('campo_fuerza')) {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', this.state);
      this.state.shieldMaxHp = shEff.shieldMaxHp;
    }
    console.log('[Dev] Todas las armas del inventario a nivel 20.');
  },

  // Dev: otorga gemas.
  devGiveGems(amount) {
    this.state.gems = (this.state.gems || 0) + (amount || 0);
    console.log('[Dev] Gemas ahora:', this.state.gems);
  },

  // Dev: otorga puntos de evolución.
  devGivePoints(amount) {
    this.state.evoPoints = (this.state.evoPoints || 0) + (amount || 0);
    console.log('[Dev] Puntos de evolución ahora:', this.state.evoPoints);
  },

  // Dev: establece la etapa de evolución de un arma (0-5).
  devSetEvolution(weaponId, stage) {
    if (!WEAPON_DEFS[weaponId]) { console.warn('ID inválido'); return; }
    if (!this.state.weaponEvolutions) this.state.weaponEvolutions = {};
    const clamped = Math.max(0, Math.min(5, stage || 0));
    this.state.weaponEvolutions[weaponId] = clamped;
    if (weaponId === 'campo_fuerza') {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', this.state);
      this.state.shieldMaxHp = shEff.shieldMaxHp;
    }
    console.log('[Dev] Evolución de', weaponId, 'ahora: E' + clamped);
  },

  // Dev: todas las armas del inventario a nivel 20 y etapa E5.
  devMaxEvolveAll() {
    if (!this.state.weaponLevels) this.state.weaponLevels = {};
    if (!this.state.weaponEvolutions) this.state.weaponEvolutions = {};
    for (const id of this.state.weaponInventory) {
      this.state.weaponLevels[id] = 20;
      this.state.weaponEvolutions[id] = 5;
    }
    if (this.state.weaponSlots && this.state.weaponSlots.includes('campo_fuerza')) {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', this.state);
      this.state.shieldMaxHp = shEff.shieldMaxHp;
    }
    console.log('[Dev] Todas las armas del inventario a L20 / E5.');
  },

  // Dev: pone el arma en L20/E5 y la equipa en slot 1 para testing rápido.
  devTestEvolution(weaponId) {
    if (!WEAPON_DEFS[weaponId]) {
      console.warn('[Dev] ID inválido:', weaponId, '— usa Game.devListWeapons()');
      return;
    }
    if (!this.state.weaponInventory) this.state.weaponInventory = [];
    if (!this.state.weaponLevels) this.state.weaponLevels = {};
    if (!this.state.weaponEvolutions) this.state.weaponEvolutions = {};
    if (!Array.isArray(this.state.weaponSlots) || this.state.weaponSlots.length !== 3) {
      this.state.weaponSlots = [null, null, null];
    }
    if (!this.state.weaponInventory.includes(weaponId)) {
      this.state.weaponInventory.push(weaponId);
    }
    // Limpiar el arma de cualquier slot previo
    for (let si = 0; si < 3; si++) {
      if (this.state.weaponSlots[si] === weaponId) this.state.weaponSlots[si] = null;
    }
    this.state.weaponLevels[weaponId]     = 20;
    this.state.weaponEvolutions[weaponId] = 5;
    this.state.weaponSlots[0]             = weaponId;
    if (weaponId === 'campo_fuerza') {
      Weapons.initShield(this.state);
    }
    Weapons.slotTimers[0] = 0;
    console.log('[Dev] devTestEvolution:', weaponId, '→ L20 / E5 equipado en slot 1');
  },

  // Dev: equipa un arma en un slot (1, 2 ó 3).
  devEquip(id, slot) {
    if (!WEAPON_DEFS[id]) { console.warn('ID inválido'); return; }
    if (slot < 1 || slot > 3) { console.warn('slot debe ser 1, 2 ó 3'); return; }
    if (!this.state.weaponInventory.includes(id)) {
      this.state.weaponInventory.push(id);
    }
    // Si ya estaba en otro slot, limpiar
    for (let si = 0; si < 3; si++) {
      if (this.state.weaponSlots[si] === id) this.state.weaponSlots[si] = null;
    }
    this.state.weaponSlots[slot - 1] = id;
    if (id === 'campo_fuerza') {
      Weapons.initShield(this.state);
    }
    console.log('[Dev] Equipado', id, 'en slot', slot, '→ slots:', this.state.weaponSlots);
  },

  // Centraliza la suma de energía: actualiza energía actual + estadísticas.
  addEnergy(amount) {
    if (amount <= 0) return;
    this.state.energy += amount;
    this.state.runEnergyEarned   += amount;
    this.state.totalEnergyEarned += amount;
  },

  // Valor que suma cada click.
  // - eraBase: escala ×5 por era (Era0=1, Era1=5, Era2=25, ...).
  // - baseClick-1: bonus flat de upgrades (baseClick arranca en 1).
  // - clickMultiplier: bonus multiplicativo de upgrades.
  // - powerClickMult: reservado para futuro upgrade "Power Click".
  // - buff: multiplicador de power-ups activos.
  computeClickValue() {
    const eraBase = Math.pow(2.5, this.state.eraIndex);
    const base = (eraBase + (this.state.baseClick - 1)) * this.state.clickMultiplier;
    return base * (this.state.powerClickMult || 1) * this.getBuffMultiplier();
  },

  // Multiplicador combinado de todos los buffs activos no expirados.
  getBuffMultiplier() {
    const now = Date.now();
    let mult = 1;
    const buffs = this.state.activeBuffs;
    if (buffs) {
      for (const id in buffs) {
        if (buffs[id].endsAtMs > now) mult *= buffs[id].mult;
      }
    }
    return mult;
  },

  // Click manual. Primero verifica si impacta a un enemigo; si sí, aplica
  // daño de combate y no suma energía. Si no, comportamiento normal.
  click(x, y, clientX, clientY) {
    this.state.totalClicks++;
    if (Combat.handleClick(x, y, this.state)) return;

    const gain = this.computeClickValue();
    this.addEnergy(gain);
    Visuals.spawnClickParticle(x, y, gain);
    if (clientX !== undefined) UI.spawnFloatingText(clientX, clientY, gain);
    this.checkEraUnlock();
  },

  // Compra una mejora de click (compra única). Aplica el efecto
  // según kind: 'mult' multiplica clickMultiplier, 'flat' suma a baseClick.
  buyUpgrade(id) {
    const up = findUpgrade(id);
    if (!up) return false;
    if (this.state.upgrades[id]) return false;            // ya comprada
    if (this.state.energy < up.cost) return false;
    this.state.energy -= up.cost;
    this.state.upgrades[id] = true;
    if (up.kind === 'mult') this.state.clickMultiplier *= up.value;
    else if (up.kind === 'flat') this.state.baseClick += up.value;
    return true;
  },

  // Intenta comprar una unidad de un generador.
  buyGenerator(id) {
    const gen = findGenerator(id);
    if (!gen) return false;
    const owned = this.state.generators[id] || 0;
    const cost = generatorCost(gen, owned);
    if (this.state.energy < cost) return false;
    this.state.energy -= cost;
    this.state.generators[id] = owned + 1;
    return true;
  },

  // Definiciones de power-ups disponibles (arquitectura extensible).
  POWER_UP_DEFS: {
    energyX2: {
      name: 'Energía ×2',
      mult: 2,
      durationMs: 5 * 60 * 1000,    // 5 minutos activo
      cooldownMs: 30 * 60 * 1000,   // 30 minutos de cooldown desde activación
    },
  },

  // Activa un power-up si no está en cooldown. Devuelve true si tuvo éxito.
  activatePowerUp(id) {
    const def = this.POWER_UP_DEFS[id];
    if (!def) return false;
    const now = Date.now();
    if (!this.state.buffCooldowns) this.state.buffCooldowns = {};
    if (!this.state.activeBuffs)   this.state.activeBuffs = {};
    const cooldownEnds = this.state.buffCooldowns[id] || 0;
    if (now < cooldownEnds) return false;
    this.state.activeBuffs[id] = { endsAtMs: now + def.durationMs, mult: def.mult, name: def.name };
    this.state.buffCooldowns[id] = now + def.cooldownMs;
    return true;
  },

  // Recoger lo generado offline (lo dispara el botón del modal).
  collectOffline(amount) {
    this.addEnergy(amount);
    this.pendingOffline = null;
  },

  // Bucle principal. dt limitado para tolerar pausas largas (cambio de pestaña).
  loop(now) {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    // El tiempo total jugado se acumula siempre (incluso en pausa o Big Bang).
    this.state.timePlayedSeconds += dt;

    // Tick de juego salvo durante la pausa post-desbloqueo o Big Bang.
    if (now >= this.pauseUntil) {
      this.tick(dt);
    }
    // Visuals SIEMPRE avanza, así la transición/morph se ve durante la pausa.
    Visuals.update(dt);
    Visuals.render();
    // Combat se dibuja encima de los visuales pero sólo fuera del Big Bang.
    if (Visuals.bigBangT < 0) Combat.render(Visuals.ctx, Visuals.width, Visuals.height);
    UI.update(this.state);

    requestAnimationFrame(this.loop.bind(this));
  },

  // Lógica de juego por unidad de tiempo.
  tick(dt) {
    const eps = this.calculateEps();
    this.state.eps = eps;
    if (eps > 0) this.addEnergy(eps * dt);
    this.checkEraUnlock();
    this.tickBuffs();
    Combat.tick(dt, this.state);
  },

  // Expira buffs cuyo tiempo terminó y notifica al usuario.
  tickBuffs() {
    const now = Date.now();
    const buffs = this.state.activeBuffs;
    if (!buffs) return;
    for (const id in buffs) {
      if (buffs[id].endsAtMs <= now) {
        const name = buffs[id].name;
        delete buffs[id];
        UI.showBuffExpiredNotification(name);
      }
    }
  },

  // Suma la producción de todos los generadores × prestige × buffs × debilitación.
  calculateEps() {
    let total = 0;
    for (const stage of STAGES) {
      for (const gen of stage.generators) {
        const owned = this.state.generators[gen.id] || 0;
        total += owned * gen.baseProduction;
      }
    }
    return total * Prestige.multiplier() * this.getBuffMultiplier() * this.getDebilitationMult();
  },

  // -10% EPS durante los 60s después de la primera debilitación
  getDebilitationMult() {
    const until = this.state.debilitatedUntil;
    if (until && Date.now() < until) return 0.9;
    return 1;
  },

  // Cuando la energía cruza el umbral de la siguiente era, aparece un jefe
  // que hay que derrotar para avanzar. Reemplaza el avance automático.
  checkEraUnlock() {
    const next = STAGES[this.state.eraIndex + 1];
    if (!next) return;
    if (this.state.energy < next.unlockAt) return;
    if (Combat.mode === 'boss') return;
    if (performance.now() < Combat.bossSpawnCooldownUntil) return;
    Combat.requestBossSpawn(this.state.eraIndex);
  },

  // Llamado por Combat cuando el jefe de la era muere
  advanceEra() {
    const idx = this.state.eraIndex + 1;
    if (idx >= STAGES.length) return;
    this.state.eraIndex = idx;
    this.state.evoPoints = (this.state.evoPoints || 0) + 100 * idx;
    this.state.maxHp = 100 + idx * 50;
    this.state.hp    = Math.min(this.state.hp, this.state.maxHp);
    if (this.state.weaponSlots && this.state.weaponSlots.includes('campo_fuerza')) {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', this.state);
      this.state.shieldMaxHp = shEff.shieldMaxHp;
      this.state.shieldHp    = Math.min(this.state.shieldHp || 0, shEff.shieldMaxHp);
    }
    if (idx > this.state.highestEra) this.state.highestEra = idx;
    Combat.mode     = 'peace';
    Combat.enemies  = [];
    Combat.peaceTimer = Combat.PEACE_INITIAL;
    Combat.bossSpawnCooldownUntil = performance.now() + 5000;
    this.onEraUnlocked(idx);
  },

  // Reacción a un desbloqueo de era: pausa breve + transición + notificación.
  onEraUnlocked(idx) {
    Visuals.setEra(idx, true);
    UI.showEraNotification(STAGES[idx].name);
    this.pauseUntil = performance.now() + 500;
  },
};

// ============================================
// Helper de tiempo: 90 → "1m 30s", 5400 → "1h 30m", etc.
// Lo usan tanto las stats como el modal de Big Bang.
// ============================================
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 60) return seconds + 's';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return m + 'm ' + s + 's';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return h + 'h ' + mm + 'm';
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return d + 'd ' + hh + 'h';
}

// El DOM debe estar listo antes de buscar elementos por id.
window.addEventListener('DOMContentLoaded', () => {
  Game.init();
  // El splash "GÉNESIS" se anima vía CSS (~2s) y queda en opacity:0.
  // Lo removemos del DOM para que no quede como overlay invisible.
  const boot = document.getElementById('boot-screen');
  if (boot) setTimeout(() => boot.remove(), 2200);
});
