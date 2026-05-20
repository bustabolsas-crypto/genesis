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
};

// ============ OBJETO WEAPONS ============

const Weapons = {
  slotTimers:   [0, 0, 0],   // ms restantes hasta próximo disparo por slot
  orbitalAngle: 0,
  orbitalPos:   null,
  ORBITAL_RADIUS: 90,
  orbitalDamageCooldowns: {}, // enemyId → lastDamageTimestamp
  activeEffects: [],           // efectos visuales en curso

  // Inicializa el escudo cuando se equipa Campo de Fuerza.
  // Escala ×2.5/era (mismo rate que daño de enemigos, no ×5 de armas).
  initShield(state) {
    const mult = Math.pow(2.5, state.eraIndex);
    state.shieldMaxHp = 20 * mult;
    if (!(state.shieldHp > 0)) state.shieldHp = state.shieldMaxHp;
    state.shieldBroken      = false;
    state.shieldBrokenAt    = 0;
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
      if (state.shieldBroken) {
        if ((Date.now() - state.shieldBrokenAt) >= 30000) {
          const mult = Math.pow(2.5, eraIdx);
          state.shieldMaxHp        = 20 * mult;
          state.shieldHp           = state.shieldMaxHp;
          state.shieldBroken       = false;
          state.shieldBrokenAt     = 0;
          state.shieldLastDamageAt = Date.now();
        }
      } else {
        // Inicializar si aún no tiene HP
        if (!(state.shieldMaxHp > 0)) this.initShield(state);
        // Regenerar 5%/seg pasados 3s sin recibir daño
        if (state.shieldHp < state.shieldMaxHp) {
          const timeSince = (Date.now() - (state.shieldLastDamageAt || 0)) / 1000;
          if (timeSince >= 3) {
            state.shieldHp = Math.min(
              state.shieldMaxHp,
              state.shieldHp + state.shieldMaxHp * 0.05 * dt
            );
          }
        }
      }
    }

    // ── Satélite Orbital ──
    if (slots.includes('satelite_orbital')) {
      this.orbitalAngle = (this.orbitalAngle + (Math.PI * 2 / 4) * dt) % (Math.PI * 2);
      const cx = Visuals.width  / 2;
      const cy = Visuals.height / 2;
      const ox = cx + Math.cos(this.orbitalAngle) * this.ORBITAL_RADIUS;
      const oy = cy + Math.sin(this.orbitalAngle) * this.ORBITAL_RADIUS;
      this.orbitalPos = { x: ox, y: oy };

      const orbDamage = 8 * Math.pow(5, eraIdx);
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

    // ── Armas regulares (1 timer por slot) ──
    for (let si = 0; si < 3; si++) {
      const wid = slots[si];
      if (!wid) continue;
      const def = WEAPON_DEFS[wid];
      if (!def || def.tipo === 'shield' || def.tipo === 'orbital') continue;

      this.slotTimers[si] = (this.slotTimers[si] || 0) - dt * 1000;
      if (this.slotTimers[si] <= 0) {
        this.slotTimers[si] = def.attackInterval;
        this._fireWeapon(def, enemies, eraIdx);
      }
    }

    // Limpiar efectos expirados
    this.activeEffects = this.activeEffects.filter(fx => {
      fx.age += dt;
      return fx.age < fx.maxAge;
    });
  },

  _fireWeapon(def, enemies, eraIdx) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) return;

    const eraScale = Math.pow(5, eraIdx);
    const damage   = def.damage * eraScale;
    const cx = Visuals.width  / 2;
    const cy = Visuals.height / 2;

    // Prioridad: boss → primer vivo
    let target = alive.find(e => e.isBoss) || alive[0];

    switch (def.tipo) {

      case 'single': {
        Combat.damageEnemy(target, damage, false, def.color);
        if (def.id === 'aguijon_neural' && def.stunDuration) {
          target.stunUntil = Date.now() + def.stunDuration * 1000;
        }
        this.activeEffects.push({
          type: 'beam',
          x1: cx, y1: cy, x2: target.x, y2: target.y,
          color: def.color,
          glow: def.beamGlow || 8, core: def.beamCore || 2,
          age: 0, maxAge: 0.3,
        });
        break;
      }

      case 'chain': {
        const maxChain = def.chainCount || 3;
        const points   = [{ x: cx, y: cy }];
        const hitSet   = new Set();
        let current    = target;

        for (let i = 0; i < maxChain && current; i++) {
          Combat.damageEnemy(current, damage, false, def.color);
          hitSet.add(current);
          points.push({ x: current.x, y: current.y });
          // Siguiente objetivo: vivo, no golpeado, más cercano
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
        const r = def.range || 60;
        for (const e of alive) {
          const dx = e.x - cx, dy = e.y - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= r) {
            Combat.damageEnemy(e, damage, false, def.color);
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
          type: 'aoe', x: cx, y: cy, radius: r, color: def.color,
          age: 0, maxAge: def.knockback ? 0.7 : 0.5,
        });
        break;
      }

      case 'dot': {
        Combat.damageEnemy(target, damage, false, def.color);
        if (!target.dots) target.dots = [];
        target.dots.push({
          dps: def.dotDps * eraScale,
          remaining: def.dotDuration || 5,
          color: def.color,
        });
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
        const r = def.range || 100;
        const persist = def.id === 'espora_toxica' ? 1.0 : 0.5;
        for (const e of alive) {
          const dx = e.x - cx, dy = e.y - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= r) {
            Combat.damageEnemy(e, damage, false, def.color);
            if (!e.dots) e.dots = [];
            e.dots.push({
              dps: def.dotDps * eraScale,
              remaining: def.dotDuration || 4,
              color: def.color,
            });
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
          ctx.fillStyle   = '#93c5fd';
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, 8 * p, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }

      ctx.restore();
    }
  },

  reset() {
    this.slotTimers             = [0, 0, 0];
    this.orbitalAngle           = 0;
    this.orbitalPos             = null;
    this.orbitalDamageCooldowns = {};
    this.activeEffects          = [];
  },
};
