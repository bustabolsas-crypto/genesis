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
      gemValue:       document.getElementById('gem-value'),
      evoValue:       document.getElementById('evo-value'),
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

    this.els.btnArsenal = document.getElementById('btn-arsenal');
    if (this.els.btnArsenal) {
      this.els.btnArsenal.addEventListener('click', () => Arsenal.show());
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

    // Contadores de monedas, gemas y puntos de evolución
    if (this.els.coinValue) {
      this.els.coinValue.textContent = formatNumber(state.coins || 0);
    }
    if (this.els.gemValue) {
      this.els.gemValue.textContent = formatNumber(state.gems || 0);
    }
    if (this.els.evoValue) {
      this.els.evoValue.textContent = formatNumber(state.evoPoints || 0);
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

  showWeaponDropNotification(wid) {
    const def = WEAPON_DEFS[wid];
    if (!def) return;
    this.showEraNotification('¡' + def.nombre + ' obtenida!', '¡Nueva arma!');
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
   ARSENAL — SVG helpers, iconos y modal.
   ============================================ */

// ── SVG factory helpers ──
function _svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function _svgPath(d, stroke, fill, sw) {
  return _svgEl('path', { d, stroke: stroke || 'currentColor', fill: fill || 'none',
    'stroke-width': sw || 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
}
function _svgCircle(cx, cy, r, stroke, fill, sw) {
  return _svgEl('circle', { cx, cy, r, stroke: stroke || 'currentColor',
    fill: fill || 'none', 'stroke-width': sw || 2.5 });
}
function _svgEllipse(cx, cy, rx, ry, stroke, fill, sw, transform) {
  const a = { cx, cy, rx, ry, stroke: stroke || 'currentColor',
    fill: fill || 'none', 'stroke-width': sw || 2 };
  if (transform) a.transform = transform;
  return _svgEl('ellipse', a);
}
function _svgPoly(points, stroke, fill, sw) {
  return _svgEl('polygon', { points, stroke: stroke || 'currentColor',
    fill: fill || 'none', 'stroke-width': sw || 2.5 });
}

// ── Iconos de armas (26) ─ espacio 64×64, cuerpo útil 8–56 ──
const WEAPON_ICONS = {
  pulso_cuantico(s, c) {
    s.appendChild(_svgPath('M 32 10 L 24 30 L 32 30 L 24 54', c, 'none', 3));
    s.appendChild(_svgPath('M 32 10 L 40 30 L 32 30', c, 'none', 3));
  },
  onda_probabilidad(s, c) {
    s.appendChild(_svgPath('M 8 32 L 18 18 L 28 46 L 38 18 L 48 32', c, 'none', 2.5));
  },
  microexplosion(s, c) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const x1 = 32 + 9 * Math.cos(a + Math.PI / 8), y1 = 32 + 9 * Math.sin(a + Math.PI / 8);
      const x2 = 32 + 24 * Math.cos(a),               y2 = 32 + 24 * Math.sin(a);
      s.appendChild(_svgPath(`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`, c, 'none', 2));
    }
    s.appendChild(_svgCircle(32, 32, 6, c, c + '55'));
  },
  bit_cuantico(s, c) {
    s.appendChild(_svgCircle(32, 32, 18, c, 'none', 1));
    s.appendChild(_svgCircle(32, 32, 11, c, 'none', 1.5));
    s.appendChild(_svgCircle(32, 32, 4, c, c));
  },
  campo_fuerza(s, c) {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = i * Math.PI / 3 - Math.PI / 6;
      return `${(32 + 20 * Math.cos(a)).toFixed(1)},${(32 + 20 * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    s.appendChild(_svgPoly(pts, c, c + '22'));
    s.appendChild(_svgPath('M 32 18 L 32 44 M 22 26 L 42 26', c, 'none', 1.5));
  },
  foton_solitario(s, c) {
    s.appendChild(_svgPath('M 32 8 L 32 56 M 8 32 L 56 32', c, 'none', 3));
    s.appendChild(_svgPath('M 18 18 L 46 46 M 46 18 L 18 46', c, 'none', 1.5));
    s.appendChild(_svgCircle(32, 32, 4, c, c));
  },
  onda_coherente(s, c) {
    s.appendChild(_svgPath('M 8 24 Q 18 14 28 24 Q 38 34 48 24 Q 54 18 56 20', c, 'none', 2.5));
    s.appendChild(_svgPath('M 8 40 Q 18 30 28 40 Q 38 50 48 40 Q 54 34 56 36', c, 'none', 2.5));
  },
  campo_singular(s, c) {
    s.appendChild(_svgCircle(32, 32, 20, c, 'none', 1));
    s.appendChild(_svgCircle(32, 32, 13, c, 'none', 1.5));
    s.appendChild(_svgCircle(32, 32, 6, c, c + '44'));
  },
  sierra_molecular(s, c) {
    const pts = Array.from({ length: 12 }, (_, i) => {
      const a = i * Math.PI / 6, r = i % 2 === 0 ? 22 : 12;
      return `${(32 + r * Math.cos(a)).toFixed(1)},${(32 + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    s.appendChild(_svgPoly(pts, c, c + '33', 2));
  },
  lanza_enlaces(s, c) {
    s.appendChild(_svgPath('M 14 32 A 7 10 0 1 0 14 32.1', c, 'none', 2));
    s.appendChild(_svgPath('M 32 32 A 7 10 0 1 0 32 32.1', c, 'none', 2));
    s.appendChild(_svgPath('M 50 32 A 7 10 0 1 0 50 32.1', c, 'none', 2));
    s.appendChild(_svgPath('M 21 32 L 25 32 M 39 32 L 43 32', c, 'none', 2));
  },
  acelerador_ionico(s, c) {
    s.appendChild(_svgPath('M 12 32 L 46 32 L 39 24 M 46 32 L 39 40', c, 'none', 2.5));
    s.appendChild(_svgPath('M 10 40 Q 15 36 12 30', c, 'none', 1.5));
    s.appendChild(_svgPath('M 7 37 Q 11 33 9 27', c + '66', 'none', 1));
  },
  satelite_orbital(s, c) {
    s.appendChild(_svgCircle(32, 32, 18, c, 'none', 2));
    s.appendChild(_svgCircle(32, 14, 5, c, c));
  },
  vinculo_reactivo(s, c) {
    s.appendChild(_svgCircle(18, 32, 9, c, c + '22'));
    s.appendChild(_svgCircle(46, 32, 9, c, c + '22'));
    s.appendChild(_svgPath('M 27 32 L 37 32', c, 'none', 2));
    s.appendChild(_svgCircle(18, 32, 3, c, c));
    s.appendChild(_svgCircle(46, 32, 3, c, c));
  },
  rafaga_ionica(s, c) {
    s.appendChild(_svgPath('M 16 32 L 48 18 M 44 15 L 48 18 L 45 22', c, 'none', 2));
    s.appendChild(_svgPath('M 16 32 L 52 32 M 48 29 L 52 32 L 48 35', c, 'none', 2));
    s.appendChild(_svgPath('M 16 32 L 48 46 M 44 42 L 48 46 L 45 46', c, 'none', 2));
  },
  aguijon_neural(s, c) {
    s.appendChild(_svgPath('M 32 10 L 32 50 L 28 44 M 32 50 L 36 44', c, 'none', 2.5));
    s.appendChild(_svgPath('M 22 22 L 42 22 M 24 28 L 40 28', c, 'none', 2));
  },
  espora_toxica(s, c) {
    s.appendChild(_svgPath('M 20 32 Q 10 32 10 24 Q 10 15 20 16 Q 22 9 32 10 Q 42 9 44 16 Q 54 15 54 24 Q 54 32 44 32 Z', c, c + '22', 2));
    s.appendChild(_svgCircle(22, 38, 2.5, c, c));
    s.appendChild(_svgCircle(32, 42, 2.5, c, c));
    s.appendChild(_svgCircle(42, 38, 2.5, c, c));
  },
  pulso_bioluminiscente(s, c) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, sw = i % 2 === 0 ? 2.5 : 1.5;
      s.appendChild(_svgPath(`M 32 32 L ${(32 + 22 * Math.cos(a)).toFixed(1)} ${(32 + 22 * Math.sin(a)).toFixed(1)}`, c, 'none', sw));
    }
    s.appendChild(_svgCircle(32, 32, 6, c, c + '55'));
  },
  tendon_reflejo(s, c) {
    s.appendChild(_svgPath('M 24 10 Q 46 20 24 32 Q 2 44 24 54', c, 'none', 3));
    s.appendChild(_svgCircle(24, 10, 3.5, c, c));
  },
  espiral_genomica(s, c) {
    s.appendChild(_svgPath('M 22 10 Q 42 20 22 32 Q 2 44 22 54', c, 'none', 2));
    s.appendChild(_svgPath('M 42 10 Q 22 22 42 32 Q 62 44 42 54', c, 'none', 2));
    for (const y of [20, 28, 36, 44]) {
      s.appendChild(_svgPath(`M 22 ${y} L 42 ${y}`, c, 'none', 1.5));
    }
  },
  tormenta_tectonica(s, c) {
    s.appendChild(_svgPath('M 8 42 Q 20 32 32 42 Q 44 52 56 42', c, 'none', 2.5));
    s.appendChild(_svgPath('M 8 30 Q 20 20 32 30 Q 44 40 56 30', c, 'none', 2));
    s.appendChild(_svgPath('M 12 18 Q 22 10 32 18 Q 42 26 52 18', c, 'none', 1.5));
  },
  geyser_magmatico(s, c) {
    s.appendChild(_svgPath('M 32 54 L 32 16', c, 'none', 4));
    s.appendChild(_svgPath('M 32 22 Q 24 30 28 38', c, 'none', 2));
    s.appendChild(_svgPath('M 32 22 Q 40 30 36 38', c, 'none', 2));
    s.appendChild(_svgPath('M 32 14 Q 27 20 32 26 Q 37 20 32 14', c, c + '55', 2));
  },
  cinturon_asteroides(s, c) {
    s.appendChild(_svgCircle(18, 44, 6, c, c + '44'));
    s.appendChild(_svgCircle(32, 26, 6, c, c + '44'));
    s.appendChild(_svgCircle(46, 44, 6, c, c + '44'));
    s.appendChild(_svgPath('M 18 44 Q 25 18 32 26 Q 39 34 46 44', c, 'none', 1.5));
  },
  canon_plasma_estelar(s, c) {
    s.appendChild(_svgPath('M 10 26 L 48 26 L 48 38 L 10 38 Z', c, c + '33', 2));
    s.appendChild(_svgPath('M 48 25 L 57 32 L 48 39', c, c, 2.5));
    s.appendChild(_svgPath('M 14 22 L 14 42 M 20 24 L 20 40', c, 'none', 2));
  },
  onda_magnetar(s, c) {
    for (const r of [22, 16, 10, 5]) {
      s.appendChild(_svgCircle(32, 32, r, c, 'none', r === 5 ? 2.5 : 1.5));
    }
    s.appendChild(_svgCircle(32, 32, 3, c, c));
  },
  singularidad_devoradora(s, c) {
    s.appendChild(_svgCircle(32, 32, 9, c, '#060614', 2));
    s.appendChild(_svgEllipse(32, 32, 22, 9, c, 'none', 2));
    s.appendChild(_svgCircle(32, 32, 5, 'none', '#000000'));
  },
  colapso_cosmico(s, c) {
    s.appendChild(_svgCircle(32, 32, 5, c, c));
    for (let i = 0; i < 3; i++) {
      s.appendChild(_svgEllipse(32, 32, 22, 8, c, 'none', 2, `rotate(${i * 60} 32 32)`));
    }
  },
};

const Arsenal = {
  _selectedWeapon: null,
  _filterTier:     null,

  show() {
    this._selectedWeapon = null;
    Modal.show({
      title: 'Arsenal',
      body: this._buildBody(),
      buttons: [{ label: 'Cerrar', onClick: () => {
        const m = document.querySelector('.modal');
        if (m) m.classList.remove('modal--arsenal');
      }}],
    });
    const m = document.querySelector('.modal');
    if (m) m.classList.add('modal--arsenal');
  },

  // ── Puzzle piece SVG (viewBox -6 -6 76 76, cuerpo 8-56) ──
  _buildPuzzle(wid, owned, tierColor, size, level, evoStage) {
    const lv  = level    || 0;
    const evo = evoStage || 0;
    const svg = _svgEl('svg', {
      width: size, height: size,
      viewBox: '-6 -6 76 76',
    });
    svg.style.overflow = 'visible';
    svg.style.flexShrink = '0';
    svg.style.display = 'block';
    if (owned) svg.style.setProperty('--tc', tierColor);

    const bg = _svgEl('path', {
      d: 'M 8 8 L 26 8 Q 32 0 38 8 L 56 8 L 56 26 Q 64 32 56 38 L 56 56 L 8 56 Z',
      fill: owned ? tierColor + '28' : tierColor + '10',
      stroke: owned ? tierColor : tierColor + '88',
      'stroke-width': owned ? '2' : '1.5',
    });
    if (owned) bg.style.filter = `drop-shadow(0 0 5px ${tierColor}66)`;
    svg.appendChild(bg);

    const iconFn = WEAPON_ICONS[wid];
    if (iconFn) {
      const g = _svgEl('g', {});
      g.style.opacity = owned ? '1' : '0.45';
      iconFn(g, tierColor);
      svg.appendChild(g);
    }

    if (owned && lv > 0) {
      // Círculo de nivel — esquina superior derecha
      const badge = _svgEl('g', {});
      badge.appendChild(_svgCircle(52, 10, 9, 'none', tierColor));
      const txt = _svgEl('text', {
        x: '52', y: '10',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': '9', 'font-weight': '700',
        fill: '#07070d', 'font-family': 'Space Mono, monospace',
      });
      txt.textContent = String(lv);
      badge.appendChild(txt);
      svg.appendChild(badge);
    } else if (owned) {
      svg.appendChild(_svgPath('M 44 11 L 50 18 L 60 8', tierColor, 'none', 2.5));
    }

    // Badge de evolución — esquina superior izquierda (E1-E5)
    if (owned && evo > 0) {
      const evoBadge = _svgEl('g', {});
      if (evo >= 5) {
        // E5: estrella en círculo
        evoBadge.appendChild(_svgCircle(12, 10, 9, 'none', tierColor));
        const star = _svgEl('text', {
          x: '12', y: '10',
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': '9', fill: '#07070d',
        });
        star.textContent = '★';
        evoBadge.appendChild(star);
      } else {
        // E1-E4: número romano en círculo
        evoBadge.appendChild(_svgCircle(12, 10, 9, 'none', tierColor));
        const rtxt = _svgEl('text', {
          x: '12', y: '10',
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': '7', 'font-weight': '700',
          fill: '#07070d', 'font-family': 'Space Mono, monospace',
        });
        rtxt.textContent = EVO_ROMAN[evo] || '';
        evoBadge.appendChild(rtxt);
      }
      svg.appendChild(evoBadge);
    }

    return svg;
  },

  // ── Fila de fragmentos / estado de posesión ──
  _buildFragRow(wid, have, required, tierColor, owned, equippedIn) {
    const row = document.createElement('div');
    row.className = 'weapon-frag-row';

    if (owned) {
      const lbl = document.createElement('div');
      lbl.className = 'weapon-status-label';
      if (equippedIn >= 0) {
        lbl.textContent = 'Equipada · Slot ' + (equippedIn + 1);
        lbl.style.color = tierColor;
      } else {
        lbl.textContent = 'Disponible';
      }
      row.appendChild(lbl);
    } else {
      // Barra de fragmentos
      const barWrap = document.createElement('div');
      barWrap.className = 'weapon-frag-bar-wrap';

      const lbl = document.createElement('div');
      lbl.className = 'weapon-frag-label';
      lbl.textContent = have + ' / ' + required + ' frags';
      if (have >= required) lbl.style.color = tierColor;
      barWrap.appendChild(lbl);

      const track = document.createElement('div');
      track.className = 'weapon-frag-bar';
      const fill = document.createElement('div');
      fill.className = 'weapon-frag-bar-fill' + (have >= required ? ' frag-bar-full' : '');
      fill.style.width = Math.min(100, have / required * 100).toFixed(1) + '%';
      fill.style.background = have >= required
        ? `linear-gradient(90deg,${tierColor},${tierColor}cc)`
        : `linear-gradient(90deg,${tierColor}88,${tierColor}44)`;
      track.appendChild(fill);
      barWrap.appendChild(track);
      row.appendChild(barWrap);

      if (have >= required) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-forge frag-cap-ready';
        btn.textContent = 'Forjar';
        btn.style.setProperty('--fc', tierColor);
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._forge(wid, btn.closest('.weapon-card'));
        });
        row.appendChild(btn);
      }
    }
    return row;
  },

  _buildBody() {
    const state    = Game.state;
    const slots    = state.weaponSlots || [null, null, null];
    const inv      = state.weaponInventory || [];
    const eraIdx   = state.eraIndex;
    const eraScale = Math.pow(5, eraIdx);
    const frags    = state.fragments || {};

    const container = document.createElement('div');

    // ── 3 slots equipados ──
    const slotsDiv = document.createElement('div');
    slotsDiv.className = 'arsenal-slots';

    for (let si = 0; si < 3; si++) {
      const wid  = slots[si];
      const def  = wid ? WEAPON_DEFS[wid] : null;
      const card = document.createElement('div');
      card.className = 'arsenal-slot' + (def ? '' : ' slot--empty');

      const numDiv = document.createElement('div');
      numDiv.className = 'slot-number';
      numDiv.textContent = 'Slot ' + (si + 1);
      card.appendChild(numDiv);

      if (def) {
        const tierColor = TIER_COLORS[def.tier] || '#fff';
        const wLevel    = (state.weaponLevels && state.weaponLevels[wid]) || 0;
        const wEvo      = (state.weaponEvolutions && state.weaponEvolutions[wid]) || 0;
        card.style.setProperty('--tc', tierColor);

        card.appendChild(this._buildPuzzle(wid, true, tierColor, 68, wLevel, wEvo));

        const nameDiv = document.createElement('div');
        nameDiv.className = 'slot-weapon-name';
        nameDiv.textContent = def.nombre;
        nameDiv.style.color = tierColor;
        card.appendChild(nameDiv);

        const tierDiv = document.createElement('div');
        tierDiv.className = 'slot-weapon-tier';
        tierDiv.textContent = TIER_NAMES[def.tier] || def.tier;
        tierDiv.style.color = tierColor;
        card.appendChild(tierDiv);

        const slotEff = Weapons.getEffectiveStats(wid, state);
        const statsDiv = document.createElement('div');
        statsDiv.className = 'slot-weapon-stats';
        if (def.tipo !== 'shield' && def.tipo !== 'orbital' && def.tipo !== 'orbital_secondary') {
          const dmg = slotEff.damage;
          const dps = slotEff.attackInterval ? (dmg / (slotEff.attackInterval / 1000)).toFixed(1) : '—';
          statsDiv.textContent = formatNumber(dmg) + ' · ' + dps + ' dps';
        } else if (def.tipo === 'shield') {
          const shpMax = state.shieldMaxHp || slotEff.shieldMaxHp;
          const shpCur = Math.round(state.shieldHp || 0);
          statsDiv.textContent = state.shieldBroken
            ? '⛔ Roto'
            : shpCur + ' / ' + formatNumber(shpMax) + ' HP';
        } else {
          statsDiv.textContent = formatNumber(slotEff.damage) + ' dmg';
        }
        card.appendChild(statsDiv);

        const unequipBtn = document.createElement('button');
        unequipBtn.className = 'btn slot-btn-unequip';
        unequipBtn.textContent = '✕';
        unequipBtn.title = 'Vaciar slot';
        unequipBtn.addEventListener('click', () => { this._unequip(si); this._refresh(); });
        card.appendChild(unequipBtn);
      } else {
        // Slot vacío — puzzle fantasma
        const ghostSvg = _svgEl('svg', { width: 68, height: 68, viewBox: '-6 -6 76 76' });
        ghostSvg.style.overflow = 'visible';
        ghostSvg.style.display = 'block';
        ghostSvg.style.opacity = '0.25';
        ghostSvg.appendChild(_svgEl('path', {
          d: 'M 8 8 L 26 8 Q 32 0 38 8 L 56 8 L 56 26 Q 64 32 56 38 L 56 56 L 8 56 Z',
          fill: 'none', stroke: '#ffffff', 'stroke-width': '1.5', 'stroke-dasharray': '4 3',
        }));
        card.appendChild(ghostSvg);

        const emptyLabel = document.createElement('div');
        emptyLabel.className = 'slot-empty-label';
        emptyLabel.textContent = 'Vacío';
        card.appendChild(emptyLabel);
      }

      slotsDiv.appendChild(card);
    }
    container.appendChild(slotsDiv);

    // ── Divider ──
    const divider = document.createElement('div');
    divider.className = 'arsenal-divider';
    divider.textContent = 'Todas las armas';
    container.appendChild(divider);

    // ── Filtros de tier ──
    const tiers = ['cuantica', 'molecular', 'organica', 'planetaria', 'galactica', 'universal'];
    const filtersDiv = document.createElement('div');
    filtersDiv.className = 'arsenal-filters';

    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn' + (this._filterTier === null ? ' active' : '');
    allBtn.textContent = 'Todos';
    allBtn.addEventListener('click', () => { this._filterTier = null; this._refresh(); });
    filtersDiv.appendChild(allBtn);

    for (const tier of tiers) {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (this._filterTier === tier ? ' active' : '');
      btn.textContent = TIER_NAMES[tier];
      btn.style.setProperty('color', this._filterTier === tier ? TIER_COLORS[tier] : '');
      btn.addEventListener('click', () => {
        this._filterTier = this._filterTier === tier ? null : tier;
        this._refresh();
      });
      filtersDiv.appendChild(btn);
    }
    container.appendChild(filtersDiv);

    // ── Grid de armas ──
    const grid = document.createElement('div');
    grid.className = 'arsenal-grid';

    const allIds = Object.keys(WEAPON_DEFS);
    const filtered = allIds.filter(id => {
      const def = WEAPON_DEFS[id];
      return def && (!this._filterTier || def.tier === this._filterTier);
    });

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'arsenal-empty';
      empty.textContent = 'No hay armas en este tier.';
      grid.appendChild(empty);
    }

    for (const wid of filtered) {
      const def       = WEAPON_DEFS[wid];
      const tc        = TIER_COLORS[def.tier] || '#fff';
      const owned     = inv.includes(wid);
      const equipped  = owned ? slots.indexOf(wid) : -1;
      const have      = frags[wid] || 0;
      const required  = TIER_FRAGMENTS[def.tier] || 0;

      const card = document.createElement('div');
      card.className = 'weapon-card' + (this._selectedWeapon === wid ? ' selected' : '');
      card.style.setProperty('--tier-color', tc);

      // ── Fila principal: puzzle + info ──
      const body = document.createElement('div');
      body.className = 'weapon-card-body';

      const wLevel = (state.weaponLevels && state.weaponLevels[wid]) || 0;
      const wEvoG  = (state.weaponEvolutions && state.weaponEvolutions[wid]) || 0;
      body.appendChild(this._buildPuzzle(wid, owned, tc, 52, wLevel, wEvoG));

      const info = document.createElement('div');
      info.className = 'weapon-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'weapon-card-header';
      const nameEl = document.createElement('div');
      nameEl.className = 'weapon-card-name';
      nameEl.textContent = def.nombre;
      nameRow.appendChild(nameEl);
      if (equipped >= 0) {
        const badge = document.createElement('div');
        badge.className = 'weapon-equipped-badge';
        badge.textContent = 'S' + (equipped + 1);
        nameRow.appendChild(badge);
      }
      info.appendChild(nameRow);

      const tierEl = document.createElement('div');
      tierEl.className = 'weapon-card-tier';
      tierEl.textContent = TIER_NAMES[def.tier] || def.tier;
      tierEl.style.color = tc;
      info.appendChild(tierEl);

      const statsEl = document.createElement('div');
      statsEl.className = 'weapon-card-stats';
      if (owned) {
        const cardEff = Weapons.getEffectiveStats(wid, state);
        if (def.tipo !== 'shield' && def.tipo !== 'orbital' && def.tipo !== 'orbital_secondary') {
          const dps = cardEff.attackInterval ? (cardEff.damage / (cardEff.attackInterval / 1000)).toFixed(1) : '—';
          statsEl.textContent = formatNumber(cardEff.damage) + ' dmg · ' + dps + ' dps';
        } else if (def.tipo === 'shield') {
          statsEl.textContent = formatNumber(cardEff.shieldMaxHp) + ' HP escudo';
        } else {
          statsEl.textContent = formatNumber(cardEff.damage) + ' dmg/col.';
        }
      } else {
        if (def.tipo !== 'shield' && def.tipo !== 'orbital' && def.tipo !== 'orbital_secondary') {
          statsEl.textContent = formatNumber(def.damage * eraScale) + ' dmg · ' + (def.attackInterval / 1000).toFixed(1) + 's';
        } else if (def.tipo === 'shield') {
          statsEl.textContent = formatNumber(20 * eraScale) + ' HP escudo';
        } else {
          statsEl.textContent = formatNumber(def.damage * eraScale) + ' dmg/col.';
        }
      }
      info.appendChild(statsEl);

      // Barra de fragmentos o estado
      info.appendChild(this._buildFragRow(wid, have, required, tc, owned, equipped));

      // Sección de upgrade (solo armas poseídas)
      if (owned) {
        info.appendChild(this._buildUpgradeSection(wid, def, state, tc));
      }

      body.appendChild(info);
      card.appendChild(body);

      // Acciones (solo armas poseídas al seleccionarlas)
      if (owned) {
        card.addEventListener('click', () => {
          this._selectedWeapon = this._selectedWeapon === wid ? null : wid;
          this._refresh();
        });

        if (this._selectedWeapon === wid) {
          const actions = document.createElement('div');
          actions.className = 'weapon-card-actions';
          for (let si = 0; si < 3; si++) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = 'Slot ' + (si + 1);
            btn.disabled = equipped === si;
            const idx = si;
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              this._equip(wid, idx);
              this._selectedWeapon = null;
              this._refresh();
            });
            actions.appendChild(btn);
          }
          const detailBtn = document.createElement('button');
          detailBtn.className = 'btn';
          detailBtn.textContent = 'Detalles';
          detailBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this._showDetail(wid, card);
          });
          actions.appendChild(detailBtn);
          card.appendChild(actions);
        }
      }

      grid.appendChild(card);
    }

    container.appendChild(grid);
    return container;
  },

  // ── Upgrade helpers ──
  _upgradeCost(tier, currentLevel) {
    return Math.round((TIER_BASE_COST[tier] || 50) * Math.pow(1.5, currentLevel));
  },

  _makeUpgradeBtn(label, tc, canAfford, onClick) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-upgrade' + (canAfford ? '' : ' btn-upgrade-disabled');
    btn.style.setProperty('--uc', tc);
    btn.disabled = !canAfford;
    btn.textContent = label;
    if (canAfford) {
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    }
    return btn;
  },

  _doUpgrade(wid, levels, state) {
    if (!state.weaponLevels) state.weaponLevels = {};
    const def = WEAPON_DEFS[wid];
    if (!def) return;
    let lv = state.weaponLevels[wid] || 0;
    const maxLv = 20;
    for (let i = 0; i < levels; i++) {
      if (lv >= maxLv) break;
      const cost = this._upgradeCost(def.tier, lv);
      if ((state.coins || 0) < cost) break;
      state.coins -= cost;
      lv++;
    }
    state.weaponLevels[wid] = lv;
    if (wid === 'campo_fuerza') {
      const eff = Weapons.getEffectiveStats('campo_fuerza', state);
      state.shieldMaxHp = eff.shieldMaxHp;
      if (state.shieldHp > state.shieldMaxHp) state.shieldHp = state.shieldMaxHp;
    }
    this._refresh();
  },

  _buildUpgradeSection(wid, def, state, tc) {
    const MAX_LV = 20;
    const lv    = (state.weaponLevels && state.weaponLevels[wid]) || 0;
    const coins = state.coins || 0;

    const sec = document.createElement('div');
    sec.className = 'weapon-upgrade-section';

    // Header: nivel + barra
    const hdr = document.createElement('div');
    hdr.className = 'weapon-level-header';
    const lbl = document.createElement('span');
    lbl.className = 'weapon-level-label';
    lbl.textContent = 'Nv ' + lv + ' / ' + MAX_LV;
    if (lv >= MAX_LV) lbl.style.color = tc;
    hdr.appendChild(lbl);
    sec.appendChild(hdr);

    const barTrack = document.createElement('div');
    barTrack.className = 'weapon-level-bar';
    const barFill = document.createElement('div');
    barFill.className = 'weapon-level-bar-fill';
    barFill.style.width = (lv / MAX_LV * 100).toFixed(1) + '%';
    barFill.style.background = `linear-gradient(90deg,${tc},${tc}88)`;
    barTrack.appendChild(barFill);
    sec.appendChild(barTrack);

    if (lv >= MAX_LV) {
      sec.appendChild(this._buildEvolutionPanel(wid, def, state, tc));
      return sec;
    }

    const cost1 = this._upgradeCost(def.tier, lv);
    const can1  = coins >= cost1;

    const lv10   = Math.min(10, MAX_LV - lv);
    let cost10 = 0;
    for (let i = 0; i < lv10; i++) cost10 += this._upgradeCost(def.tier, lv + i);
    const can10 = lv10 > 0 && coins >= cost10;

    let lvMax = 0, costMax = 0, rem = coins;
    for (let i = lv; i < MAX_LV; i++) {
      const c = this._upgradeCost(def.tier, i);
      if (rem < c) break;
      rem -= c; costMax += c; lvMax++;
    }
    const canMax = lvMax > 0;

    const row = document.createElement('div');
    row.className = 'weapon-upgrade-btns';
    row.appendChild(this._makeUpgradeBtn('×1 ✦' + formatNumber(cost1),         tc, can1,  () => this._doUpgrade(wid, 1,    state)));
    row.appendChild(this._makeUpgradeBtn('×' + lv10 + ' ✦' + formatNumber(cost10), tc, can10, () => this._doUpgrade(wid, lv10, state)));
    row.appendChild(this._makeUpgradeBtn('Max ✦' + formatNumber(costMax),      tc, canMax, () => this._doUpgrade(wid, lvMax, state)));
    sec.appendChild(row);

    if (!can1) {
      const lack = document.createElement('div');
      lack.className = 'weapon-upgrade-lack';
      lack.textContent = 'Faltan ' + formatNumber(cost1 - coins) + ' ✦';
      sec.appendChild(lack);
    }

    return sec;
  },

  _buildEvolutionPanel(wid, def, state, tc) {
    const EVO_MAX = 5;
    const stage   = (state.weaponEvolutions && state.weaponEvolutions[wid]) || 0;
    const cost    = EVO_COSTS[def.tier] || { gems: 0, points: 0 };

    const panel = document.createElement('div');
    panel.className = 'weapon-evo-section';

    // Header: label + dots de etapa
    const header = document.createElement('div');
    header.className = 'weapon-evo-header';

    const stageLbl = document.createElement('span');
    stageLbl.className = 'weapon-evo-label';
    stageLbl.textContent = stage >= EVO_MAX
      ? 'E5 — MAX'
      : 'E' + stage + ' → E' + (stage + 1);
    if (stage >= EVO_MAX) stageLbl.style.color = tc;
    header.appendChild(stageLbl);

    const dotsDiv = document.createElement('div');
    dotsDiv.className = 'weapon-evo-dots';
    for (let i = 1; i <= EVO_MAX; i++) {
      const dot = document.createElement('span');
      dot.className = 'weapon-evo-dot' + (i <= stage ? ' evo-dot-filled' : '');
      if (i <= stage) dot.style.background = tc;
      else            dot.style.borderColor = tc + '55';
      dotsDiv.appendChild(dot);
    }
    header.appendChild(dotsDiv);
    panel.appendChild(header);

    if (stage >= EVO_MAX) {
      const maxLbl = document.createElement('div');
      maxLbl.className = 'weapon-evo-max';
      maxLbl.textContent = 'Evolución máxima alcanzada';
      maxLbl.style.color = tc;
      panel.appendChild(maxLbl);
      return panel;
    }

    // Costo
    const costRow = document.createElement('div');
    costRow.className = 'weapon-evo-cost';
    costRow.textContent = cost.gems + ' 💎  ' + formatNumber(cost.points) + ' 🌀';
    panel.appendChild(costRow);

    const gems = state.gems || 0;
    const pts  = state.evoPoints || 0;
    const canAfford = gems >= cost.gems && pts >= cost.points;

    const btn = document.createElement('button');
    btn.className = 'btn btn-upgrade' + (canAfford ? '' : ' btn-upgrade-disabled');
    btn.style.setProperty('--uc', tc);
    btn.style.width = '100%';
    btn.style.marginTop = '4px';
    btn.disabled = !canAfford;
    btn.textContent = 'Evolucionar ▶';
    if (canAfford) {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._doEvolve(wid, state);
      });
    }
    panel.appendChild(btn);

    if (!canAfford) {
      const lacking = [];
      if (gems < cost.gems) lacking.push('Faltan ' + (cost.gems - gems) + ' 💎');
      if (pts  < cost.points) lacking.push(formatNumber(cost.points - pts) + ' 🌀');
      const lack = document.createElement('div');
      lack.className = 'weapon-upgrade-lack';
      lack.textContent = lacking.join(' · ');
      panel.appendChild(lack);
    }

    return panel;
  },

  _doEvolve(wid, state) {
    const def = WEAPON_DEFS[wid];
    if (!def) return;
    if (!state.weaponEvolutions) state.weaponEvolutions = {};
    const stage = state.weaponEvolutions[wid] || 0;
    if (stage >= 5) return;
    if (((state.weaponLevels && state.weaponLevels[wid]) || 0) < 20) return;
    const cost = EVO_COSTS[def.tier];
    if (!cost) return;
    if ((state.gems || 0) < cost.gems) return;
    if ((state.evoPoints || 0) < cost.points) return;

    state.gems       = (state.gems     || 0) - cost.gems;
    state.evoPoints  = (state.evoPoints || 0) - cost.points;
    state.weaponEvolutions[wid] = stage + 1;

    if (wid === 'campo_fuerza') {
      const eff = Weapons.getEffectiveStats('campo_fuerza', state);
      state.shieldMaxHp = eff.shieldMaxHp;
      if (state.shieldHp > state.shieldMaxHp) state.shieldHp = state.shieldMaxHp;
    }
    this._refresh();
  },

  _forge(wid, cardEl) {
    const state = Game.state;
    const def = WEAPON_DEFS[wid];
    if (!def) return;
    const required = TIER_FRAGMENTS[def.tier] || 0;
    if (!state.fragments) state.fragments = {};
    if ((state.fragments[wid] || 0) < required) return;

    if (cardEl) {
      cardEl.classList.add('forge-flash');
      const svg = cardEl.querySelector('svg');
      if (svg) svg.classList.add('forge-assemble');
    }
    setTimeout(() => {
      state.fragments[wid] = 0;
      if (!Array.isArray(state.weaponInventory)) state.weaponInventory = [];
      if (!state.weaponInventory.includes(wid)) state.weaponInventory.push(wid);
      this._refresh();
    }, 580);
  },

  _equip(wid, slotIdx) {
    const state = Game.state;
    if (!Array.isArray(state.weaponInventory)) state.weaponInventory = [];
    if (!Array.isArray(state.weaponSlots) || state.weaponSlots.length !== 3) {
      state.weaponSlots = [null, null, null];
    }
    if (!state.weaponInventory.includes(wid)) state.weaponInventory.push(wid);

    // Remover de cualquier otro slot si ya estaba
    for (let si = 0; si < 3; si++) {
      if (state.weaponSlots[si] === wid) state.weaponSlots[si] = null;
    }
    state.weaponSlots[slotIdx] = wid;

    // Inicializar escudo si es Campo de Fuerza
    if (wid === 'campo_fuerza') {
      Weapons.initShield(state);
    }
    // Resetear timer del slot
    Weapons.slotTimers[slotIdx] = 0;
  },

  _unequip(slotIdx) {
    const state = Game.state;
    if (!Array.isArray(state.weaponSlots)) state.weaponSlots = [null, null, null];
    state.weaponSlots[slotIdx] = null;
  },

  _showDetail(wid, cardEl) {
    const def = WEAPON_DEFS[wid];
    if (!def) return;

    // Remover detail previo si existe
    const prev = cardEl.parentElement && cardEl.parentElement.querySelector('.weapon-detail');
    if (prev) prev.remove();

    const panel = document.createElement('div');
    panel.className = 'weapon-detail';

    const h4 = document.createElement('h4');
    h4.textContent = def.nombre;
    h4.style.color = TIER_COLORS[def.tier] || '#fff';
    panel.appendChild(h4);

    const eff = Weapons.getEffectiveStats(wid, Game.state);
    const lv = (Game.state.weaponLevels && Game.state.weaponLevels[wid]) || 0;
    let stats = '';
    if (def.tipo !== 'shield' && def.tipo !== 'orbital' && def.tipo !== 'orbital_secondary') {
      stats += 'Daño: ' + formatNumber(eff.damage);
      if (eff.attackInterval) stats += ' · Intervalo: ' + (eff.attackInterval / 1000).toFixed(2) + 's';
      if (eff.dotDps != null) stats += '\nDoT: ' + formatNumber(eff.dotDps) + '/seg × ' + def.dotDuration + 's';
      if (eff.chainCount) stats += '\nCadena: hasta ' + eff.chainCount + ' enemigos';
      if (eff.range) stats += '\nRadio AoE: ' + Math.round(eff.range) + 'px';
      if (eff.multiCount) stats += '\nProyectiles: ' + eff.multiCount;
      if (def.stunDuration) stats += '\nAturdimiento: ' + def.stunDuration + 's';
      if (def.knockback) stats += '\nKnockback: sí';
    } else if (def.tipo === 'shield') {
      stats = 'HP escudo: ' + formatNumber(eff.shieldMaxHp)
        + '\nRegen: ' + (eff.regenRate * 100).toFixed(1) + '%/seg (tras 3s sin daño)'
        + '\nCooldown al romperse: ' + (eff.brokenCooldown / 1000) + 's';
    } else if (def.tipo === 'orbital') {
      stats = 'Daño: ' + formatNumber(eff.damage) + ' por colisión'
        + '\nVelocidad: ×' + eff.speed.toFixed(2) + ' rad/s'
        + '\nRadio: ' + Math.round(eff.radius) + 'px';
    } else {
      stats = 'Daño: ' + formatNumber(eff.damage) + ' por colisión'
        + '\nVelocidad: ×' + eff.speed.toFixed(2) + ' rad/s';
    }
    if (lv > 0) stats += '\n— Nivel ' + lv + ' —';

    const desc = document.createElement('p');
    desc.style.color = 'var(--text-dim)';
    desc.style.marginBottom = '6px';
    desc.textContent = def.description;
    panel.appendChild(desc);

    const statsPre = document.createElement('pre');
    statsPre.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:var(--text);white-space:pre-line;margin:0';
    statsPre.textContent = stats;
    panel.appendChild(statsPre);

    // Insertar después del card en el grid
    cardEl.after(panel);
  },

  _refresh() {
    // Reconstruir el body del modal sin cerrarlo
    const bodyEl = document.getElementById('modal-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    bodyEl.appendChild(this._buildBody());
    // Mantener clase wide
    const m = document.querySelector('.modal');
    if (m) m.classList.add('modal--arsenal');
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
