'use strict';

/* ============================================
   save.js — persistencia en localStorage
   En fase 1: guardar/cargar manual y reset.
   En fase 4 se añadirá auto-save cada 10s,
   export/import en base64 y cálculo offline.
   ============================================ */

const SAVE_KEY = 'genesis_save_v1';

const Save = {
  // Serializa el estado y lo guarda. Devuelve true si tuvo éxito.
  save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      // Puede fallar si localStorage está deshabilitado o lleno.
      console.warn('[Génesis] No se pudo guardar:', e);
      return false;
    }
  },

  // Devuelve el estado guardado o null si no hay nada / está corrupto.
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Génesis] Save corrupto, ignorando:', e);
      return null;
    }
  },

  // Borra el guardado. Útil para el botón "Reiniciar".
  clear() {
    localStorage.removeItem(SAVE_KEY);
  },
};
