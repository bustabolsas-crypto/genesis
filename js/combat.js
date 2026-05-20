'use strict';

/* ============================================
   combat.js — sistema de combate completo.

   Máquina de estados: 'peace' → 'wave' → 'peace' → ... 'boss'
   - peace:  sin enemigos, timer de 30s antes de la ola.
   - wave:   3-5 enemigos (15% chance de incluir un élite); cuando todos mueren → peace.
   - boss:   un jefe bloquea el avance de era; invoca 2 minis cada 15s; al morir → advanceEra.

   Capas de muerte del jugador:
   1ª: HP → maxHp×0.5, EPS -10% por 60s, cooldown 5min.
   2ª (dentro de 5min): era--, energía×0.5, generadores×0.5 (floor), reset combat.

   Rendering: se dibuja SOBRE Visuals.render() en el mismo canvas.
   ============================================ */

const Combat = {
  // Estado de la ola
  mode: 'peace',       // 'peace' | 'wave' | 'boss'
  enemies: [],
  peaceTimer: 0,
  _nextEnemyId: 0,    // contador auto-incremental para IDs de enemigos

  // Números flotantes de daño
  floatingNums: [],    // [{ x, y, text, color, life, maxLife }]

  // Flash de pantalla al recibir daño
  screenFlashAlpha: 0,
  screenFlashR: 255, screenFlashG: 50, screenFlashB: 50,

  // Especial del jefe (ataque con windup interruptible)
  bossInterruptClicks: 0,
  bossSpecialTimer:    10,
  bossWindupActive:    false,
  bossWindupTimer:     0,

  // Invocación de minis del jefe
  bossSummonTimer:  15,   // segundos hasta la próxima invocación
  bossIsCharging:   false, // fase de telegrafiar (1s antes de invocar)
  bossChargeTimer:  0,

  // Previene re-spawn inmediato de boss tras avance de era
  bossSpawnCooldownUntil: 0,

  // Dev: forzar próximo drop / luck mode
  _forcedNextDrop: null,
  _dropLuck: false,

  PEACE_INITIAL: 30,
  ATTACK_RANGE:  55,
  BOSS_INTERRUPT_NEEDED: 5,

  init() {
    this.mode            = 'peace';
    this.enemies         = [];
    this.floatingNums    = [];
    this.peaceTimer      = this.PEACE_INITIAL;
    this.bossWindupActive    = false;
    this.bossSpecialTimer    = 10;
    this.bossInterruptClicks = 0;
    this.screenFlashAlpha    = 0;
    this.bossSpawnCooldownUntil = 0;
    this.bossSummonTimer  = 15;
    this.bossIsCharging   = false;
    this.bossChargeTimer  = 0;
    Weapons.reset();
  },

  tick(dt, state) {
    if (Modal.isOpen()) return;

    // Regenerar HP sólo en paz
    if (this.mode === 'peace' && state.hp < state.maxHp) {
      state.hp = Math.min(state.maxHp, state.hp + state.maxHp * 0.01 * dt);
    }

    this.updateWave(dt, state);
    this.updateEnemies(dt, state);

    // Invocación del jefe (tick siempre durante modo boss)
    if (this.mode === 'boss') {
      const boss = this.enemies.find(e => e.isBoss && e.alive);
      if (boss) this.tickBossSummon(boss, dt, state.eraIndex);
    }

    Weapons.tick(dt, this.enemies, state);
    this.updateFloatingNums(dt);

    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 3);
    }
  },

  updateWave(dt, state) {
    if (this.mode === 'peace') {
      this.peaceTimer -= dt;
      if (this.peaceTimer <= 0) this.startWave(state.eraIndex);
    } else if (this.mode === 'wave') {
      if (!this.enemies.some(e => e.alive)) {
        this.mode = 'peace';
        this.peaceTimer = 20 + Math.random() * 20;
      }
    }
  },

  // 15% de probabilidad de incluir un élite en la oleada
  startWave(eraIdx) {
    this.mode = 'wave';
    this.enemies = [];
    const count = 5 + Math.floor(Math.random() * 4);
    const W = Visuals.width, H = Visuals.height;
    const types = ['a', 'b', 'c'];
    const eliteSlot = Math.random() < 0.25 ? Math.floor(Math.random() * count) : -1;

    for (let i = 0; i < count; i++) {
      const type = i === eliteSlot ? 'elite' : types[i % 3];
      const e = spawnEnemy(eraIdx, type, W, H);
      e._id = this._nextEnemyId++;
      this.enemies.push(e);
    }
    Tutorial.triggerFirstEnemy();
  },

  requestBossSpawn(eraIdx) {
    this.bossSpawnCooldownUntil = performance.now() + 5000;
    const boss = spawnEnemy(eraIdx, 'boss', Visuals.width, Visuals.height);
    boss._id = this._nextEnemyId++;
    this.mode    = 'boss';
    this.enemies = [boss];
    this.bossSpecialTimer    = 10;
    this.bossInterruptClicks = 0;
    this.bossWindupActive    = false;
    this.bossSummonTimer     = 15;
    this.bossIsCharging      = false;
    this.bossChargeTimer     = 0;
    Tutorial.triggerFirstBoss();
    UI.showBossWarning(ENEMY_NAMES[Math.min(11, eraIdx)].boss);
  },

  updateEnemies(dt, state) {
    const cx = Visuals.width  / 2;
    const cy = Visuals.height / 2;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      // Procesar DoT (daño acumulado, floating number cada 0.5s para evitar spam)
      if (e.dots && e.dots.length > 0) {
        const surviving = [];
        for (const dot of e.dots) {
          dot.remaining -= dt;
          if (dot.remaining > 0) {
            const dotDmg    = dot.dps * dt;
            e.hp           -= dotDmg;
            e.hitFlash      = Math.max(e.hitFlash || 0, 0.06);
            dot._accum      = (dot._accum    || 0) + dotDmg;
            dot._showTimer  = (dot._showTimer || 0) - dt;
            if (dot._showTimer <= 0) {
              dot._showTimer = 0.5;
              if (dot._accum >= 0.5) {
                this.floatingNums.push({
                  x: e.x, y: e.y - e.radius - 8,
                  text: '-' + formatNumber(Math.ceil(dot._accum)),
                  color: dot.color || '#84cc16',
                  life: 0.8, maxLife: 0.8,
                });
                dot._accum = 0;
              }
            }
            if (e.hp > 0) {
              surviving.push(dot);
            } else {
              this.killEnemy(e);
              break;
            }
          }
        }
        e.dots = e.alive ? surviving : [];
        if (!e.alive) continue;
      }

      // Omitir movimiento/ataque si está aturdido
      if (e.stunUntil && Date.now() < e.stunUntil) continue;

      const dx = cx - e.x;
      const dy = cy - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.ATTACK_RANGE) {
        e.x += (dx / dist) * e.speed * dt;
        e.y += (dy / dist) * e.speed * dt;
      } else {
        e.attackTimer -= dt * 1000;
        if (e.attackTimer <= 0) {
          this.damagePlayer(e.damage, state);
          e.attackTimer = e.attackIntervalMs;
        }
        if (e.isBoss) this.tickBossSpecial(e, dt, state);
      }
    }
  },

  tickBossSpecial(boss, dt, state) {
    if (this.bossWindupActive) {
      this.bossWindupTimer -= dt;
      if (this.bossWindupTimer <= 0) {
        this.bossWindupActive = false;
        this.bossSpecialTimer = 10;
        this.damagePlayer(boss.damage * 3, state);
      }
    } else {
      this.bossSpecialTimer -= dt;
      if (this.bossSpecialTimer <= 0) {
        this.bossWindupActive    = true;
        this.bossWindupTimer     = 1;
        this.bossInterruptClicks = 0;
        UI.showBossWindup();
      }
    }
  },

  // Ciclo de invocación del jefe: 15s → 1s telegrafiar → 2 minis aparecen
  tickBossSummon(boss, dt, eraIdx) {
    if (this.bossIsCharging) {
      this.bossChargeTimer -= dt;
      boss.chargeFlash = Math.max(0, 1 - this.bossChargeTimer);   // 0→1 durante el segundo
      if (this.bossChargeTimer <= 0) {
        this.bossIsCharging  = false;
        boss.chargeFlash     = 0;
        this.bossSummonTimer = 15;
        for (let i = 0; i < 2; i++) {
          this.enemies.push(this._spawnMini(boss, eraIdx));
        }
      }
    } else {
      this.bossSummonTimer -= dt;
      if (this.bossSummonTimer <= 0) {
        this.bossIsCharging  = true;
        this.bossChargeTimer = 1;
      }
    }
  },

  _spawnMini(boss, eraIdx) {
    const base  = getEnemyDef(eraIdx, 'a');
    const angle = Math.random() * Math.PI * 2;
    const d     = boss.radius * 4;
    return {
      type:             'mini',
      name:             base.name,
      color:            base.color,
      shape:            base.shape,
      radius:           8,
      maxHp:            base.maxHp  * 0.5,
      hp:               base.maxHp  * 0.5,
      damage:           base.damage * 0.5,
      coins:            1,
      speed:            base.speed  * 1.2,
      attackIntervalMs: base.attackIntervalMs,
      x: Math.max(10, Math.min(Visuals.width  - 10, boss.x + Math.cos(angle) * d)),
      y: Math.max(10, Math.min(Visuals.height - 10, boss.y + Math.sin(angle) * d)),
      attackTimer:  base.attackIntervalMs,
      hitFlash:     0,
      chargeFlash:  0,
      alive:        true,
      isBoss:       false,
      isElite:      false,
      isMini:       true,
      _id:          this._nextEnemyId++,
    };
  },

  damageEnemy(enemy, amount, isPlayerClick, weaponColor = null) {
    if (!enemy || !enemy.alive) return;
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;

    this.floatingNums.push({
      x: enemy.x, y: enemy.y - enemy.radius - 8,
      text: '-' + formatNumber(Math.ceil(amount)),
      color: isPlayerClick ? '#ffdd44' : (weaponColor || '#00ffe1'),
      life: 0.8, maxLife: 0.8,
    });

    if (enemy.hp <= 0) this.killEnemy(enemy);
  },

  killEnemy(enemy) {
    enemy.alive = false;
    const state = Game.state;
    state.coins = (state.coins || 0) + enemy.coins;
    this.spawnCoinAnim(enemy.x, enemy.y);

    this.floatingNums.push({
      x: enemy.x, y: enemy.y,
      text: '+' + enemy.coins + '✦',
      color: '#ffd700',
      life: 1.2, maxLife: 1.2,
    });

    // Sistema de drops
    this._processDrop(enemy, state);

    if (enemy.isBoss) {
      this.bossWindupActive = false;
      this.bossIsCharging   = false;
      // Marcar todos los minis como muertos antes de que el loop los procese
      for (const m of this.enemies) {
        if (m.isMini) m.alive = false;
      }
      Game.advanceEra();
    }
  },

  _processDrop(enemy, state) {
    if (enemy.isMini) return;

    // Drop forzado (dev)
    if (this._forcedNextDrop) {
      const { weaponId, full } = this._forcedNextDrop;
      this._forcedNextDrop = null;
      if (full) {
        this._giveWeaponFull(weaponId, state, enemy);
      } else {
        this._giveFragments(weaponId, 3, state, enemy);
      }
      return;
    }

    let chance, minF, maxF;
    if (enemy.isBoss)        { chance = 1.0;  minF = 20; maxF = 50; }
    else if (enemy.isElite)  { chance = 0.30; minF = 5;  maxF = 15; }
    else                     { chance = 0.05; minF = 1;  maxF = 3;  }

    if (!this._dropLuck && Math.random() >= chance) return;

    const count = minF + Math.floor(Math.random() * (maxF - minF + 1));
    const wid   = pickDropWeapon(state.eraIndex);
    if (!wid) return;
    this._giveFragments(wid, count, state, enemy);

    // Boss: 5% chance de arma completa adicional
    if (enemy.isBoss && Math.random() < 0.05) {
      const bonus = pickDropWeapon(state.eraIndex);
      if (bonus) this._giveWeaponFull(bonus, state, enemy);
    }
  },

  _giveFragments(wid, count, state, enemy) {
    if (!state.fragments) state.fragments = {};
    state.fragments[wid] = (state.fragments[wid] || 0) + count;

    const def   = WEAPON_DEFS[wid];
    const color = def ? (TIER_COLORS[def.tier] || '#fff') : '#fff';
    const name  = def ? def.nombre : wid;

    this.floatingNums.push({
      x: enemy.x, y: enemy.y - enemy.radius - 25,
      text: '+' + count + ' frag ' + name,
      color,
      life: 1.8, maxLife: 1.8,
    });
  },

  _giveWeaponFull(wid, state, enemy) {
    if (!state.weaponInventory) state.weaponInventory = [];
    if (!state.weaponInventory.includes(wid)) {
      state.weaponInventory.push(wid);
      const isBossEnemy = enemy.isBoss;
      setTimeout(() => UI.showWeaponDropNotification(wid), isBossEnemy ? 2500 : 0);
    }
  },

  damagePlayer(amount, state) {
    // Escudo absorbe primero
    const remaining = Weapons.absorbDamage(amount, state);
    if (remaining <= 0) {
      // Toda la absorción fue por el escudo: flash azul suave + shake leve
      document.body.classList.remove('screen-shake');
      void document.body.offsetWidth;
      document.body.classList.add('screen-shake');
      return;
    }

    state.hp -= remaining;

    this.screenFlashAlpha = 0.3;
    this.screenFlashR = 255; this.screenFlashG = 50; this.screenFlashB = 50;
    document.body.classList.remove('screen-shake');
    void document.body.offsetWidth;
    document.body.classList.add('screen-shake');

    if (state.hp <= 0) {
      const now = Date.now();
      if (state.debilitationCooldown && now < state.debilitationCooldown) {
        this.onPlayerRealDeath(state);
      } else {
        this.onPlayerDebilitated(state);
        Tutorial.triggerFirstDebilitation();
      }
    }
  },

  onPlayerDebilitated(state) {
    state.hp = Math.floor(state.maxHp * 0.5);
    state.debilitatedUntil     = Date.now() + 60000;
    state.debilitationCooldown = Date.now() + 300000;
    this.screenFlashAlpha = 0.5;
    this.screenFlashR = 255; this.screenFlashG = 200; this.screenFlashB = 0;
    UI.showDebilitationNotification();
  },

  onPlayerRealDeath(state) {
    if (state.eraIndex > 0) state.eraIndex--;
    state.energy = Math.floor(state.energy * 0.5);

    // Perder el 50% de cada generador (floor)
    const genLosses = {};
    for (const id in state.generators) {
      const before = state.generators[id] || 0;
      if (before > 0) {
        const after = Math.floor(before / 2);
        if (before - after > 0) genLosses[id] = before - after;
        state.generators[id] = after;
      }
    }

    state.hp = state.maxHp = 100 + state.eraIndex * 50;
    if (Array.isArray(state.weaponSlots) && state.weaponSlots.includes('campo_fuerza')) {
      const shEff = Weapons.getEffectiveStats('campo_fuerza', state);
      state.shieldMaxHp = shEff.shieldMaxHp;
      state.shieldHp    = Math.min(state.shieldHp || 0, shEff.shieldMaxHp);
    }
    state.debilitationCooldown = 0;
    state.debilitatedUntil     = 0;

    this.mode      = 'peace';
    this.enemies   = [];
    this.peaceTimer = this.PEACE_INITIAL;
    this.bossIsCharging = false;
    this.bossSummonTimer = 15;
    Weapons.reset();

    this.screenFlashAlpha = 0.65;
    this.screenFlashR = 255; this.screenFlashG = 0; this.screenFlashB = 80;

    Visuals.setEra(state.eraIndex, true);
    UI.showEraNotification('Era perdida', '¡Derrotado!');
    UI.showDeathModal({ newEraName: STAGES[state.eraIndex].name, genLosses });
    Game.pauseUntil = performance.now() + 1500;
  },

  handleClick(x, y, state) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = x - e.x, dy = y - e.y;
      if (Math.sqrt(dx * dx + dy * dy) <= e.radius + 10) {
        const damage = Math.pow(5, state.eraIndex) * 3;
        this.damageEnemy(e, damage, true);

        if (e.isBoss && this.bossWindupActive) {
          this.bossInterruptClicks++;
          if (this.bossInterruptClicks >= this.BOSS_INTERRUPT_NEEDED) {
            this.bossWindupActive = false;
            this.bossSpecialTimer = 10;
            UI.showBossInterrupted();
          }
        }
        return true;
      }
    }
    return false;
  },

  spawnCoinAnim(ex, ey) {
    const canvas   = Visuals.canvas;
    const canvRect = canvas.getBoundingClientRect();
    const screenX  = canvRect.left + ex;
    const screenY  = canvRect.top  + ey;

    const el = document.createElement('div');
    el.className = 'coin-anim';
    el.textContent = '✦';
    el.style.left = screenX + 'px';
    el.style.top  = screenY + 'px';

    const counter = document.getElementById('coin-value');
    if (counter) {
      const cr = counter.getBoundingClientRect();
      el.style.setProperty('--tx', (cr.left + cr.width  / 2 - screenX) + 'px');
      el.style.setProperty('--ty', (cr.top  + cr.height / 2 - screenY) + 'px');
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  },

  updateFloatingNums(dt) {
    for (const n of this.floatingNums) {
      n.life -= dt;
      n.y    -= 32 * dt;
    }
    this.floatingNums = this.floatingNums.filter(n => n.life > 0);
  },

  render(ctx, W, H) {
    if (this.screenFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillStyle = `rgb(${this.screenFlashR},${this.screenFlashG},${this.screenFlashB})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (this.bossWindupActive) {
      ctx.save();
      ctx.globalAlpha = 0.08 + 0.05 * Math.sin(Date.now() / 80);
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    Weapons.render(ctx);

    for (const e of this.enemies) {
      if (e.alive) this.renderEnemy(ctx, e);
    }

    ctx.save();
    ctx.font = 'bold 13px "Space Mono", monospace';
    ctx.textAlign = 'center';
    for (const n of this.floatingNums) {
      ctx.globalAlpha = Math.min(1, n.life / n.maxLife * 2);
      ctx.fillStyle   = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.restore();
  },

  renderEnemy(ctx, e) {
    ctx.save();
    const flash = e.hitFlash > 0;

    // --- Minis: semitransparentes ---
    if (e.isMini) {
      ctx.globalAlpha = flash ? 0.9 : 0.65;
      ctx.fillStyle   = flash ? '#ffffff' : e.color;
      drawShape(ctx, e.x, e.y, e.radius, e.shape);
      ctx.fill();
      ctx.restore();
      return;
    }

    // --- Élite: aura pulsante ---
    if (e.isElite) {
      const pulse = 0.12 + 0.1 * Math.sin(Date.now() / 280);
      ctx.globalAlpha = pulse;
      ctx.fillStyle   = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Jefe: aura base + aura de carga ---
    if (e.isBoss) {
      ctx.globalAlpha = 0.20;
      ctx.fillStyle   = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Telegrafiar invocación: esfera blanca que crece rápidamente
      if (e.chargeFlash > 0) {
        const pulseSin = Math.sin(Date.now() / 55) * 0.5 + 0.5;
        ctx.globalAlpha = e.chargeFlash * 0.45 * (0.4 + 0.6 * pulseSin);
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * (1.8 + e.chargeFlash * 1.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Cuerpo principal ---
    ctx.globalAlpha = flash ? Math.min(1, 0.6 + e.hitFlash * 4) : 1;
    ctx.fillStyle   = flash ? '#ffffff' : e.color;
    drawShape(ctx, e.x, e.y, e.radius, e.shape);
    ctx.fill();

    // --- DoT: anillo de veneno/fuego parpadeante ---
    if (e.dots && e.dots.length > 0) {
      ctx.globalAlpha = 0.3 + 0.2 * Math.abs(Math.sin(Date.now() / 180));
      ctx.strokeStyle = e.dots[0].color || '#84cc16';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Stun: anillo amarillo estático ---
    if (e.stunUntil && Date.now() < e.stunUntil) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth   = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- Barra de vida (si está dañado) ---
    if (e.hp < e.maxHp) {
      const bw = e.radius * 2.6;
      const bx = e.x - bw / 2;
      const by = e.y + e.radius + 4;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = e.isBoss ? '#ff6644' : e.isElite ? '#ffaa44' : '#44ff88';
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3);
    }

    // --- Anillo de windup del jefe ---
    if (e.isBoss && this.bossWindupActive) {
      const progress = 1 - this.bossWindupTimer;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 7, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  },

  reset() {
    this.mode         = 'peace';
    this.enemies      = [];
    this.floatingNums = [];
    this.peaceTimer   = this.PEACE_INITIAL;
    this.bossWindupActive    = false;
    this.bossSpecialTimer    = 10;
    this.bossInterruptClicks = 0;
    this.screenFlashAlpha    = 0;
    this.bossSummonTimer  = 15;
    this.bossIsCharging   = false;
    this.bossChargeTimer  = 0;
    Weapons.reset();
  },
};

function drawShape(ctx, x, y, r, shape) {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'hexagon': {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6 - Math.PI / 6;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'star': {
      const inner = r * 0.42;
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : inner;
        const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}
