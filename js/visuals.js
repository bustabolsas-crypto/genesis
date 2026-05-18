'use strict';

/* ============================================
   visuals.js — todo lo que se dibuja en canvas.

   Arquitectura:
   - Visuals.update(dt)    avanza la física: estrellas, partículas de
                           click y la transición entre eras (eraVisual lerp).
   - Visuals.render()      pinta UN frame completo.
   - ENTITY_RENDERERS[i]   función dedicada a dibujar la entidad central
                           de la era i. La elegimos por índice y, durante
                           la transición, dibujamos las dos eras vecinas
                           con alphas complementarios (crossfade).
   - currentPalette()      devuelve los colores del fondo y los acentos
                           para el frame actual; durante una transición
                           interpola entre las paletas vecinas.

   Performance: nada de shadowBlur ni filtros. Todas las primitivas son
   arc/fill o trazos de líneas. Las partículas se mantienen en arrays
   reutilizables; no se crean objetos en el camino caliente.
   ============================================ */

const Visuals = {
  canvas: null,
  ctx: null,
  width: 0, height: 0, dpr: 1,

  particles: [],     // partículas que vuelan al contador al hacer click
  bgStars: [],
  nebulae: [],       // manchas radiales difusas que dan profundidad espacial
  pulse: 0,          // tiempo acumulado, alimenta animaciones cíclicas
  _lastDOMAccent: null, // memoiza el último triplete escrito a --era-accent

  // Era visual (float). Se anima suavemente entre enteros para que la
  // transición de era no sea un salto seco.
  eraVisual: 0,
  eraTarget: 0,
  eraTransitionDuration: 3, // segundos por unidad

  // Animación de Big Bang. Cuando bigBangT >= 0, sustituye el render
  // normal por una secuencia de 4 segundos: explosión, flash, fade,
  // renacer. Termina volviendo a -1 (inactivo).
  bigBangT: -1,
  BIG_BANG_DURATION: 4,

  init() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');

    this.resize();
    this.spawnBgStars(200);          // densidad más alta
    this.spawnNebulae(5);            // manchas radiales difusas

    // Detección de touch device. Lo usamos para:
    //   - Cap de partículas por click (móvil rinde menos).
    //   - Saber qué eventos atender como "tap autorizado".
    this.isTouchDevice = 'ontouchstart' in window
                         || (navigator.maxTouchPoints || 0) > 0;

    window.addEventListener('resize', () => this.resize());

    // Handler unificado: recibe coords de viewport y dispara Game.click.
    const handleTap = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      Game.click(x, y, clientX, clientY);
    };

    // En móvil, usar SOLO `click` pierde taps por dos razones:
    //  1. Hay un retraso de ~300ms (anti-doble-tap-zoom) que se come
    //     taps rápidos seguidos.
    //  2. `click` se dispara una sola vez por tap pero cancela si el
    //     usuario "se mueve" un poco entre touchstart y touchend.
    //
    // Solución: escuchar `touchstart` en móvil con preventDefault y
    // mantener `click` como fallback para desktop (mouse). Para evitar
    // que el click sintético posterior al touchstart cuente doble,
    // guardamos un timestamp y lo descartamos si vino de touch.
    let lastTouchAt = 0;

    this.canvas.addEventListener('touchstart', (e) => {
      // preventDefault aquí mata: (a) el zoom de doble-tap, (b) el click
      // sintético que viene después, (c) cualquier scroll/gesto.
      e.preventDefault();
      lastTouchAt = performance.now();
      // changedTouches = los toques que acaban de empezar en este evento.
      // Soportamos multi-touch (cada dedo cuenta como un click).
      for (const t of e.changedTouches) {
        handleTap(t.clientX, t.clientY);
      }
    }, { passive: false });

    this.canvas.addEventListener('click', (e) => {
      // Si vino de un touch reciente, el click es el sintético y ya
      // contamos el tap en touchstart. Lo descartamos.
      if (performance.now() - lastTouchAt < 600) return;
      handleTap(e.clientX, e.clientY);
    });
  },

  eventToCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  // Ajusta el canvas al tamaño actual del contenedor respetando DPR
  // para nitidez en pantallas Retina/HDPI.
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width  = Math.floor(rect.width  * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width  = rect.width;
    this.height = rect.height;
  },

  spawnBgStars(n) {
    this.bgStars = [];
    for (let i = 0; i < n; i++) {
      this.bgStars.push({
        x: Math.random(),       // 0..1 (se multiplica por width al dibujar)
        y: Math.random(),
        size: Math.random() * 1.5 + 0.3,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }
  },

  // Pre-genera nebulosas: posiciones, radios y "drift" (movimiento muy lento).
  // Se renderizan antes de las estrellas para quedar en el fondo.
  spawnNebulae(n) {
    this.nebulae = [];
    for (let i = 0; i < n; i++) {
      this.nebulae.push({
        x: Math.random(),                     // 0..1, fracción del ancho
        y: Math.random(),
        radius: 0.25 + Math.random() * 0.28,  // 25..53% de max(w, h)
        drift: Math.random() * Math.PI * 2,
        speed: 0.04 + Math.random() * 0.06,
        kind: i % 2,                          // alterna entre accent y accent2
      });
    }
  },

  setEra(index, animate = true) {
    this.eraTarget = index;
    if (!animate) this.eraVisual = index;
  },

  // Spawna partículas que viajan al contador de Energía.
  // gain (= valor del click) escala count y size en log10 para que
  // los clicks "grandes" se sientan más impactantes.
  spawnClickParticle(x, y, gain = 1) {
    const counter = document.getElementById('energy-value');
    const counterRect = counter.getBoundingClientRect();
    const canvasRect  = this.canvas.getBoundingClientRect();
    const tx = counterRect.left + counterRect.width / 2 - canvasRect.left;
    const ty = counterRect.top  + counterRect.height / 2 - canvasRect.top;

    const log = Math.max(0, Math.log10(Math.max(1, gain)));
    let count, sizeMul;
    if (this.isTouchDevice) {
      // En móvil priorizamos responsividad: pocas partículas para que
      // 10 taps/seg no atasquen el render loop ni el GC.
      count = 3 + Math.floor(Math.random() * 2);   // 3..4
      sizeMul = Math.min(2.0, 1 + log * 0.15);
    } else {
      const baseCount = 4 + Math.floor(Math.random() * 3);
      count = baseCount + Math.min(20, Math.floor(log * 2.5));
      sizeMul = Math.min(2.8, 1 + log * 0.18);
    }

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 16,
        tx, ty,
        vx: (Math.random() - 0.5) * 240,
        vy: (Math.random() - 0.5) * 240,
        life: 1,
        size: (2 + Math.random() * 2) * sizeMul,
      });
    }
    // Performance cap: si hay muchas partículas (clicks frenéticos),
    // tiramos las más viejas para no acumular y bajar fps.
    if (this.particles.length > 1000) {
      this.particles.splice(0, this.particles.length - 1000);
    }
  },

  // Arranca la animación de Big Bang. Llamado por Prestige.collapse().
  // La animación dura 4s y al terminar deja la entidad en Vacío.
  startBigBang() {
    this.bigBangT = 0;
    // Snap visual a Vacío (sin animación de morph): la animación de
    // Big Bang ES la transición.
    this.eraVisual = 0;
    this.eraTarget = 0;

    // Spawn ~150 partículas "free" volando radialmente desde el centro.
    const cx = this.width / 2, cy = this.height / 2;
    const N = 150;
    for (let i = 0; i < N; i++) {
      // Distribución cuasi-uniforme + jitter para que se vea orgánico.
      const ang = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 280 + Math.random() * 520;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 2.2 + Math.random() * 0.6,
        size: 1.5 + Math.random() * 3,
        free: true,                      // sin target seek
      });
    }

    // Flash visual a través del overlay DOM (más fuerte que la transición de era).
    const flash = document.getElementById('era-flash');
    if (flash) {
      flash.classList.remove('show', 'big');
      void flash.offsetWidth;
      flash.classList.add('show', 'big');
    }
  },

  update(dt) {
    this.pulse += dt;

    // Avance del lerp de era → target.
    if (this.eraVisual !== this.eraTarget) {
      const speed = 1 / this.eraTransitionDuration;
      const diff = this.eraTarget - this.eraVisual;
      const step = Math.sign(diff) * speed * dt;
      if (Math.abs(diff) <= Math.abs(step)) this.eraVisual = this.eraTarget;
      else this.eraVisual += step;
    }

    // Partículas: dos tipos.
    //  - Las normales persiguen p.tx,p.ty (contador de Energía).
    //  - Las "free" (Big Bang) vuelan libres con damping suave.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (!p.free) {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        const accel = 900;
        if (dist > 0.5) {
          p.vx += (dx / dist) * accel * dt;
          p.vy += (dy / dist) * accel * dt;
        }
        // Damping fuerte: convergen rápido al contador.
        const damping = Math.pow(0.06, dt);
        p.vx *= damping; p.vy *= damping;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt * 1.4;
        if (dist < 8 || p.life <= 0) this.particles.splice(i, 1);
      } else {
        // Free: damping mucho más suave, vuelan lejos antes de apagarse.
        const damping = Math.pow(0.5, dt);
        p.vx *= damping; p.vy *= damping;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt * 0.7;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }

    // Avance del reloj de Big Bang.
    if (this.bigBangT >= 0) {
      this.bigBangT += dt;
      if (this.bigBangT >= this.BIG_BANG_DURATION) this.bigBangT = -1;
    }
  },

  // Devuelve la paleta del frame actual: si estamos exactamente en una era,
  // la suya; si estamos a mitad de transición, interpola entre las dos.
  currentPalette() {
    const lo = Math.floor(this.eraVisual);
    const hi = Math.min(Math.ceil(this.eraVisual), STAGES.length - 1);
    if (lo === hi) return STAGES[lo].palette;
    const t = this.eraVisual - lo;
    return lerpPalette(STAGES[lo].palette, STAGES[hi].palette, t);
  },

  render() {
    const ctx = this.ctx;
    const palette = this.currentPalette();

    // Sincroniza el accent del DOM con la era actual. Lo escribimos sólo
    // cuando cambia (no en cada frame) para no triggerear re-layouts inútiles.
    const accentStr = palette.accent.r + ', ' + palette.accent.g + ', ' + palette.accent.b;
    if (this._lastDOMAccent !== accentStr) {
      document.documentElement.style.setProperty('--era-accent', accentStr);
      this._lastDOMAccent = accentStr;
    }

    this.renderBackground(palette);

    const cx = this.width / 2, cy = this.height / 2;

    if (this.bigBangT >= 0) {
      // Durante el Big Bang sustituimos la entidad por la animación de colapso.
      this.renderBigBang(cx, cy, palette);
    } else {
      // Crossfade normal entre las dos eras vecinas.
      const lo = Math.floor(this.eraVisual);
      const hi = Math.min(Math.ceil(this.eraVisual), STAGES.length - 1);
      const t = this.eraVisual - lo;

      const baseRC = {
        ctx, cx, cy,
        W: this.width, H: this.height,
        time: this.pulse,
        palette,
      };

      if (lo === hi) {
        ENTITY_RENDERERS[lo]({ ...baseRC, alpha: 1 });
      } else {
        ENTITY_RENDERERS[lo]({ ...baseRC, alpha: 1 - t });
        ENTITY_RENDERERS[hi]({ ...baseRC, alpha: t });
      }
    }

    // Partículas (clicks y free) por encima de todo.
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = `rgba(${palette.accent.r},${palette.accent.g},${palette.accent.b},${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // Animación de Big Bang en 3 fases. La duración total es 4s.
  // Fase 1 (0..1.2s): la entidad explota — núcleo gigante + halo creciendo y desvaneciéndose.
  // Fase 2 (1.2..2.8s): vacío oscuro, casi nada en pantalla.
  // Fase 3 (2.8..4s): renace un puntito de luz que crece hasta el tamaño de Vacío.
  renderBigBang(cx, cy, palette) {
    const ctx = this.ctx;
    const t = this.bigBangT;
    const dur = this.BIG_BANG_DURATION;

    if (t < 1.2) {
      // Núcleo blanco + halo expandiéndose.
      const u = t / 1.2;                       // 0..1
      const R = lerp(20, Math.min(this.width, this.height) * 0.55, u);
      const haloAlpha = lerp(1, 0, u);
      drawHalo(ctx, cx, cy, R, {r:255,g:255,b:255}, haloAlpha);
      const coreR = lerp(40, 0, u);
      drawCore(ctx, cx, cy, coreR, lerp(1, 0, u));
    } else if (t < 2.8) {
      // Casi vacío. Algunas chispas residuales aún se ven gracias al sistema de partículas.
      // No dibujamos entidad.
    } else {
      // Renacimiento: aparece un punto de luz tipo Vacío.
      const u = (t - 2.8) / (dur - 2.8);        // 0..1
      const baseR = Math.min(this.width, this.height) * 0.045;
      const r = baseR * u * (1 + Math.sin(this.pulse * 2.2) * 0.12);
      drawHalo(ctx, cx, cy, r * 7, palette.accent, u * 0.55);
      drawCore(ctx, cx, cy, r, u);
    }
  },

  renderBackground(palette) {
    const ctx = this.ctx;
    const w = this.width, h = this.height;

    // Color base sólido.
    ctx.fillStyle = `rgb(${palette.bg.r},${palette.bg.g},${palette.bg.b})`;
    ctx.fillRect(0, 0, w, h);

    // Velo radial (da profundidad, foco en el centro).
    const cx = w / 2, cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    grad.addColorStop(0, `rgba(${palette.fog.r},${palette.fog.g},${palette.fog.b},${palette.fog.a})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Nebulosas: manchas muy difusas con drift lento. Dan sensación de
    // espacio profundo, no fondo plano. Alpha bajo (~0.045) para que no
    // compitan con la entidad central. Color = accent o accent2 de la era.
    const sa = palette.starAlpha != null ? palette.starAlpha : 1;
    const nebMul = Math.max(0.4, sa);
    for (const n of this.nebulae) {
      const nx = (n.x + Math.cos(this.pulse * n.speed + n.drift) * 0.06) * w;
      const ny = (n.y + Math.sin(this.pulse * n.speed + n.drift) * 0.06) * h;
      const nr = n.radius * Math.max(w, h);
      const c = n.kind === 0 ? palette.accent : palette.accent2;
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0,   `rgba(${c.r},${c.g},${c.b},${(0.055 * nebMul).toFixed(3)})`);
      ng.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},${(0.018 * nebMul).toFixed(3)})`);
      ng.addColorStop(1,   `rgba(${c.r},${c.g},${c.b},0)`);
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Estrellas de fondo, con alpha modulado por la era (las paletas
    // densas como Galaxia las atenúan para no competir con la entidad).
    if (sa > 0.01) {
      for (const s of this.bgStars) {
        const alpha = (0.3 + Math.abs(Math.sin(this.pulse * s.speed + s.twinkle)) * 0.5) * sa;
        ctx.fillStyle = `rgba(220, 220, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
};

/* ============================================
   HELPERS DE COLOR Y DIBUJO
   ============================================ */

function lerp(a, b, t)   { return a + (b - a) * t; }
function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

// Mezcla dos colores RGB (a) y opcionalmente alfa.
function lerpColor(a, b, t) {
  const out = {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
  if (a.a !== undefined || b.a !== undefined) {
    out.a = lerp(a.a != null ? a.a : 1, b.a != null ? b.a : 1, t);
  }
  return out;
}

function lerpPalette(a, b, t) {
  return {
    bg:        lerpColor(a.bg, b.bg, t),
    fog:       lerpColor(a.fog, b.fog, t),
    accent:    lerpColor(a.accent, b.accent, t),
    accent2:   lerpColor(a.accent2, b.accent2, t),
    starAlpha: lerp(a.starAlpha != null ? a.starAlpha : 1, b.starAlpha != null ? b.starAlpha : 1, t),
  };
}

// "rgba(r,g,b,a)" — wrapper para no construir el string a mano cada vez.
function rgba(c, a = 1) {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function drawCore(ctx, cx, cy, r, alpha) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawDot(ctx, x, y, r, color, alpha = 1) {
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Halo gaussiano-aproximado vía gradiente radial. Es la primitiva más
// usada por casi todos los renderers para dar el efecto neón.
function drawHalo(ctx, cx, cy, R, color, alpha = 1) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0,   rgba(color, alpha));
  g.addColorStop(0.4, rgba(color, alpha * 0.3));
  g.addColorStop(1,   rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

function drawEllipseRing(ctx, cx, cy, rx, ry, tilt, color, alpha) {
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
  ctx.stroke();
}

// Hash determinístico 0..1 a partir de un entero. Usado para "aleatoriedad"
// reproducible en renderers (ciudades, mini-galaxias, etc.).
function hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Conversión HSL→RGB (h: 0..360, s/l: 0..100).
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0)*255), g: Math.round(f(8)*255), b: Math.round(f(4)*255) };
}

/* ============================================
   RENDERERS POR ERA
   Cada función recibe rc = { ctx, cx, cy, W, H, time, alpha, palette }.
   - alpha   : 1 cuando la era está activa, < 1 durante la transición.
   - palette : ya interpolada para el frame, se puede usar tal cual.
   ============================================ */

// 0. VACÍO — punto de luz pulsante con halo cyan.
function renderVacio(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const baseR = Math.min(W, H) * 0.045;
  const r = baseR * (1 + Math.sin(time * 2.2) * 0.12);
  drawHalo(ctx, cx, cy, r * 7, palette.accent, alpha * 0.55);
  drawCore(ctx, cx, cy, r, alpha);
}

// 1. PARTÍCULA — bola brillante con 5 orbitadores violeta en órbita inclinada.
function renderParticula(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const baseR = Math.min(W, H) * 0.07;
  const r = baseR * (1 + Math.sin(time * 2.2) * 0.12);
  drawHalo(ctx, cx, cy, r * 8.5, palette.accent, alpha * 0.7);
  drawCore(ctx, cx, cy, r, alpha);

  const N = 5;
  const orbitR = r * 3.8;
  for (let i = 0; i < N; i++) {
    const ang = time * 1.4 + (i / N) * Math.PI * 2;
    const ox = cx + Math.cos(ang) * orbitR;
    const oy = cy + Math.sin(ang) * orbitR * 0.55;
    drawDot(ctx, ox, oy, 2.6, palette.accent2, alpha * 0.9);
  }
}

// 2. ÁTOMO — núcleo brillante + 3 electrones en órbitas elípticas inclinadas.
function renderAtomo(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const R = Math.min(W, H) * 0.06;

  drawHalo(ctx, cx, cy, R * 5, palette.accent, alpha * 0.45);
  drawCore(ctx, cx, cy, R * (1 + Math.sin(time * 3) * 0.06), alpha);

  // 3 órbitas con tilts repartidos cada 60°.
  const orbits = [
    { rx: R * 4.5, ry: R * 1.6, tilt: 0,                    speed: 1.6 },
    { rx: R * 5.0, ry: R * 1.7, tilt: Math.PI / 3,          speed: 1.2 },
    { rx: R * 4.2, ry: R * 1.4, tilt: -Math.PI / 3,         speed: 2.1 },
  ];
  for (const o of orbits) {
    drawEllipseRing(ctx, cx, cy, o.rx, o.ry, o.tilt, palette.accent2, alpha * 0.18);
    const ang = time * o.speed;
    // Posición local en la elipse, luego rotamos por tilt.
    const lx = Math.cos(ang) * o.rx;
    const ly = Math.sin(ang) * o.ry;
    const ex = cx + lx * Math.cos(o.tilt) - ly * Math.sin(o.tilt);
    const ey = cy + lx * Math.sin(o.tilt) + ly * Math.cos(o.tilt);
    drawDot(ctx, ex, ey, 3.8, palette.accent2, alpha);
    drawHalo(ctx, ex, ey, 10, palette.accent2, alpha * 0.4);
  }
}

// 3. MOLÉCULA — 6 átomos en hexágono conectados por enlaces, núcleo central.
function renderMolecula(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const R = Math.min(W, H) * 0.13;
  const N = 6;

  // Posiciones con un poquito de wobble para que respire.
  const atoms = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + time * 0.15;
    const r = R * (0.75 + Math.sin(time * 1.2 + i) * 0.05);
    atoms.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }

  // Enlaces: vecinos del hexágono + diagonales para dar volumen.
  ctx.strokeStyle = rgba(palette.accent2, alpha * 0.45);
  ctx.lineWidth = 2;
  for (let i = 0; i < N; i++) {
    const a = atoms[i];
    const b = atoms[(i + 1) % N];
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    // Diagonales (sólo desde 3 vértices para no recargar).
    if (i < 3) {
      const c = atoms[(i + 3) % N];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
  }

  // Esferas con halo.
  for (const a of atoms) {
    drawHalo(ctx, a.x, a.y, R * 0.35, palette.accent, alpha * 0.5);
    drawDot(ctx, a.x, a.y, R * 0.13, palette.accent, alpha);
  }
  // Átomo central.
  drawDot(ctx, cx, cy, R * 0.16, palette.accent2, alpha);
  drawHalo(ctx, cx, cy, R * 0.4, palette.accent2, alpha * 0.5);
}

// 4. CÉLULA — blob orgánico con núcleo. Cada ~10 segundos se divide.
function renderCelula(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const baseR = Math.min(W, H) * 0.085;
  // Ciclo de división de 10s. Entre 0.7 y 0.95 del ciclo se separa en dos.
  const cycle = (time % 10) / 10;
  let separation = 0;
  if (cycle > 0.7 && cycle < 0.95) {
    const phase = (cycle - 0.7) / 0.25;     // 0..1
    separation = Math.sin(phase * Math.PI) * baseR * 1.4;
  }
  drawCellBlob(ctx, cx - separation, cy, baseR, time,         palette, alpha);
  if (separation > 0.5) {
    drawCellBlob(ctx, cx + separation, cy, baseR, time + 1.3, palette, alpha);
  }
}

// Helper para Célula: blob deformado con núcleo interior.
function drawCellBlob(ctx, cx, cy, R, time, palette, alpha) {
  // Halo membrana
  drawHalo(ctx, cx, cy, R * 1.7, palette.accent, alpha * 0.35);
  // Cuerpo del blob: contorno deformado por dos sinusoides.
  ctx.fillStyle = rgba(palette.accent, alpha * 0.85);
  ctx.beginPath();
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const wob = 1 + 0.09 * Math.sin(ang * 3 + time * 1.4) + 0.05 * Math.sin(ang * 5 + time * 2.0);
    const x = cx + Math.cos(ang) * R * wob;
    const y = cy + Math.sin(ang) * R * wob;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Núcleo
  drawDot(ctx, cx, cy, R * 0.32, palette.accent2, alpha * 0.95);
  drawDot(ctx, cx + R * 0.07, cy - R * 0.05, R * 0.08, {r:255,g:255,b:255}, alpha * 0.6);
}

// 5. ORGANISMO — gusano segmentado moviéndose con curva sinusoidal.
function renderOrganismo(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const N = 12;
  const segR = Math.min(W, H) * 0.028;
  const length = Math.min(W, H) * 0.30;

  // Cabeza describe un círculo lento.
  const headAng = time * 0.6;
  const headX = cx + Math.cos(headAng) * length * 0.18;
  const headY = cy + Math.sin(headAng) * length * 0.18;

  // Cada segmento atrás de la cabeza, con sway perpendicular sinusoidal.
  for (let i = N - 1; i >= 0; i--) {
    const u = i / (N - 1);                // 0=cabeza, 1=cola
    const offset = u * length;
    const sway = Math.sin(headAng * 2 - u * 5) * length * 0.18;
    const sx = headX - Math.cos(headAng) * offset + Math.sin(headAng) * sway;
    const sy = headY - Math.sin(headAng) * offset + -Math.cos(headAng) * sway;
    const r = segR * (1 - u * 0.5);       // adelgaza hacia la cola
    drawHalo(ctx, sx, sy, r * 2.6, palette.accent, alpha * 0.25);
    drawDot(ctx, sx, sy, r, palette.accent, alpha * (1 - u * 0.3));
  }
  // "Ojo" en la cabeza
  drawDot(ctx, headX, headY, segR * 0.4, palette.accent2, alpha);
}

// 6. ESPECIE — 5 criaturitas (óvalos) moviéndose juntas en grupo.
function renderEspecie(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const N = 5;
  const groupR = Math.min(W, H) * 0.18;

  // El centro del grupo se desplaza lentamente con dos sinusoides distintas
  // para describir un patrón tipo "lemniscata".
  const cgx = cx + Math.cos(time * 0.4) * groupR * 0.3;
  const cgy = cy + Math.sin(time * 0.8) * groupR * 0.2;

  // Halo del grupo
  drawHalo(ctx, cgx, cgy, groupR * 0.95, palette.accent, alpha * 0.18);

  for (let i = 0; i < N; i++) {
    const phase = (i / N) * Math.PI * 2;
    const ang = time * 0.7 + phase;
    const r = groupR * (0.55 + Math.sin(time + phase) * 0.12);
    const x = cgx + Math.cos(ang) * r;
    const y = cgy + Math.sin(ang) * r * 0.7;
    // Cuerpo elíptico orientado en la dirección de movimiento.
    ctx.fillStyle = rgba(palette.accent, alpha * 0.95);
    ctx.beginPath();
    ctx.ellipse(x, y, 9, 5, ang, 0, Math.PI * 2);
    ctx.fill();
    // "Ojo" / cabeza
    drawDot(ctx, x + Math.cos(ang) * 5, y + Math.sin(ang) * 3, 1.8, palette.accent2, alpha);
  }
}

// 7. CIVILIZACIÓN — esfera oscura con luces de ciudad rotando (cara visible).
function renderCivilizacion(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const R = Math.min(W, H) * 0.13;

  // Halo atmosférico.
  drawHalo(ctx, cx, cy, R * 1.6, palette.accent2, alpha * 0.3);

  // Disco oscuro (planeta de noche).
  ctx.fillStyle = rgba({r:18, g:14, b:8}, alpha);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Borde "amanecer"
  const grad = ctx.createRadialGradient(cx + R * 0.6, cy - R * 0.2, 0, cx, cy, R);
  grad.addColorStop(0,   rgba(palette.accent2, alpha * 0.25));
  grad.addColorStop(0.7, rgba(palette.accent2, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Ciudades: 36 puntos en posiciones determinísticas. Sólo las que están
  // en la cara visible (cos(longitud rotada) > 0) se dibujan, con titileo.
  const cities = 36;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < cities; i++) {
    const seedLng = hash01(i + 1) * Math.PI * 2;
    const seedLat = (hash01(i + 100) - 0.5) * Math.PI * 0.8;
    const rotated = seedLng + time * 0.18;
    if (Math.cos(rotated) <= 0) continue;
    const sx = cx + R * Math.cos(seedLat) * Math.sin(rotated);
    const sy = cy + R * Math.sin(seedLat) * 0.85;
    const visibility = Math.max(0, Math.cos(rotated));
    const twinkle = 0.6 + 0.4 * Math.sin(time * 4 + i * 1.7);
    drawDot(ctx, sx, sy, 1.6, palette.accent, alpha * visibility * twinkle);
  }
  ctx.restore();
}

// 8. PLANETA — esfera tipo Tierra rotando con continentes y atmósfera.
function renderPlaneta(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const R = Math.min(W, H) * 0.14;

  // Atmósfera (halo blanco-azul).
  drawHalo(ctx, cx, cy, R * 1.55, palette.accent2, alpha * 0.4);

  // Océano: esfera azul.
  ctx.fillStyle = rgba({r:50, g:90, b:140}, alpha);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Continentes: parches verdes que aparecen y desaparecen con la rotación.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  const conts = 6;
  for (let i = 0; i < conts; i++) {
    const seedLat = (hash01(i + 7) - 0.5) * Math.PI * 0.7;
    const seedLng = hash01(i + 33) * Math.PI * 2;
    const rotated = seedLng + time * 0.22;
    const visibility = Math.cos(rotated);
    if (visibility <= -0.2) continue;
    const sx = cx + R * Math.cos(seedLat) * Math.sin(rotated);
    const sy = cy + R * Math.sin(seedLat) * 0.85;
    ctx.fillStyle = rgba(palette.accent, alpha * Math.max(0, visibility));
    ctx.beginPath();
    ctx.ellipse(sx, sy, R * 0.22, R * 0.14, hash01(i + 50) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Sombra-iluminación: gradiente lateral que da volumen.
  const grad = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.4, 0, cx, cy, R * 1.1);
  grad.addColorStop(0,   `rgba(255,255,255,${alpha * 0.25})`);
  grad.addColorStop(0.7, `rgba(255,255,255,0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
}

// 9. SISTEMA SOLAR — sol central + 4 planetas en órbitas a velocidades distintas.
function renderSistemaSolar(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const sunR = Math.min(W, H) * 0.045;

  // Halo del sol (más grande, intensidad alta).
  drawHalo(ctx, cx, cy, sunR * 7, palette.accent, alpha * 0.7);

  // Disco del sol con un "núcleo" más amarillo dentro.
  const r = sunR * (1 + Math.sin(time * 1.8) * 0.07);
  drawDot(ctx, cx, cy, r,         palette.accent,  alpha);
  drawDot(ctx, cx, cy, r * 0.6,   palette.accent2, alpha * 0.95);

  // Planetas: cada uno con su radio orbital, velocidad y color.
  const planets = [
    { r: sunR * 2.8, speed: 1.4,  size: 2.2, color: palette.accent2 },
    { r: sunR * 4.4, speed: 0.95, size: 3.0, color: {r:130, g:200, b:255} },
    { r: sunR * 6.2, speed: 0.65, size: 3.6, color: {r:255, g:200, b:140} },
    { r: sunR * 8.0, speed: 0.40, size: 2.8, color: {r:200, g:160, b:120} },
  ];
  for (const pl of planets) {
    // Línea de órbita tenue (elipse achatada para sensación 3D).
    drawEllipseRing(ctx, cx, cy, pl.r, pl.r * 0.4, 0, palette.accent2, alpha * 0.12);
    const ang = time * pl.speed;
    const px = cx + Math.cos(ang) * pl.r;
    const py = cy + Math.sin(ang) * pl.r * 0.4;
    drawHalo(ctx, px, py, pl.size * 3, pl.color, alpha * 0.35);
    drawDot(ctx, px, py, pl.size, pl.color, alpha);
  }
}

// 10. GALAXIA — espiral de partículas con 3 brazos rotando.
function renderGalaxia(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const maxR = Math.min(W, H) * 0.36;
  const N = 220;             // partículas totales
  const arms = 3;
  const rotation = time * 0.18;

  for (let i = 0; i < N; i++) {
    const u = i / N;                       // 0..1, distancia al centro
    const arm = i % arms;
    const armOffset = (arm / arms) * Math.PI * 2;

    // Espiral logarítmica simplificada: ángulo aumenta con u.
    const swirl = u * Math.PI * 3.5;
    const ang = swirl + armOffset + rotation;

    // Jitter determinístico para que las estrellas no formen una línea perfecta.
    const jx = (hash01(i) - 0.5) * 26 * (0.4 + u);
    const jy = (hash01(i + 1000) - 0.5) * 18 * (0.4 + u);

    const x = cx + Math.cos(ang) * u * maxR + jx;
    const y = cy + Math.sin(ang) * u * maxR * 0.45 + jy;

    // Centro brillante, brazos más tenues.
    const fade = 1 - u * 0.85;
    const size = Math.max(0.6, 1.6 - u * 1.0);
    const color = u < 0.35 ? palette.accent2 : palette.accent;
    drawDot(ctx, x, y, size, color, alpha * fade * 0.85);
  }

  // Núcleo galáctico: halo grande + punto blanco.
  drawHalo(ctx, cx, cy, maxR * 0.22, palette.accent, alpha * 0.7);
  drawCore(ctx, cx, cy, maxR * 0.04, alpha);
}

// 11. UNIVERSO — campo de mini-galaxias dispersas con leve parallax y multicolor.
function renderUniverso(rc) {
  const { ctx, cx, cy, W, H, time, alpha, palette } = rc;
  const N = 18;

  for (let i = 0; i < N; i++) {
    // Posición pseudo-aleatoria pero estable por i.
    const sx = hash01(i + 1);
    const sy = hash01(i + 999);

    // "Profundidad" 0.3..1: las cercanas son más grandes y se mueven más con el parallax.
    const depth = 0.3 + hash01(i + 50) * 0.7;
    const baseX = cx + (sx - 0.5) * W * 0.92;
    const baseY = cy + (sy - 0.5) * H * 0.92;

    const parX = Math.sin(time * 0.05 * depth + i) * 12 * (1 - depth);
    const parY = Math.cos(time * 0.07 * depth + i) * 12 * (1 - depth);

    const gx = baseX + parX;
    const gy = baseY + parY;
    const gR = Math.min(W, H) * 0.045 * depth;

    // Color por hash. Un poco saturado para el efecto multicolor.
    const hue = (hash01(i + 7) * 360 + time * 4) % 360;
    const color = hslToRgb(hue, 70, 65);

    drawMiniGalaxia(ctx, gx, gy, gR, time * (0.25 + hash01(i + 200) * 0.4) + i, color, alpha * depth * 0.85);
  }
}

// Helper para Universo: una espiral pequeña de 14 partículas + núcleo.
function drawMiniGalaxia(ctx, cx, cy, R, t, color, alpha) {
  const N = 14;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const ang = u * Math.PI * 4 + t;
    const r = u * R;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.55;
    drawDot(ctx, x, y, Math.max(0.5, 1.4 * (1 - u)), color, alpha * (1 - u * 0.5));
  }
  drawDot(ctx, cx, cy, 1.4, color, alpha);
  drawHalo(ctx, cx, cy, R * 0.5, color, alpha * 0.5);
}

// Tabla por era. Visuals.render() despacha por índice.
const ENTITY_RENDERERS = [
  renderVacio,
  renderParticula,
  renderAtomo,
  renderMolecula,
  renderCelula,
  renderOrganismo,
  renderEspecie,
  renderCivilizacion,
  renderPlaneta,
  renderSistemaSolar,
  renderGalaxia,
  renderUniverso,
];
