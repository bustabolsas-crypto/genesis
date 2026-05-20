'use strict';

/* ============================================
   ui.js — todo lo que toca el DOM (no canvas).
   - Cabecera (energía, eps, era, barra de progreso, badge de CU).
   - Tarjetas de generadores con compra y estado disabled.
   - Notificación de nueva era.
   - Modal genérico reutilizable: prestige, offline, settings, confirms.
   - Botón Big Bang flotante (visible al alcanzar Universo).
   ============================================ */

// ============================================
// MODAL — utilidad reutilizable.
// Uso:
//   Modal.show({ title, body, buttons: [{ label, primary?, onClick }] });
//   Modal.hide();
// `body` puede ser string (HTML) o un Node.
// ============================================
const Modal = {
  els: {},

  init() {
    this.els = {
      overlay: document.getElementById('modal-overlay'),
      title:   document.getElementById('modal-title'),
      body:    document.getElementById('modal-body'),
      actions: document.getElementById('modal-actions'),
    };
    // Click en el backdrop cierra el modal salvo que se haya marcado dismissible:false.
    this.els.overlay.addEventListener('click', (e) => {
      if (e.target === this.els.overlay && this._dismissible !== false) this.hide();
    });
    // Esc también cierra (si dismissible).
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen() && this._dismissible !== false) this.hide();
    });
  },

  show({ title = '', body = '', buttons = [], dismissible = true }) {
    this._dismissible = dismissible;
    this.els.title.textContent = title;

    // body puede ser string (innerHTML) o un Node ya construido.
    this.els.body.innerHTML = '';
    if (typeof body === 'string') {
      this.els.body.innerHTML = body;
    } else if (body instanceof Node) {
      this.els.body.appendChild(body);
    }

    this.els.actions.innerHTML = '';
    for (const btn of buttons) {
      const b = document.createElement('button');
      b.className = 'btn' + (btn.primary ? ' btn-primary' : '');
      b.textContent = btn.label;
      b.type = 'button';
      b.addEventListener('click', () => {
        // Cerramos ANTES de correr onClick. Si el handler abre otro modal,
        // ese se queda visible (sino el hide() posterior lo cerraría
        // al instante). Antes: bug del "Reiniciar todo" — la segunda
        // confirmación aparecía y desaparecía sin que el usuario la viera.
        if (btn.closeOnClick !== false) this.hide();
        if (btn.onClick) btn.onClick();
      });
      this.els.actions.appendChild(b);
    }

    this.els.overlay.hidden = false;
  },

  hide() { this.els.overlay.hidden = true; },
  isOpen() { return !this.els.overlay.hidden; },
};

// ============================================
// UI principal.
// ============================================
const UI = {
  els: {},
  generatorEls: {},   // id → { card, owned, cost }
  upgradeEls: {},     // id → { card, cost }
  lastEnergyShown: -1,
  lastEraRendered: -1,

  // Suavizado del contador de energía: el número mostrado se acerca
  // al valor real con un lerp por frame (sólo al subir; al gastar es seco).
  displayedEnergy: 0,

  init() {
    this.els = {
      energyValue:    document.getElementById('energy-value'),
      rateValue:      document.getElementById('rate-value'),
      eraName:        document.getElementById('era-name'),
      progressFill:   document.getElementById('progress-fill'),
      hint:           document.getElementById('hint'),
      btnSave:        document.getElementById('btn-save'),
      btnSettings:    document.getElementById('btn-settings'),
      btnBigbang:     document.getElementById('btn-bigbang'),
      generatorsList: document.getElementById('generators-list'),
      upgradesList:   document.getElementById('upgrades-list'),
      eraNotif:       document.getElementById('era-notification'),
      eraNotifName:   document.getElementById('era-notification-name'),
      eraNotifPre:    document.getElementById('era-notification-pre'),
      eraFlash:       document.getElementById('era-flash'),
      cuBadge:        document.getElementById('cu-badge'),
      cuBadgeValue:   document.getElementById('cu-badge-value'),
      // Combate
      hpBarFill:      document.getElementById('hp-bar-fill'),
      hpBarText:      document.getElementById('hp-bar-text'),
      coinValue:      document.getElementById('coin-value'),
      bossBarContainer: document.getElementById('boss-bar-container'),
      bossBarLabel:   document.getElementById('boss-bar-label'),
      bossBarFill:    document.getElementById('boss-bar-fill'),
    };

    this.els.btnSave.addEventListener('click', () => {
      Game.state.lastSaved = Date.now();
      const ok = Save.save(Game.state);
      this.flash(this.els.btnSave, ok ? 'Guardado ✓' : 'Error');
    });

    this.els.btnSettings.addEventListener('click', () => this.showSettings());

    this.els.btnBigbang.addEventListener('click', () => {
      Prestige.showModal();
    });

    this.els.btnBoost = document.getElementById('btn-boost');
    if (this.els.btnBoost) {
      this.els.btnBoost.addEventListener('click', () => {
        const ok = Game.activatePowerUp('energyX2');
        if (!ok) this.flash(this.els.btnBoost, 'Recargando...', 1200);
      });
    }
  },

  // Llamado cada frame con el estado actual.
  update(state) {
    // ----- Energía: contador con suavizado al subir, salto al gastar -----
    const target = state.energy;
    if (target < this.displayedEnergy) {
      // Gastó: feedback inmediato.
      this.displayedEnergy = target;
    } else {
      // Subiendo: lerp para que el número "fluya".
      const diff = target - this.displayedEnergy;
      if (diff < 0.5) this.displayedEnergy = target;
      else this.displayedEnergy += diff * 0.18;
    }

    const energyInt = Math.floor(this.displayedEnergy);
    if (energyInt !== this.lastEnergyShown) {
      this.els.energyValue.textContent = formatNumber(energyInt);
      this.lastEnergyShown = energyInt;
      // Pop visual: reiniciamos la animación quitando y reañadiendo la clase.
      this.els.energyValue.classList.remove('pop');
      void this.els.energyValue.offsetWidth;
      this.els.energyValue.classList.add('pop');
    }

    // ----- Ratio y era -----
    this.els.rateValue.textContent = formatNumber(state.eps || 0);
    const stage = STAGES[state.eraIndex] || STAGES[0];
    this.els.eraName.textContent = stage.name;

    // Progreso a la siguiente era.
    const next = STAGES[state.eraIndex + 1];
    if (next) {
      const ratio = Math.min(1, Math.max(0, state.energy / next.unlockAt));
      this.els.progressFill.style.width = (ratio * 100).toFixed(1) + '%';
    } else {
      this.els.progressFill.style.width = '100%';
    }

    if (state.totalClicks > 0) this.els.hint.classList.add('hidden');

    // ----- Botón Big Bang: visible al llegar al Universo -----
    this.els.btnBigbang.hidden = state.eraIndex < 11;

    // ----- Badge de CU: visible cuando hay CU acumuladas -----
    const cu = state.cu || 0;
    if (cu > 0) {
      this.els.cuBadge.hidden = false;
      this.els.cuBadgeValue.textContent = formatNumber(Prestige.multiplier());
    } else {
      this.els.cuBadge.hidden = true;
    }

    // ----- Generadores y Mejoras -----
    if (this.lastEraRendered !== state.eraIndex) {
      this.renderGenerators(state);
      this.renderUpgrades(state);
      this.lastEraRendered = state.eraIndex;
    }
    this.refreshGenerators(state);
    this.refreshUpgrades(state);

    // ----- Power-ups activos -----
    this.updateBuffDisplay(state);

    // ----- Combate: HP y monedas -----
    this.updateCombatHUD(state);

    // ----- Tutorial -----
    Tutorial.check(state);
  },

  // Actualiza el botón de boost y el glow de fondo según el estado de buffs.
  updateBuffDisplay(state) {
    const btn = this.els.btnBoost;
    if (!btn) return;
    const now = Date.now();
    const activeBuff   = state.activeBuffs   && state.activeBuffs['energyX2'];
    const cooldownEnds = state.buffCooldowns && state.buffCooldowns['energyX2'];

    if (activeBuff && activeBuff.endsAtMs > now) {
      const remaining = Math.ceil((activeBuff.endsAtMs - now) / 1000);
      btn.textContent = '⚡ ' + formatTime(remaining);
      btn.classList.add('buff-on');
      btn.disabled = true;
      document.body.classList.add('buff-active');
    } else if (cooldownEnds && cooldownEnds > now) {
      const remaining = Math.ceil((cooldownEnds - now) / 1000);
      btn.textContent = '⚡×2 (' + formatTime(remaining) + ')';
      btn.classList.remove('buff-on');
      btn.disabled = true;
      document.body.classList.remove('buff-active');
    } else {
      btn.textContent = '⚡ Energía ×2';
      btn.classList.remove('buff-on');
      btn.disabled = false;
      document.body.classList.remove('buff-active');
    }
  },

  // Notificación de boost expirado (reutiliza el mismo sistema de era-notification).
  showBuffExpiredNotification(name) {
    this.showEraNotification(name + ' terminado', 'Power-up');
  },

  // Actualiza la barra de HP, monedas y la barra del jefe
  updateCombatHUD(state) {
    // Barra de HP
    const hpRatio = Math.max(0, Math.min(1, state.hp / state.maxHp));
    if (this.els.hpBarFill) {
      this.els.hpBarFill.style.width = (hpRatio * 100).toFixed(1) + '%';
      // Color: verde → amarillo → rojo según vida restante
      const hue = Math.round(hpRatio * 120);
      this.els.hpBarFill.style.background =
        `linear-gradient(90deg, hsl(${hue},90%,45%), hsl(${hue},80%,60%))`;
    }
    if (this.els.hpBarText) {
      this.els.hpBarText.textContent = Math.ceil(state.hp) + ' / ' + state.maxHp;
    }
    // Indicador de debilitación
    const debilited = state.debilitatedUntil && Date.now() < state.debilitatedUntil;
    if (this.els.hpBarFill) {
      this.els.hpBarFill.classList.toggle('debilitated', !!debilited);
    }

    // Contador de monedas
    if (this.els.coinValue) {
      this.els.coinValue.textContent = formatNumber(state.coins || 0);
    }

    // Barra del jefe
    if (this.els.bossBarContainer) {
      if (Combat.mode === 'boss') {
        const boss = Combat.enemies.find(e => e.isBoss && e.alive);
        if (boss) {
          this.els.bossBarContainer.hidden = false;
          if (this.els.bossBarLabel) this.els.bossBarLabel.textContent = boss.name;
          if (this.els.bossBarFill) {
            this.els.bossBarFill.style.width = (Math.max(0, boss.hp / boss.maxHp) * 100).toFixed(1) + '%';
          }
        } else {
          this.els.bossBarContainer.hidden = true;
        }
      } else {
        this.els.bossBarContainer.hidden = true;
      }
    }
  },

  // Notificación de aparición de jefe (usa el mismo sistema de era-notification)
  showBossWarning(bossName) {
    this.showEraNotification(bossName, '¡Jefe!');
    if (this.els.eraFlash) {
      this.els.eraFlash.classList.remove('show', 'big');
      void this.els.eraFlash.offsetWidth;
      this.els.eraFlash.classList.add('show', 'big');
    }
  },

  showBossWindup() {
    this.showEraNotification('¡ESPECIAL!', 'Interrumpí con 5 clicks');
  },

  showBossInterrupted() {
    this.showEraNotification('Interrumpido', '¡Bien hecho!');
  },

  showDebilitationNotification() {
    this.showEraNotification('Debilitado −10% EPS', '¡Cuidado!');
  },

  showDeathModal({ newEraName = '—', genLosses = {} } = {}) {
    // Construir lista de generadores perdidos con sus nombres legibles
    const genNames = {};
    for (const stage of STAGES) {
      for (const gen of stage.generators) genNames[gen.id] = gen.name;
    }
    const lostEntries = Object.entries(genLosses).filter(([, n]) => n > 0);
    const genListHtml = lostEntries.length
      ? '<ul class="reset-list" style="margin-top:8px">'
        + lostEntries.map(([id, n]) => `<li>${genNames[id] || id}: −${n}</li>`).join('')
        + '</ul>'
      : '<p class="dim" style="margin-top:6px">Sin generadores que perder.</p>';

    Modal.show({
      title: 'Perdiste el control',
      body: `
        <p class="modal-lead">Caíste dos veces en 5 minutos. El universo retrocedió.</p>
        <dl class="kv">
          <dt>Era reducida a</dt><dd class="hilite">${newEraName}</dd>
          <dt>Energía</dt><dd>−50%</dd>
          <dt>Generadores</dt><dd>−50% c/u</dd>
        </dl>
        ${genListHtml}
      `,
      buttons: [{ label: 'Continuar', primary: true }],
    });
  },

  // Construye/actualiza las tarjetas de generadores. Sólo añade las que faltan.
  renderGenerators(state) {
    const list = this.els.generatorsList;

    const visibleGens = [];
    for (let i = 0; i <= state.eraIndex; i++) {
      const stage = STAGES[i];
      if (!stage) continue;
      for (const g of stage.generators) visibleGens.push(g);
    }

    const empty = list.querySelector('.empty');
    if (visibleGens.length === 0) {
      if (!empty) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'Aún no hay generadores. Sigue haciendo click.';
        list.appendChild(p);
      }
      return;
    }
    if (empty) empty.remove();

    let staggerIdx = 0;
    for (const g of visibleGens) {
      if (this.generatorEls[g.id]) continue;
      const card = document.createElement('div');
      card.className = 'generator';
      card.dataset.id = g.id;
      card.innerHTML = `
        <div class="gen-name">${g.name}</div>
        <div class="gen-owned" data-role="owned">×0</div>
        <div class="gen-prod">+${formatNumber(g.baseProduction)} E/seg c/u</div>
        <div class="gen-cost" data-role="cost">${formatNumber(g.baseCost)} E</div>
      `;
      card.addEventListener('click', () => this.onBuy(g.id, card));
      card.style.animationDelay = (staggerIdx * 80) + 'ms';
      staggerIdx++;
      list.appendChild(card);
      this.generatorEls[g.id] = {
        card,
        owned: card.querySelector('[data-role="owned"]'),
        cost:  card.querySelector('[data-role="cost"]'),
      };
    }
  },

  refreshGenerators(state) {
    for (const id in this.generatorEls) {
      const els = this.generatorEls[id];
      const gen = findGenerator(id);
      if (!gen) continue;
      const owned = state.generators[id] || 0;
      const cost = generatorCost(gen, owned);
      els.owned.textContent = '×' + owned;
      els.cost.textContent = formatNumber(cost) + ' E';
      els.card.classList.toggle('disabled', state.energy < cost);
    }
  },

  onBuy(id, card) {
    const ok = Game.buyGenerator(id);
    if (!ok) return;
    card.classList.remove('bought');
    void card.offsetWidth;
    card.classList.add('bought');
  },

  // ----- Mejoras de click (compras únicas, una por id) -----

  // Construye/actualiza las tarjetas de mejoras de click visibles.
  // Sólo aparecen las que están en eras desbloqueadas y no compradas aún.
  renderUpgrades(state) {
    const list = this.els.upgradesList;
    const visible = CLICK_UPGRADES.filter(u =>
      u.era <= state.eraIndex && !state.upgrades[u.id]
    );

    // Limpiar y reconstruir desde cero. Es barato (máx 22 mejoras).
    list.innerHTML = '';
    this.upgradeEls = {};

    if (visible.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = state.eraIndex < 1
        ? 'Aparecen al desbloquear nuevas eras.'
        : 'Todas las mejoras adquiridas. Avanzá de era para más.';
      list.appendChild(p);
      return;
    }

    let staggerIdx = 0;
    for (const u of visible) {
      const card = document.createElement('div');
      card.className = 'upgrade';
      card.dataset.id = u.id;
      const effectStr = u.kind === 'mult'
        ? '×' + u.value + ' click'
        : '+' + formatNumber(u.value) + ' click';
      card.innerHTML = `
        <div class="upg-name">${u.name}</div>
        <div class="upg-effect">${effectStr}</div>
        <div class="upg-cost" data-role="cost">${formatNumber(u.cost)} E</div>
      `;
      card.addEventListener('click', () => this.onBuyUpgrade(u.id, card));
      card.style.animationDelay = (staggerIdx * 60) + 'ms';
      staggerIdx++;
      list.appendChild(card);
      this.upgradeEls[u.id] = {
        card,
        cost: card.querySelector('[data-role="cost"]'),
      };
    }
  },

  // Sólo actualiza el estado disabled (energía suficiente o no).
  refreshUpgrades(state) {
    for (const id in this.upgradeEls) {
      const els = this.upgradeEls[id];
      const u = findUpgrade(id);
      if (!u) continue;
      els.card.classList.toggle('disabled', state.energy < u.cost);
    }
  },

  onBuyUpgrade(id, card) {
    const ok = Game.buyUpgrade(id);
    if (!ok) return;
    // Animación de "comprado" y luego desaparece. Igual no se vuelve a
    // crear porque state.upgrades[id] = true.
    card.classList.add('bought', 'fading');
    setTimeout(() => {
      card.remove();
      delete this.upgradeEls[id];
      // Si no queda ninguna mejora visible, mostrar placeholder.
      if (Object.keys(this.upgradeEls).length === 0) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'Todas las mejoras adquiridas. Avanzá de era para más.';
        this.els.upgradesList.appendChild(p);
      }
    }, 320);
  },

  // "+X" flotante que aparece arriba del punto de click. Coords en
  // viewport (clientX/Y) para que coincida con el cursor.
  spawnFloatingText(clientX, clientY, value) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = '+' + formatNumber(value);
    el.style.left = clientX + 'px';
    el.style.top  = clientY + 'px';
    document.body.appendChild(el);
    // El elemento se autoremoveá tras la animación CSS (~1s).
    setTimeout(() => el.remove(), 1100);
  },

  // Notificación grande centrada + flash de pantalla opcional.
  showEraNotification(name, preText = 'Nueva era') {
    this.els.eraNotifName.textContent = name;
    if (this.els.eraNotifPre) this.els.eraNotifPre.textContent = preText;
    this.els.eraNotif.classList.remove('show');
    void this.els.eraNotif.offsetWidth;
    this.els.eraNotif.classList.add('show');

    this.els.eraFlash.classList.remove('show', 'big');
    void this.els.eraFlash.offsetWidth;
    this.els.eraFlash.classList.add('show');
  },

  flash(el, text, ms = 900) {
    const original = el.dataset.original || el.textContent;
    el.dataset.original = original;
    el.textContent = text;
    clearTimeout(el._flashTimer);
    el._flashTimer = setTimeout(() => { el.textContent = original; }, ms);
  },

  // ----------- Modal de bienvenida con la energía ganada offline -----------
  showOfflineModal({ energy, seconds, efficiency }) {
    const effStr = efficiency != null ? efficiency + '% de eficiencia' : '50% de eficiencia';
    Modal.show({
      title: '¡Bienvenido de vuelta!',
      body: `
        <p>Mientras no estabas, tu universo siguió creciendo.</p>
        <p class="big-stat">+${formatNumber(energy)} <span class="dim">Energía</span></p>
        <p class="dim">Estuviste ausente ${formatTime(seconds)} · ${effStr}</p>
      `,
      buttons: [
        { label: 'Reclamar', primary: true, onClick: () => Game.collectOffline(energy) },
      ],
      dismissible: false,
    });
  },

  // ----------- Panel de ajustes -----------
  showSettings() {
    const state = Game.state;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="settings">
        <label class="settings-row">
          <input type="checkbox" id="set-sound" ${state.soundEnabled ? 'checked' : ''}>
          <span>Sonidos</span>
          <span class="dim">próximamente</span>
        </label>

        <div class="settings-row">
          <button class="btn" id="set-export">Exportar partida</button>
          <button class="btn" id="set-import">Importar partida</button>
        </div>

        <div class="settings-row">
          <button class="btn btn-ghost danger" id="set-reset">Reiniciar todo</button>
        </div>

        <h3 class="settings-h3">Estadísticas</h3>
        <dl class="kv">
          <dt>Tiempo total</dt><dd>${formatTime(state.timePlayedSeconds)}</dd>
          <dt>Big Bangs</dt><dd>${state.bigBangs}</dd>
          <dt>Era más alta</dt><dd>${STAGES[state.highestEra].name}</dd>
          <dt>E histórica</dt><dd>${formatNumber(state.totalEnergyEarned)}</dd>
          <dt>CU acumuladas</dt><dd>${formatNumber(state.cu)}</dd>
          <dt>Multiplicador</dt><dd>×${formatNumber(Prestige.multiplier())}</dd>
        </dl>
      </div>
    `;

    Modal.show({
      title: 'Ajustes',
      body,
      buttons: [{ label: 'Cerrar' }],
    });

    // Bind handlers (los elementos ya están en el DOM).
    document.getElementById('set-sound').addEventListener('change', (e) => {
      state.soundEnabled = e.target.checked;
      // Por ahora el toggle sólo guarda la preferencia. Sonidos se implementan después.
    });
    document.getElementById('set-export').addEventListener('click', (e) => this.exportSave(e.target));
    document.getElementById('set-import').addEventListener('click', () => this.showImport());
    document.getElementById('set-reset').addEventListener('click', () => this.confirmResetAll());
  },

  // Genera string base64 del save y lo copia al portapapeles.
  exportSave(btn) {
    Game.state.lastSaved = Date.now();
    const json = JSON.stringify(Game.state);
    // Encoding seguro para UTF-8 (acentos, ñ, símbolos científicos).
    const b64 = btoa(unescape(encodeURIComponent(json)));

    const fallback = () => {
      // Si clipboard API no está disponible, ofrecemos copiar manual.
      Modal.show({
        title: 'Exportar partida',
        body: `
          <p>Copiá este texto y guardalo:</p>
          <textarea readonly class="export-text">${b64}</textarea>
        `,
        buttons: [{ label: 'Cerrar' }],
      });
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(b64).then(
        () => { if (btn) this.flash(btn, '✓ Copiado'); },
        () => fallback()
      );
    } else {
      fallback();
    }
  },

  // Modal con textarea para pegar un save base64.
  showImport() {
    const body = document.createElement('div');
    body.innerHTML = `
      <p>Pegá tu save (texto en base64) acá. Vas a perder el progreso actual.</p>
      <textarea id="import-text" rows="4" class="export-text" placeholder="eyJlbmVyZ3kiOi4uLn0="></textarea>
    `;
    Modal.show({
      title: 'Importar partida',
      body,
      buttons: [
        { label: 'Cancelar' },
        { label: 'Importar', primary: true, onClick: () => this.doImport(), closeOnClick: false },
      ],
    });
  },

  doImport() {
    const txt = document.getElementById('import-text').value.trim();
    if (!txt) return;
    try {
      const json = decodeURIComponent(escape(atob(txt)));
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object') throw new Error('formato');
      // Validamos un par de campos clave para no aceptar basura.
      if (typeof obj.energy !== 'number' || typeof obj.eraIndex !== 'number') {
        throw new Error('campos requeridos faltan');
      }
      Save.save(obj);
      Modal.hide();
      location.reload();
    } catch (e) {
      // Mostramos el error sin perder el textarea.
      const status = document.createElement('p');
      status.className = 'warn';
      status.textContent = 'Save inválido: ' + e.message;
      const body = document.getElementById('modal-body');
      const prev = body.querySelector('.warn');
      if (prev) prev.remove();
      body.appendChild(status);
    }
  },

  // Reset total: confirmación única con resumen de lo que se pierde.
  confirmResetAll() {
    const cu = Game.state.cu || 0;
    const bb = Game.state.bigBangs || 0;
    Modal.show({
      title: 'Reiniciar todo',
      body: `
        <p>Esto borra <strong>todo</strong> el progreso del save actual:</p>
        <ul class="reset-list">
          <li>Energía y era actual</li>
          <li>Generadores y mejoras de click</li>
          <li>${formatNumber(cu)} CU acumuladas y ${bb} Big Bangs</li>
          <li>Estadísticas globales</li>
        </ul>
        <p class="warn">No se puede deshacer.</p>
      `,
      buttons: [
        { label: 'Cancelar' },
        { label: 'Sí, borrar todo', primary: true, onClick: () => {
          // Parar el auto-save antes de borrar, para que el setInterval no
          // escriba el estado actual entre Save.clear() y la recarga.
          if (Game.autoSaveTimer) {
            clearInterval(Game.autoSaveTimer);
            Game.autoSaveTimer = null;
          }
          Save.clear();
          location.reload();
        } },
      ],
    });
  },
};

/* ============================================
   formatNumber: 1234 → "1.23K", 5e6 → "5M", 1e35 → "1.00e35".
   - Hasta 1e30: usa sufijos cortos (K, M, B, T, Qa, Qi, Sx, Sp, Oc).
   - 1e30 en adelante: notación científica (cubre hasta 1e303 sin overflow).
   ============================================ */
const NUMBER_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];

function formatNumber(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) {
    return Number.isInteger(n) ? n.toString() : n.toFixed(1);
  }
  if (n >= 1e30) {
    // toExponential(2) → "5.43e+54"; quitamos el "+" para compactar.
    return n.toExponential(2).replace('e+', 'e');
  }
  const tier = Math.floor(Math.log10(n) / 3);
  const scaled = n / Math.pow(10, tier * 3);
  const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return scaled.toFixed(decimals) + NUMBER_SUFFIXES[tier];
}
