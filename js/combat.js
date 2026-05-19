'use strict';

/* ============================================
   combat.js — sistema de combate completo.

   Máquina de estados: 'peace' → 'wave' → 'peace' → ... 'boss'
   - peace:  sin enemigos, timer de 30s antes de la ola.
   - wave:   3-5 enemigos activos; cuando todos mueren → peace.
   - boss:   un jefe bloquea el avance de era; al morir → advanceEra.

   Capas de muerte del jugador:
   1ª: HP → maxHp×0.5, EPS -10% por 60s, cooldown 5min.
   2ª (dentro de 5min): era-- , energía×0.5, reset combat.

   Rendering: se dibuja SOBRE Visuals.render() en el mismo canvas.
   ============================================ */

const Combat = {
  // Estado de la ola
  mode: 'peace',       // 'peace' | 'wave' | 'boss'
  enemies: [],
  peaceTimer: 0,       // segundos hasta la próxima ola

  // Números flotantes de daño
  floatingNums: [],    // [{ x, y, text, color, life, maxLife }]

  // Flash de pantalla
  screenFlashAlpha: 0,
  screenFlashR: 255, screenFlashG: 50, screenFlashB: 50,

  // Especial del jefe
  bossInterruptClicks: 0,
  bossSpecialTimer:    10,   // segundos hasta el próximo especial
  bossWindupActive:    false,
  bossWindupTimer:     0,    // segundos de margen para interrumpir (1s)

  // Previene re-spawn inmediato de boss tras avance de era
  bossSpawnCooldownUntil: 0,

  PEACE_INITIAL: 30,
  ATTACK_RANGE:  55,    // px desde el centro del canvas
  BOSS_INTERRUPT_NEEDED: 5,

  init() {
    this.mode     = 'peace';
    this.enemies  = [];
    this.floatingNums  = [];
    this.peaceTimer = this.PEACE_INITIAL;
    this.bossWindupActive  = false;
    this.bossSpecialTimer  = 10;
    this.bossInterruptClicks = 0;
    this.screenFlashAlpha  = 0;
    this.bossSpawnCooldownUntil = 0;
    Weapons.reset();
  },

  // Punto de entrada del game loop. Modal abierto → pausa total.
  tick(dt, state) {
    if (Modal.isOpen()) return;

    // Regenerar HP sólo en paz
    if (this.mode === 'peace' && state.hp < state.maxHp) {
      state.hp = Math.min(state.maxHp, state.hp + state.maxHp * 0.01 * dt);
    }

    this.updateWave(dt, state);
    this.updateEnemies(dt, state);
    Weapons.tick(dt, this.enemies, state.eraIndex);
    this.updateFloatingNums(dt);

    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 3);
    }
  },

  // Transiciones de la máquina de estados
  updateWave(dt, state) {
    if (this.mode === 'peace') {
      this.peaceTimer -= dt;
      if (this.peaceTimer <= 0) this.startWave(state.eraIndex);
    } else if (this.mode === 'wave') {
      if (!this.enemies.some(e => e.alive)) {
        this.mode = 'peace';
        this.peaceTimer = 30 + Math.random() * 30;
      }
    }
    // mode === 'boss': sin timer, espera a que el jefe muera
  },

  startWave(eraIdx) {
    this.mode = 'wave';
    this.enemies = [];
    const count = 3 + Math.floor(Math.random() * 3);
    const W = Visuals.width, H = Visuals.height;
    const types = ['a', 'b', 'c'];
    for (let i = 0; i < count; i++) {
      this.enemies.push(spawnEnemy(eraIdx, types[i % 3], W, H));
    }
    Tutorial.triggerFirstEnemy();
  },

  // Llamado desde Game.checkEraUnlock() cuando la energía cruza el umbral
  requestBossSpawn(eraIdx) {
    this.bossSpawnCooldownUntil = performance.now() + 5000;
    this.mode    = 'boss';
    this.enemies = [spawnEnemy(eraIdx, 'boss', Visuals.width, Visuals.height)];
    this.bossSpecialTimer    = 10;
    this.bossInterruptClicks = 0;
    this.bossWindupActive    = false;
    Tutorial.triggerFirstBoss();
    UI.showBossWarning(ENEMY_NAMES[Math.min(11, eraIdx)].boss);
  },

  updateEnemies(dt, state) {
    const cx = Visuals.width  / 2;
    const cy = Visuals.height / 2;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      const dx = cx - e.x;
      const dy = cy - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.ATTACK_RANGE) {
        e.x += (dx / dist) * e.speed * dt;
        e.y += (dy / dist) * e.speed * dt;
      } else {
        // En rango de ataque: ataca al jugador
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

  damageEnemy(enemy, amount, isPlayerClick) {
    if (!enemy || !enemy.alive) return;
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;

    this.floatingNums.push({
      x: enemy.x, y: enemy.y - enemy.radius - 8,
      text: '-' + formatNumber(Math.ceil(amount)),
      color: isPlayerClick ? '#ffdd44' : '#00ffe1',
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

    if (enemy.isBoss) {
      this.bossWindupActive = false;
      Game.advanceEra();
    }
  },

  damagePlayer(amount, state) {
    state.hp -= amount;

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
    state.energy  = Math.floor(state.energy * 0.5);
    state.hp = state.maxHp = 100 + state.eraIndex * 50;
    state.debilitationCooldown = 0;
    state.debilitatedUntil     = 0;

    this.mode      = 'peace';
    this.enemies   = [];
    this.peaceTimer = this.PEACE_INITIAL;
    Weapons.reset();

    this.screenFlashAlpha = 0.65;
    this.screenFlashR = 255; this.screenFlashG = 0; this.screenFlashB = 80;

    Visuals.setEra(state.eraIndex, true);
    UI.showEraNotification('Era perdida', '¡Derrotado!');
    UI.showDeathModal();
    Game.pauseUntil = performance.now() + 1500;
  },

  // Retorna true si el click impactó a un enemigo (consume el click)
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
    const canvas  = Visuals.canvas;
    const canvRect = canvas.getBoundingClientRect();
    const screenX = canvRect.left + ex;
    const screenY = canvRect.top  + ey;

    const el = document.createElement('div');
    el.className = 'coin-anim';
    el.textContent = '✦';
    el.style.left = screenX + 'px';
    el.style.top  = screenY + 'px';

    const counter = document.getElementById('coin-value');
    if (counter) {
      const cr = counter.getBoundingClientRect();
      el.style.setProperty('--tx', (cr.left + cr.width / 2 - screenX) + 'px');
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

  // Dibujo completo; llamado por el game loop después de Visuals.render()
  render(ctx, W, H) {
    // Flash de pantalla (daño recibido)
    if (this.screenFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillStyle = `rgb(${this.screenFlashR},${this.screenFlashG},${this.screenFlashB})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Overlay rojo pulsante durante windup del jefe
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

    // Números flotantes de daño
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

    // Aura del jefe
    if (e.isBoss) {
      ctx.globalAlpha = 0.20;
      ctx.fillStyle   = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = flash ? Math.min(1, 0.6 + e.hitFlash * 4) : 1;
    ctx.fillStyle   = flash ? '#ffffff' : e.color;
    drawShape(ctx, e.x, e.y, e.radius, e.shape);
    ctx.fill();

    // Barra de vida (sólo si está dañado)
    if (e.hp < e.maxHp) {
      const bw = e.radius * 2.6;
      const bx = e.x - bw / 2;
      const by = e.y + e.radius + 4;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = e.isBoss ? '#ff6644' : '#44ff88';
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3);
    }

    // Anillo de windup en el jefe (indica progreso del especial)
    if (e.isBoss && this.bossWindupActive) {
      const progress = 1 - this.bossWindupTimer;   // 0→1 durante 1s
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
    this.mode      = 'peace';
    this.enemies   = [];
    this.floatingNums  = [];
    this.peaceTimer    = this.PEACE_INITIAL;
    this.bossWindupActive    = false;
    this.bossSpecialTimer    = 10;
    this.bossInterruptClicks = 0;
    this.screenFlashAlpha    = 0;
    Weapons.reset();
  },
};

// Dibuja formas geométricas para los enemigos
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
