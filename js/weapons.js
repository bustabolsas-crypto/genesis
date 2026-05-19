'use strict';

/* ============================================
   weapons.js — Pulso Cósmico (arma automática).
   Dispara cada 3s al enemigo más amenazante (boss con prioridad).
   Combat.damageEnemy() aplica el daño; aquí sólo animamos el rayo.
   ============================================ */

const Weapons = {
  cooldownTimer: 0,     // segundos hasta el próximo disparo
  COOLDOWN: 3,

  beamAlpha: 0,         // opacidad del rayo (se desvanece rápido)
  beamFrom: null,       // { x, y } origen (centro del canvas)
  beamTo: null,         // { x, y } destino (enemigo)

  tick(dt, enemies, eraIdx) {
    this.cooldownTimer -= dt;
    if (this.beamAlpha > 0) this.beamAlpha = Math.max(0, this.beamAlpha - dt * 3);

    if (this.cooldownTimer <= 0 && enemies.length > 0) {
      // Boss primero, luego el primer vivo
      let target = enemies.find(e => e.isBoss && e.alive);
      if (!target) target = enemies.find(e => e.alive);

      if (target) {
        const damage = 2 * Math.pow(5, eraIdx);
        Combat.damageEnemy(target, damage, false);
        this.beamFrom = { x: Visuals.width / 2, y: Visuals.height / 2 };
        this.beamTo   = { x: target.x, y: target.y };
        this.beamAlpha = 1;
        this.cooldownTimer = this.COOLDOWN;
      }
    }
  },

  render(ctx) {
    if (!this.beamTo || this.beamAlpha <= 0) return;
    const { x: fx, y: fy } = this.beamFrom;
    const { x: tx, y: ty } = this.beamTo;

    ctx.save();
    // Línea ancha semitransparente (glow)
    ctx.globalAlpha = this.beamAlpha * 0.25;
    ctx.strokeStyle = '#00ffe1';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Línea fina y brillante encima
    ctx.globalAlpha = this.beamAlpha * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  },

  reset() {
    this.cooldownTimer = 0;
    this.beamAlpha = 0;
    this.beamFrom = null;
    this.beamTo   = null;
  },
};
