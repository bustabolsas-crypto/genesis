'use strict';

/* ============================================
   weapons.js — Sistema de armas (Fase C.1).
   14 armas en 5 tiers. 3 slots equipables en paralelo.
   Armas especiales: Campo de Fuerza (escudo), Satélite Orbital.
   ============================================ */

// ============ COLORES Y NOMBRES DE TIER ============

const TIER_COLORS = {
  cuantica:   '#22d3ee',
  molecular:  '#84cc16',
  organica:   '#f59e0b',
  planetaria: '#ea580c',
  galactica:  '#d946ef',
  universal:  '#fde68a',
};

const TIER_NAMES = {
  cuantica:   'Cuántica',
  molecular:  'Molecular',
  organica:   'Orgánica',
  planetaria: 'Planetaria',
  galactica:  'Galáctica',
  universal:  'Universal',
};

// ============ DEFINICIONES DE ARMAS ============
// damage: base para eraIdx=0 (×5 por era)

const WEAPON_DEFS = {
  pulso_cuantico: {
    id: 'pulso_cuantico', nombre: 'Pulso Cuántico',
    tier: 'cuantica', tipo: 'single',
    damage: 1, attackInterval: 2000,
    color: '#22d3ee',
    description: 'Disparo rápido de energía cuántica. Preciso y confiable.',
    beamGlow: 8, beamCore: 2,
  },
  onda_probabilidad: {
    id: 'onda_probabilidad', nombre: 'Onda de Probabilidad',
    tier: 'cuantica', tipo: 'chain',
    damage: 0.8, attackInterval: 2500, chainCount: 3,
    color: '#22d3ee',
    description: 'Rebota entre hasta 3 enemigos consecutivos.',
    beamGlow: 6, beamCore: 1,
  },
  microexplosion: {
    id: 'microexplosion', nombre: 'Microexplosión',
    tier: 'cuantica', tipo: 'aoe',
    damage: 1.2, attackInterval: 3000, range: 60,
    color: '#22d3ee',
    description: 'Pequeña explosión que daña a todos los enemigos cercanos.',
  },
  bit_cuantico: {
    id: 'bit_cuantico', nombre: 'Bit Cuántico',
    tier: 'cuantica', tipo: 'single',
    damage: 0.6, attackInterval: 1000,
    color: '#22d3ee',
    description: 'Disparo mínimo pero rapidísimo.',
    beamGlow: 4, beamCore: 1,
  },
  campo_fuerza: {
    id: 'campo_fuerza', nombre: 'Campo de Fuerza',
    tier: 'cuantica', tipo: 'shield',
    damage: 0, attackInterval: 0,
    color: '#3b82f6',
    description: 'Escudo de energía que absorbe el daño antes de que llegue a tu HP.',
  },
  sierra_molecular: {
    id: 'sierra_molecular', nombre: 'Sierra Molecular',
    tier: 'molecular', tipo: 'single',
    damage: 4, attackInterval: 3500,
    color: '#84cc16',
    description: 'Proyectil giratorio de alta masa molecular. Daño pesado.',
    beamGlow: 10, beamCore: 2,
  },
  lanza_enlaces: {
    id: 'lanza_enlaces', nombre: 'Lanza de Enlaces',
    tier: 'molecular', tipo: 'chain',
    damage: 2.5, attackInterval: 3000, chainCount: 4,
    color: '#84cc16',
    description: 'Encadena hasta 4 enemigos con segmentos de energía molecular.',
    beamGlow: 8, beamCore: 2,
  },
  acelerador_ionico: {
    id: 'acelerador_ionico', nombre: 'Acelerador Iónico',
    tier: 'molecular', tipo: 'dot',
    damage: 1, attackInterval: 4000,
    dotDps: 0.5, dotDuration: 5,
    color: '#84cc16',
    description: 'Rayo iónico que aplica quemadura de 0.5 daño/seg por 5 seg.',
    beamGlow: 8, beamCore: 2,
  },
  satelite_orbital: {
    id: 'satelite_orbital', nombre: 'Satélite Orbital',
    tier: 'molecular', tipo: 'orbital',
    damage: 8, attackInterval: 0,
    color: '#93c5fd',
    description: 'Orbe que rota alrededor de tu entidad dañando todo lo que toca.',
  },
  aguijon_neural: {
    id: 'aguijon_neural', nombre: 'Aguijón Neural',
    tier: 'organica', tipo: 'single',
    damage: 8, attackInterval: 4000, stunDuration: 0.5,
    color: '#f59e0b',
    description: 'Dardo neural que aturde al objetivo por 0.5 seg.',
    beamGlow: 10, beamCore: 2,
  },
  espora_toxica: {
    id: 'espora_toxica', nombre: 'Espora Tóxica',
    tier: 'organica', tipo: 'aoe_dot',
    damage: 5, attackInterval: 5000, range: 100,
    dotDps: 1, dotDuration: 4,
    color: '#a3e635',
    description: 'Nube tóxica: daño inicial en área + veneno de 1/seg por 4 seg.',
  },
  pulso_bioluminiscente: {
    id: 'pulso_bioluminiscente', nombre: 'Pulso Bioluminiscente',
    tier: 'organica', tipo: 'aoe',
    damage: 6, attackInterval: 4500, range: 120,
    color: '#f59e0b',
    description: 'Gran pulso de luz bioluminiscente que daña a todos en el área.',
  },
  tormenta_tectonica: {
    id: 'tormenta_tectonica', nombre: 'Tormenta Tectónica',
    tier: 'planetaria', tipo: 'aoe',
    damage: 20, attackInterval: 6000, range: 150, knockback: true,
    color: '#ea580c',
    description: 'Onda de choque masiva que empuja a los enemigos hacia atrás.',
  },
  canon_plasma_estelar: {
    id: 'canon_plasma_estelar', nombre: 'Cañón de Plasma Estelar',
    tier: 'galactica', tipo: 'single',
    damage: 80, attackInterval: 5000,
    color: '#d946ef',
    description: 'Rayo de plasma de galaxia. Casi mata cualquier enemigo de un disparo.',
    beamGlow: 18, beamCore: 5,
  },

  // ===== CUÁNTICA (adicionales) =====
  foton_solitario: {
    id: 'foton_solitario', nombre: 'Fotón Solitario',
    tier: 'cuantica', tipo: 'single',
    damage: 5, attackInterval: 5000,
    color: '#22d3ee',
    description: 'Cañón de fotón puro. Lento pero devastador.',
    beamGlow: 18, beamCore: 5,
  },
  onda_coherente: {
    id: 'onda_coherente', nombre: 'Onda Coherente',
    tier: 'cuantica', tipo: 'chain',
    damage: 0.5, attackInterval: 1500, chainCount: 5,
    color: '#22d3ee',
    description: 'Zigzaguea entre hasta 5 enemigos en rápida sucesión.',
    beamGlow: 4, beamCore: 1,
  },
  campo_singular: {
    id: 'campo_singular', nombre: 'Campo Singular',
    tier: 'cuantica', tipo: 'aoe',
    damage: 0.7, attackInterval: 2500, range: 50,
    color: '#22d3ee',
    description: 'Pulso radial pequeño que golpea enemigos muy cercanos.',
  },

  // ===== MOLECULAR (adicionales) =====
  vinculo_reactivo: {
    id: 'vinculo_reactivo', nombre: 'Vínculo Reactivo',
    tier: 'molecular', tipo: 'aoe_dot',
    damage: 1.5, attackInterval: 4000, range: 70,
    dotDps: 0.5, dotDuration: 4,
    color: '#b5cc2f',
    description: 'Nube verde-amarilla: daño inicial + veneno 0.5/seg × 4 seg.',
  },
  rafaga_ionica: {
    id: 'rafaga_ionica', nombre: 'Ráfaga Iónica',
    tier: 'molecular', tipo: 'multi',
    damage: 1, attackInterval: 2000, multiCount: 3,
    color: '#84cc16',
    description: '3 proyectiles simultáneos a 3 enemigos diferentes.',
    beamGlow: 7, beamCore: 2,
  },

  // ===== ORGÁNICA (adicionales) =====
  tendon_reflejo: {
    id: 'tendon_reflejo', nombre: 'Tendón Reflejo',
    tier: 'organica', tipo: 'single',
    damage: 6, attackInterval: 3500, stunDuration: 1.5,
    color: '#f59e0b',
    description: 'Dardo preciso con parálisis extendida de 1.5 seg.',
    beamGlow: 10, beamCore: 2,
  },
  espiral_genomica: {
    id: 'espiral_genomica', nombre: 'Espiral Genómica',
    tier: 'organica', tipo: 'multi_aoe',
    damage: 1.5, attackInterval: 4000, multiCount: 4, range: 40,
    color: '#f59e0b',
    description: '4 proyectiles que dispersan AoE al impactar.',
  },

  // ===== PLANETARIA (adicionales) =====
  geyser_magmatico: {
    id: 'geyser_magmatico', nombre: 'Géyser Magmático',
    tier: 'planetaria', tipo: 'aoe_dot',
    damage: 8, attackInterval: 6000, range: 100,
    dotDps: 2, dotDuration: 6,
    color: '#ea580c',
    description: 'Columna de fuego: daño masivo en área + quemadura 2/seg × 6 seg.',
  },
  cinturon_asteroides: {
    id: 'cinturon_asteroides', nombre: 'Cinturón de Asteroides',
    tier: 'planetaria', tipo: 'orbital_secondary',
    damage: 3, attackInterval: 0,
    color: '#92400e',
    description: '3 orbes orbitales rápidos que dañan al contacto.',
  },

  // ===== GALÁCTICA (adicional) =====
  onda_magnetar: {
    id: 'onda_magnetar', nombre: 'Onda Magnetar',
    tier: 'galactica', tipo: 'aoe',
    damage: 30, attackInterval: 7000, range: 200, stunArea: true, stunDuration: 1,
    color: '#d946ef',
    description: 'Pulso masivo magenta + aturde todo en el área por 1 seg.',
  },

  // ===== UNIVERSAL =====
  singularidad_devoradora: {
    id: 'singularidad_devoradora', nombre: 'Singularidad Devoradora',
    tier: 'universal', tipo: 'attract_aoe_dot',
    damage: 50, attackInterval: 10000, range: 250, attractRange: 300,
    dotDps: 10, dotDuration: 4,
    color: '#7c3aed',
    description: 'Agujero negro: atrae enemigos, daño masivo + DoT 10/seg × 4 seg.',
  },
  colapso_cosmico: {
    id: 'colapso_cosmico', nombre: 'Colapso Cósmico',
    tier: 'universal', tipo: 'single',
    damage: 1000, attackInterval: 12000,
    color: '#ffffff',
    description: 'Rayo nuclear absoluto. Destruye cualquier cosa de la era.',
    beamGlow: 30, beamCore: 8,
  },
};

// ============ SISTEMA DE FRAGMENTOS ============

const TIER_FRAGMENTS = {
  cuantica:   50,
  molecular:  100,
  organica:   200,
  planetaria: 500,
  galactica:  1500,
  universal:  5000,
};

const TIER_BASE_COST = {
  cuantica:   50,
  molecular:  200,
  organica:   1000,
  planetaria: 5000,
  galactica:  30000,
  universal:  200000,
};

const EVO_COSTS = {
  cuantica:   { gems: 5,   points: 200   },
  molecular:  { gems: 10,  points: 500   },
  organica:   { gems: 25,  points: 1500  },
  planetaria: { gems: 50,  points: 4000  },
  galactica:  { gems: 150, points: 12000 },
  universal:  { gems: 500, points: 40000 },
};

const EVO_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// Pesos por era: [tier, probabilidad%]
const DROP_TIER_WEIGHTS = [
  [['cuantica',95],['molecular',5]],                                                         // era 0
  [['cuantica',95],['molecular',5]],                                                         // era 1
  [['cuantica',60],['molecular',35],['organica',5]],                                         // era 2
  [['cuantica',60],['molecular',35],['organica',5]],                                         // era 3
  [['cuantica',30],['molecular',40],['organica',25],['planetaria',5]],                       // era 4
  [['cuantica',30],['molecular',40],['organica',25],['planetaria',5]],                       // era 5
  [['cuantica',15],['molecular',30],['organica',30],['planetaria',20],['galactica',5]],      // era 6
  [['cuantica',15],['molecular',30],['organica',30],['planetaria',20],['galactica',5]],      // era 7
  [['cuantica',5],['molecular',20],['organica',30],['planetaria',30],['galactica',15]],      // era 8
  [['cuantica',5],['molecular',20],['organica',30],['planetaria',30],['galactica',15]],      // era 9
  [['molecular',5],['organica',15],['planetaria',30],['galactica',40],['universal',10]],     // era 10
  [['molecular',5],['organica',15],['planetaria',30],['galactica',40],['universal',10]],     // era 11
];

function pickDropWeapon(eraIndex) {
  const weights = DROP_TIER_WEIGHTS[Math.min(eraIndex, DROP_TIER_WEIGHTS.length - 1)];
  const roll = Math.random() * 100;
  let cumulative = 0;
  let chosenTier = weights[weights.length - 1][0];
  for (const [tier, w] of weights) {
    cumulative += w;
    if (roll < cumulative) { chosenTier = tier; break; }
  }
  const inTier = Object.values(WEAPON_DEFS).filter(d => d.tier === chosenTier);
  if (!inTier.length) return null;
  return inTier[Math.floor(Math.random() * inTier.length)].id;
}

// ============ OBJETO WEAPONS ============

const Weapons = {
  slotTimers:   [0, 0, 0],   // ms restantes hasta próximo disparo por slot
  orbitalAngle: 0,
  orbitalPos:   null,
  ORBITAL_RADIUS: 90,
  orbitalDamageCooldowns: {}, // enemyId → lastDamageTimestamp
  asteroidAngle:   0,
  asteroidPositions: [],
  asteroidDamageCooldowns: {}, // 'enemyId_aN' → lastDamageTimestamp
  ASTEROID_RADIUS: 60,
  ASTEROID_SPEED:  Math.PI,   // 360° cada 2s (más rápido que orbital 4s)
  activeEffects: [],           // efectos visuales en curso

  // Calcula stats efectivos (nivel + era) para cualquier arma.
  getEffectiveStats(wid, state) {
    const def = WEAPON_DEFS[wid];
    if (!def) return {};
    const level    = (state.weaponLevels && state.weaponLevels[wid]) || 0;
    const eraIdx   = state.eraIndex;
    const eraScale = Math.pow(5, eraIdx);
    const ms       = Math.floor(level / 5);   // hitos cada 5 niveles
    const stage    = (state.weaponEvolutions && state.weaponEvolutions[wid]) || 0;
    const evoMult  = 1 + stage * 0.5;

    if (def.tipo === 'shield') {
      return {
        shieldMaxHp:    20 * Math.pow(2.5, eraIdx) * (1 + level * 0.20) * evoMult,
        regenRate:      0.05 * (1 + ms * 0.50),
        brokenCooldown: level >= 20 ? 20000 : 30000,
      };
    }
    if (def.tipo === 'orbital') {
      return {
        damage: 8 * eraScale * (1 + level * 0.15) * evoMult,
        speed:  (Math.PI * 2 / 4) * (1 + ms * 0.10),
        radius: 90 * (1 + ms * 0.05),
      };
    }
    if (def.tipo === 'orbital_secondary') {
      return {
        damage: 3 * eraScale * (1 + level * 0.15) * evoMult,
        speed:  Math.PI * (1 + ms * 0.10),
      };
    }

    // Armas regulares
    const s = {
      damage:         def.damage * (1 + level * 0.10) * eraScale * evoMult,
      attackInterval: def.attackInterval,
      range:          def.range,
      dotDps:         def.dotDps != null ? def.dotDps * eraScale * evoMult : undefined,
      chainCount:     def.chainCount,
      multiCount:     def.multiCount,
    };
    const tipo = def.tipo;
    if (tipo === 'single')                                   s.attackInterval = def.attackInterval * Math.pow(0.9, ms);
    if (tipo === 'chain')                                    s.chainCount     = (def.chainCount || 3) + ms;
    if (tipo === 'aoe' || tipo === 'aoe_dot' || tipo === 'attract_aoe_dot')
                                                             s.range          = (def.range || 60) * (1 + ms * 0.10);
    if (tipo === 'dot' || tipo === 'aoe_dot' || tipo === 'attract_aoe_dot')
                                                             s.dotDps         = (def.dotDps || 0) * (1 + ms * 0.20) * eraScale * evoMult;
    if (tipo === 'multi')                                    s.multiCount     = (def.multiCount || 3) + ms;
    if (tipo === 'multi_aoe') {
      s.multiCount = (def.multiCount || 4) + ms;
      s.range      = (def.range || 40) * (1 + ms * 0.10);
    }
    return s;
  },

  // Inicializa o recalcula el escudo para la era actual.
  // Escala ×2.5/era. Capea HP al nuevo máximo; nunca sube HP por encima del cap.
  initShield(state) {
    const eff = this.getEffectiveStats('campo_fuerza', state);
    state.shieldMaxHp = eff.shieldMaxHp;
    if (!(state.shieldHp > 0)) {
      state.shieldHp = state.shieldMaxHp;
    } else {
      state.shieldHp = Math.min(state.shieldHp, state.shieldMaxHp);
    }
    state.shieldBroken       = false;
    state.shieldBrokenAt     = 0;
    state.shieldLastDamageAt = Date.now();
  },

  // Intenta absorber `amount` con el escudo. Devuelve el daño residual al HP.
  absorbDamage(amount, state) {
    const shieldEquipped = Array.isArray(state.weaponSlots)
      && state.weaponSlots.includes('campo_fuerza');
    if (!shieldEquipped || state.shieldBroken || !(state.shieldMaxHp > 0)) return amount;

    state.shieldLastDamageAt = Date.now();

    if (state.shieldHp >= amount) {
      state.shieldHp -= amount;
      if (state.shieldHp <= 0) {
        state.shieldHp = 0;
        state.shieldBroken   = true;
        state.shieldBrokenAt = Date.now();
        // Flash al romperse
        Combat.screenFlashAlpha = 0.35;
        Combat.screenFlashR = 80; Combat.screenFlashG = 160; Combat.screenFlashB = 255;
      }
      return 0;
    } else {
      const residual = amount - state.shieldHp;
      state.shieldHp = 0;
      state.shieldBroken   = true;
      state.shieldBrokenAt = Date.now();
      Combat.screenFlashAlpha = 0.35;
      Combat.screenFlashR = 80; Combat.screenFlashG = 160; Combat.screenFlashB = 255;
      return residual;
    }
  },

  tick(dt, enemies, state) {
    const eraIdx = state.eraIndex;
    const slots  = state.weaponSlots || [null, null, null];

    // ── Campo de Fuerza ──
    const shieldEquipped = slots.includes('campo_fuerza');
    if (shieldEquipped) {
      const shEff = this.getEffectiveStats('campo_fuerza', state);
      if (state.shieldBroken) {
        if ((Date.now() - state.shieldBrokenAt) >= shEff.brokenCooldown) {
          state.shieldMaxHp        = shEff.shieldMaxHp;
          state.shieldHp           = state.shieldMaxHp;
          state.shieldBroken       = false;
          state.shieldBrokenAt     = 0;
          state.shieldLastDamageAt = Date.now();
        }
      } else {
        if (!(state.shieldMaxHp > 0)) this.initShield(state);
        if (state.shieldHp < state.shieldMaxHp) {
          const timeSince = (Date.now() - (state.shieldLastDamageAt || 0)) / 1000;
          if (timeSince >= 3) {
            state.shieldHp = Math.min(
              state.shieldMaxHp,
              state.shieldHp + state.shieldMaxHp * shEff.regenRate * dt
            );
          }
        }
      }
    }

    // ── Satélite Orbital ──
    if (slots.includes('satelite_orbital')) {
      const orbEff = this.getEffectiveStats('satelite_orbital', state);
      this.orbitalAngle = (this.orbitalAngle + orbEff.speed * dt) % (Math.PI * 2);
      const cx = Visuals.width  / 2;
      const cy = Visuals.height / 2;
      const orbR = orbEff.radius;
      const ox = cx + Math.cos(this.orbitalAngle) * orbR;
      const oy = cy + Math.sin(this.orbitalAngle) * orbR;
      this.orbitalPos = { x: ox, y: oy };

      const orbDamage = orbEff.damage;
      const now = Date.now();
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = ox - e.x, dy = oy - e.y;
        if (Math.sqrt(dx * dx + dy * dy) <= e.radius + 8) {
          const lastHit = this.orbitalDamageCooldowns[e._id] || 0;
          if (now - lastHit >= 1000) {
            Combat.damageEnemy(e, orbDamage, false, '#93c5fd');
            this.orbitalDamageCooldowns[e._id] = now;
            this.activeEffects.push({
              type: 'orbital_hit', x: e.x, y: e.y, age: 0, maxAge: 0.35,
            });
          }
        }
      }
    } else {
      this.orbitalPos = null;
    }

    // ── Cinturón de Asteroides ──
    if (slots.includes('cinturon_asteroides')) {
      const astEff = this.getEffectiveStats('cinturon_asteroides', state);
      this.asteroidAngle = (this.asteroidAngle + astEff.speed * dt) % (Math.PI * 2);
      const cxa = Visuals.width  / 2;
      const cya = Visuals.height / 2;
      const astDamage = astEff.damage;
      const nowA = Date.now();
      this.asteroidPositions = [];
      for (let i = 0; i < 3; i++) {
        const angle = this.asteroidAngle + (i * Math.PI * 2 / 3);
        const ax = cxa + Math.cos(angle) * this.ASTEROID_RADIUS;
        const ay = cya + Math.sin(angle) * this.ASTEROID_RADIUS;
        this.asteroidPositions.push({ x: ax, y: ay });
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = ax - e.x, dy = ay - e.y;
          if (Math.sqrt(dx * dx + dy * dy) <= e.radius + 6) {
            const coolKey = e._id + '_a' + i;
            const lastHit = this.asteroidDamageCooldowns[coolKey] || 0;
            if (nowA - lastHit >= 1000) {
              Combat.damageEnemy(e, astDamage, false, '#92400e');
              this.asteroidDamageCooldowns[coolKey] = nowA;
              this.activeEffects.push({
                type: 'orbital_hit', x: e.x, y: e.y, age: 0, maxAge: 0.3,
                color: '#b45309',
              });
            }
          }
        }
      }
    } else {
      this.asteroidPositions = [];
    }

    // ── Armas regulares (1 timer por slot) ──
    for (let si = 0; si < 3; si++) {
      const wid = slots[si];
      if (!wid) continue;
      const def = WEAPON_DEFS[wid];
      if (!def || def.tipo === 'shield' || def.tipo === 'orbital' || def.tipo === 'orbital_secondary') continue;

      const eff = this.getEffectiveStats(wid, state);
      this.slotTimers[si] = (this.slotTimers[si] || 0) - dt * 1000;
      if (this.slotTimers[si] <= 0) {
        this.slotTimers[si] = eff.attackInterval;
        this._fireWeapon(def, enemies, state);
      }
    }

    // Limpiar efectos expirados
    this.activeEffects = this.activeEffects.filter(fx => {
      fx.age += dt;
      return fx.age < fx.maxAge;
    });
  },

  _fireWeapon(def, enemies, state) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) return;

    const eff    = this.getEffectiveStats(def.id, state);
    const damage = eff.damage;
    const cx = Visuals.width  / 2;
    const cy = Visuals.height / 2;

    let target = alive.find(e => e.isBoss) || alive[0];

    switch (def.tipo) {

      case 'single': {
        Combat.damageEnemy(target, damage, false, def.color);
        if (def.stunDuration) {
          target.stunUntil = Date.now() + def.stunDuration * 1000;
        }
        const isNuclear = def.id === 'colapso_cosmico';
        this.activeEffects.push({
          type: isNuclear ? 'nuclear_flash' : 'beam',
          x1: cx, y1: cy, x2: target.x, y2: target.y,
          color: def.color,
          glow: def.beamGlow || 8, core: def.beamCore || 2,
          age: 0, maxAge: isNuclear ? 0.6 : 0.3,
        });
        break;
      }

      case 'chain': {
        const maxChain = eff.chainCount || 3;
        const points   = [{ x: cx, y: cy }];
        const hitSet   = new Set();
        let current    = target;

        for (let i = 0; i < maxChain && current; i++) {
          Combat.damageEnemy(current, damage, false, def.color);
          hitSet.add(current);
          points.push({ x: current.x, y: current.y });
          let next = null, minD = Infinity;
          for (const e of alive) {
            if (hitSet.has(e)) continue;
            const dx = e.x - current.x, dy = e.y - current.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minD) { minD = d; next = e; }
          }
          current = next;
        }

        this.activeEffects.push({
          type: 'chain', points, color: def.color,
          glow: def.beamGlow || 6, core: def.beamCore || 1,
          age: 0, maxAge: 0.4,
        });
        break;
      }

      case 'aoe': {
        const r = eff.range || 60;
        for (const e of alive) {
          const dx = e.x - cx, dy = e.y - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= r) {
            Combat.damageEnemy(e, damage, false, def.color);
            if (def.stunArea && def.stunDuration) {
              e.stunUntil = Date.now() + def.stunDuration * 1000;
            }
            if (def.knockback) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 0) {
                e.x = Math.max(e.radius, Math.min(Visuals.width  - e.radius, e.x + (dx / dist) * 80));
                e.y = Math.max(e.radius, Math.min(Visuals.height - e.radius, e.y + (dy / dist) * 80));
              }
            }
          }
        }
        this.activeEffects.push({
          type: def.stunArea ? 'magnetar_pulse' : 'aoe',
          x: cx, y: cy, radius: r, color: def.color,
          age: 0, maxAge: def.knockback ? 0.7 : 0.5,
        });
        break;
      }

      case 'multi': {
        const mCount = eff.multiCount || 3;
        const pool = [...alive];
        const targets = [];
        const bossI = pool.findIndex(e => e.isBoss);
        if (bossI >= 0) targets.push(pool.splice(bossI, 1)[0]);
        while (targets.length < mCount && pool.length) {
          const i = Math.floor(Math.random() * pool.length);
          targets.push(pool.splice(i, 1)[0]);
        }
        const beams = [];
        for (const t of targets) {
          Combat.damageEnemy(t, damage, false, def.color);
          beams.push({ x: t.x, y: t.y });
        }
        this.activeEffects.push({
          type: 'multi_beam', x1: cx, y1: cy, beams,
          color: def.color, glow: def.beamGlow || 7, core: def.beamCore || 2,
          age: 0, maxAge: 0.35,
        });
        break;
      }

      case 'multi_aoe': {
        const mCount = eff.multiCount || 4;
        const r = eff.range || 40;
        const pool = [...alive];
        const targets = [];
        const bossI = pool.findIndex(e => e.isBoss);
        if (bossI >= 0) targets.push(pool.splice(bossI, 1)[0]);
        while (targets.length < mCount && pool.length) {
          const i = Math.floor(Math.random() * pool.length);
          targets.push(pool.splice(i, 1)[0]);
        }
        for (const t of targets) {
          for (const e of alive) {
            const dx = e.x - t.x, dy = e.y - t.y;
            if (Math.sqrt(dx * dx + dy * dy) <= r) {
              Combat.damageEnemy(e, damage, false, def.color);
            }
          }
          this.activeEffects.push({
            type: 'beam', x1: cx, y1: cy, x2: t.x, y2: t.y,
            color: def.color, glow: 8, core: 2, age: 0, maxAge: 0.25,
          });
          this.activeEffects.push({
            type: 'aoe', x: t.x, y: t.y, radius: r, color: def.color,
            age: 0, maxAge: 0.5,
          });
        }
        break;
      }

      case 'attract_aoe_dot': {
        const r      = eff.range || 250;
        const attractR = def.attractRange || (r + 50);
        for (const e of alive) {
          const dx = cx - e.x, dy = cy - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= attractR && dist > 1) {
            const pull = Math.min(60, dist * 0.35);
            e.x += (dx / dist) * pull;
            e.y += (dy / dist) * pull;
          }
        }
        for (const e of alive) {
          const dx = e.x - cx, dy = e.y - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= r) {
            Combat.damageEnemy(e, damage, false, def.color);
            if (!e.dots) e.dots = [];
            e.dots.push({ dps: eff.dotDps, remaining: def.dotDuration || 4, color: def.color });
          }
        }
        this.activeEffects.push({
          type: 'black_hole', x: cx, y: cy, radius: r, color: def.color,
          age: 0, maxAge: 0.8,
        });
        break;
      }

      case 'dot': {
        Combat.damageEnemy(target, damage, false, def.color);
        if (!target.dots) target.dots = [];
        target.dots.push({ dps: eff.dotDps, remaining: def.dotDuration || 5, color: def.color });
        this.activeEffects.push({
          type: 'beam',
          x1: cx, y1: cy, x2: target.x, y2: target.y,
          color: def.color,
          glow: def.beamGlow || 8, core: def.beamCore || 2,
          age: 0, maxAge: 0.4,
        });
        break;
      }

      case 'aoe_dot': {
        const r = eff.range || 100;
        const persist = def.id === 'espora_toxica' ? 1.0 : 0.5;
        for (const e of alive) {
          const dx = e.x - cx, dy = e.y - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= r) {
            Combat.damageEnemy(e, damage, false, def.color);
            if (!e.dots) e.dots = [];
            e.dots.push({ dps: eff.dotDps, remaining: def.dotDuration || 4, color: def.color });
          }
        }
        this.activeEffects.push({
          type: 'cloud', x: cx, y: cy, radius: r, color: def.color,
          age: 0, maxAge: persist,
        });
        break;
      }
    }
  },

  render(ctx) {
    const state = Game.state;
    const slots = state.weaponSlots || [null, null, null];
    const cx = Visuals.width  / 2;
    const cy = Visuals.height / 2;

    // ── Escudo ──
    if (slots.includes('campo_fuerza') && !state.shieldBroken && state.shieldMaxHp > 0) {
      const ratio = Math.max(0, state.shieldHp / state.shieldMaxHp);
      let shieldCol;
      let ringAlpha = 0.5;
      if (ratio > 0.75)       { shieldCol = '#3b82f6'; }
      else if (ratio > 0.5)   { shieldCol = '#22d3ee'; }
      else if (ratio > 0.25)  { shieldCol = '#ffffff'; ringAlpha = 0.55; }
      else {
        // Parpadeo <25%
        shieldCol  = '#ffffff';
        ringAlpha  = 0.35 + 0.3 * Math.abs(Math.sin(Date.now() / 110));
      }

      ctx.save();
      ctx.globalAlpha = ringAlpha * 0.45;
      ctx.fillStyle   = shieldCol;
      ctx.beginPath();
      ctx.arc(cx, cy, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = shieldCol;
      ctx.lineWidth   = 3;
      ctx.shadowColor = shieldCol;
      ctx.shadowBlur  = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, 82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Cinturón de Asteroides ──
    for (const ap of this.asteroidPositions) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle   = '#92400e';
      ctx.shadowColor = '#b45309';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 5, 0, Math.PI * 2);
      ctx.fill();
      // núcleo claro
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = '#d97706';
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Satélite Orbital ──
    if (this.orbitalPos) {
      const { x: ox, y: oy } = this.orbitalPos;

      // Trail
      for (let i = 1; i <= 5; i++) {
        const ta = this.orbitalAngle - i * 0.16;
        const tx = cx + Math.cos(ta) * this.ORBITAL_RADIUS;
        const ty = cy + Math.sin(ta) * this.ORBITAL_RADIUS;
        ctx.save();
        ctx.globalAlpha = 0.18 * (1 - i / 6);
        ctx.fillStyle   = '#93c5fd';
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1, 6 - i), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Orbe principal
      ctx.save();
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, 9);
      grad.addColorStop(0,   '#ffffff');
      grad.addColorStop(0.4, '#93c5fd');
      grad.addColorStop(1,   'rgba(59,130,246,0)');
      ctx.globalAlpha = 0.95;
      ctx.fillStyle   = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Efectos de ataque activos ──
    for (const fx of this.activeEffects) {
      const p = fx.age / fx.maxAge;   // 0 → 1 mientras avanza
      const a = 1 - p;                // alpha decreciente

      ctx.save();

      switch (fx.type) {

        case 'beam': {
          // Glow layer
          ctx.globalAlpha = a * 0.28;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth   = fx.glow;
          ctx.lineCap     = 'round';
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1);
          ctx.lineTo(fx.x2, fx.y2);
          ctx.stroke();
          // Core
          ctx.globalAlpha = a * 0.95;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = fx.core;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1);
          ctx.lineTo(fx.x2, fx.y2);
          ctx.stroke();
          break;
        }

        case 'chain': {
          const { points, color, glow, core } = fx;
          // Glow
          ctx.globalAlpha = a * 0.35;
          ctx.strokeStyle = color;
          ctx.lineWidth   = glow;
          ctx.lineCap     = 'round';
          ctx.setLineDash([6, 5]);
          for (let i = 0; i < points.length - 1; i++) {
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[i + 1].x, points[i + 1].y);
            ctx.stroke();
          }
          // Core dashed
          ctx.setLineDash([4, 6]);
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = core;
          for (let i = 0; i < points.length - 1; i++) {
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[i + 1].x, points[i + 1].y);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          break;
        }

        case 'aoe': {
          const expandedR = fx.radius * (0.4 + p * 0.9);
          ctx.globalAlpha = a * 0.12;
          ctx.fillStyle   = fx.color;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, expandedR, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a * 0.6;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, expandedR, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'cloud': {
          // Nube que se expande y persiste
          const cloudR = fx.radius * (0.5 + p * 0.6);
          ctx.globalAlpha = a * 0.22;
          ctx.fillStyle   = fx.color;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, cloudR, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth   = 1.5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, cloudR, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'orbital_hit': {
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 1.5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, 14 * p, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = a * 0.4;
          ctx.fillStyle   = fx.color || '#93c5fd';
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, 8 * p, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'multi_beam': {
          ctx.lineCap = 'round';
          for (const b of (fx.beams || [])) {
            ctx.globalAlpha = a * 0.28;
            ctx.strokeStyle = fx.color;
            ctx.lineWidth   = fx.glow;
            ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.globalAlpha = a * 0.95;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = fx.core;
            ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
          break;
        }

        case 'magnetar_pulse': {
          // flash de relleno
          ctx.globalAlpha = a * 0.08;
          ctx.fillStyle   = fx.color;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
          ctx.fill();
          // 3 anillos concéntricos que se expanden
          for (let ring = 0; ring < 3; ring++) {
            const ringP = Math.min(1, p + ring * 0.25);
            const rr    = fx.radius * ringP;
            ctx.globalAlpha = (1 - ringP) * 0.8;
            ctx.strokeStyle = fx.color;
            ctx.lineWidth   = 2.5 - ring * 0.5;
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, rr, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }

        case 'black_hole': {
          const diskR = fx.radius * 0.45 * (0.7 + p * 0.5);
          // disco de acreción
          ctx.globalAlpha = a * 0.55;
          const grad = ctx.createRadialGradient(fx.x, fx.y, diskR * 0.2, fx.x, fx.y, diskR);
          grad.addColorStop(0,   'rgba(255,140,0,0.9)');
          grad.addColorStop(0.5, 'rgba(124,58,237,0.6)');
          grad.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, diskR, 0, Math.PI * 2);
          ctx.fill();
          // núcleo negro
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle   = '#000000';
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, diskR * 0.28, 0, Math.PI * 2);
          ctx.fill();
          // aura exterior
          ctx.globalAlpha = a * 0.12;
          ctx.fillStyle   = fx.color;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'nuclear_flash': {
          // rayo blanco gigante
          ctx.lineCap     = 'round';
          ctx.globalAlpha = a * 0.45;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth   = fx.glow;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1);
          ctx.lineTo(fx.x2, fx.y2);
          ctx.stroke();
          ctx.globalAlpha = a * 0.95;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = fx.core;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1);
          ctx.lineTo(fx.x2, fx.y2);
          ctx.stroke();
          // flash en impacto (primera mitad del efecto)
          if (p < 0.5) {
            const flashA = (0.5 - p) * 2;
            ctx.globalAlpha = flashA * 0.85;
            const flashGrad = ctx.createRadialGradient(fx.x2, fx.y2, 0, fx.x2, fx.y2, 55);
            flashGrad.addColorStop(0, '#ffffff');
            flashGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = flashGrad;
            ctx.beginPath();
            ctx.arc(fx.x2, fx.y2, 55, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
      }

      ctx.restore();
    }
  },

  reset() {
    this.slotTimers              = [0, 0, 0];
    this.orbitalAngle            = 0;
    this.orbitalPos              = null;
    this.orbitalDamageCooldowns  = {};
    this.asteroidAngle           = 0;
    this.asteroidPositions       = [];
    this.asteroidDamageCooldowns = {};
    this.activeEffects           = [];
  },
};
