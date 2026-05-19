'use strict';

/* ============================================
   enemies.js — datos puros de enemigos.
   Sin dependencias en tiempo de carga.
   Exporta funciones globales: getEnemyDef, spawnEnemy.
   ============================================ */

const ENEMY_NAMES = [
  /* 0 Vacío */     { a: 'Fluctuación',   b: 'Vuelo Cuántico', c: 'Singularidad',    boss: 'Anti-Punto'       },
  /* 1 Cuark */     { a: 'Cuark Rojo',    b: 'Cuark Azul',     c: 'Gluón',           boss: 'Antiquark'        },
  /* 2 Átomo */     { a: 'Electrón',      b: 'Positrón',       c: 'Neutrón',         boss: 'Núcleo Inestable' },
  /* 3 Molécula */  { a: 'Radical',       b: 'Isómero',        c: 'Polímero',        boss: 'Macromolécula'    },
  /* 4 Célula */    { a: 'Bacteria',      b: 'Virus',          c: 'Prión',           boss: 'Proto-célula'     },
  /* 5 Vida */      { a: 'Parásito',      b: 'Predador',       c: 'Depredador',      boss: 'Apex'             },
  /* 6 Mente */     { a: 'Sombra',        b: 'Espectro',       c: 'Entidad',         boss: 'Ego Oscuro'       },
  /* 7 Ciudad */    { a: 'Caos Urbano',   b: 'Distorsión',     c: 'Colapso',         boss: 'Anti-Ciudad'      },
  /* 8 Planeta */   { a: 'Tormenta',      b: 'Erupción',       c: 'Cataclismo',      boss: 'Núcleo Muerto'    },
  /* 9 Estrella */  { a: 'Plasma Rogue',  b: 'Flare Solar',    c: 'Nova',            boss: 'Anti-Estrella'    },
  /* 10 Galaxia */  { a: 'Agujero Negro', b: 'Quásar',         c: 'Pulsar',          boss: 'Vacío Galáctico'  },
  /* 11 Universo */ { a: 'Entropía',      b: 'Paradoja',       c: 'Anomalía',        boss: 'Anti-Universo'    },
];

const ENEMY_COLORS = [
  /* 0  */ { a: '#80d4ff', b: '#a0e4ff', c: '#60b8ff', boss: '#ff4488' },
  /* 1  */ { a: '#ff8844', b: '#ff6622', c: '#ffaa44', boss: '#ff2200' },
  /* 2  */ { a: '#88ddff', b: '#aaeeff', c: '#66ccff', boss: '#ff3366' },
  /* 3  */ { a: '#aaffaa', b: '#88ff88', c: '#ccffcc', boss: '#ff6600' },
  /* 4  */ { a: '#ff99cc', b: '#ff77bb', c: '#ffbbdd', boss: '#cc0044' },
  /* 5  */ { a: '#99ff77', b: '#77ff55', c: '#bbff99', boss: '#ff3300' },
  /* 6  */ { a: '#bb88ff', b: '#9966ff', c: '#ddbbff', boss: '#660099' },
  /* 7  */ { a: '#ffdd44', b: '#ffcc22', c: '#ffee88', boss: '#ff6600' },
  /* 8  */ { a: '#88aaff', b: '#6688ff', c: '#aaccff', boss: '#0033ff' },
  /* 9  */ { a: '#ff8866', b: '#ff6644', c: '#ffaa88', boss: '#ff2200' },
  /* 10 */ { a: '#cc66ff', b: '#aa44ff', c: '#ee88ff', boss: '#440077' },
  /* 11 */ { a: '#ffffff', b: '#e0e0ff', c: '#c0c0ff', boss: '#ff00ff' },
];

const SHAPES = { a: 'circle', b: 'diamond', c: 'hexagon', boss: 'star' };
const RADII  = { a: 12,       b: 9,         c: 16,        boss: 30     };

const ENEMY_BASE = {
  hp:              5,
  damage:          2,
  coins:           2,
  speed:           30,       // px/s
  attackIntervalMs: 2000,
};

const TYPE_MULT = {
  a:    { hp: 1.0,  damage: 1.0,  speed: 1.0 },
  b:    { hp: 0.5,  damage: 0.75, speed: 1.5 },
  c:    { hp: 2.0,  damage: 1.25, speed: 0.5 },
  boss: { hp: 30.0, damage: 3.0,  speed: 0.4 },
};

function eraScale(stat, n) {
  switch (stat) {
    case 'hp':     return Math.pow(5,   n);
    case 'damage': return Math.pow(2.5, n);
    case 'coins':  return Math.pow(2,   n);
    case 'speed':  return 1 + n * 0.05;
    default:       return 1;
  }
}

function getEnemyDef(eraIdx, type) {
  const era = Math.max(0, Math.min(11, eraIdx));
  const tm  = TYPE_MULT[type] || TYPE_MULT.a;
  return {
    name:             ENEMY_NAMES[era][type],
    color:            ENEMY_COLORS[era][type],
    shape:            SHAPES[type],
    radius:           RADII[type],
    maxHp:            ENEMY_BASE.hp     * tm.hp     * eraScale('hp',     era),
    damage:           ENEMY_BASE.damage * tm.damage * eraScale('damage', era),
    coins:            Math.ceil(ENEMY_BASE.coins * eraScale('coins', era)),
    speed:            ENEMY_BASE.speed  * tm.speed  * eraScale('speed',  era),
    attackIntervalMs: type === 'boss' ? 1500 : ENEMY_BASE.attackIntervalMs,
  };
}

function randomEdgePos(W, H, pad) {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: return { x: pad + Math.random() * (W - 2 * pad), y: pad };
    case 1: return { x: W - pad, y: pad + Math.random() * (H - 2 * pad) };
    case 2: return { x: pad + Math.random() * (W - 2 * pad), y: H - pad };
    case 3: return { x: pad, y: pad + Math.random() * (H - 2 * pad) };
  }
}

function spawnEnemy(eraIdx, type, W, H) {
  const def = getEnemyDef(eraIdx, type);
  const pos = randomEdgePos(W, H, 40);
  return {
    type,
    ...def,
    hp:          def.maxHp,
    x:           pos.x,
    y:           pos.y,
    attackTimer: def.attackIntervalMs,
    hitFlash:    0,
    alive:       true,
    isBoss:      type === 'boss',
  };
}
