'use strict';

/* ============================================
   enemies.js — datos puros de enemigos.
   Sin dependencias en tiempo de carga.
   Tipos: 'a' | 'b' | 'c' | 'elite' | 'boss' | 'mini' (mini se crea en combat.js)
   ============================================ */

const ENEMY_NAMES = [
  /* 0 Vacío */     { a: 'Fluctuación',   b: 'Vuelo Cuántico', c: 'Singularidad',    elite: 'Rift Mayor',       boss: 'Anti-Punto'       },
  /* 1 Cuark */     { a: 'Cuark Rojo',    b: 'Cuark Azul',     c: 'Gluón',           elite: 'Cuark Colosal',    boss: 'Antiquark'        },
  /* 2 Átomo */     { a: 'Electrón',      b: 'Positrón',       c: 'Neutrón',         elite: 'Núcleo Denso',     boss: 'Núcleo Inestable' },
  /* 3 Molécula */  { a: 'Radical',       b: 'Isómero',        c: 'Polímero',        elite: 'Cadena Élite',     boss: 'Macromolécula'    },
  /* 4 Célula */    { a: 'Bacteria',      b: 'Virus',          c: 'Prión',           elite: 'Archivirus',       boss: 'Proto-célula'     },
  /* 5 Vida */      { a: 'Parásito',      b: 'Predador',       c: 'Depredador',      elite: 'Alpha',            boss: 'Apex'             },
  /* 6 Mente */     { a: 'Sombra',        b: 'Espectro',       c: 'Entidad',         elite: 'Doble Oscuro',     boss: 'Ego Oscuro'       },
  /* 7 Ciudad */    { a: 'Caos Urbano',   b: 'Distorsión',     c: 'Colapso',         elite: 'Monstruo Urbano',  boss: 'Anti-Ciudad'      },
  /* 8 Planeta */   { a: 'Tormenta',      b: 'Erupción',       c: 'Cataclismo',      elite: 'Titán',            boss: 'Núcleo Muerto'    },
  /* 9 Estrella */  { a: 'Plasma Rogue',  b: 'Flare Solar',    c: 'Nova',            elite: 'Supernova Oscura', boss: 'Anti-Estrella'    },
  /* 10 Galaxia */  { a: 'Agujero Negro', b: 'Quásar',         c: 'Pulsar',          elite: 'Singularidad',     boss: 'Vacío Galáctico'  },
  /* 11 Universo */ { a: 'Entropía',      b: 'Paradoja',       c: 'Anomalía',        elite: 'Convergencia',     boss: 'Anti-Universo'    },
];

const ENEMY_COLORS = [
  /* 0  */ { a: '#80d4ff', b: '#a0e4ff', c: '#60b8ff', elite: '#ff9944', boss: '#ff4488' },
  /* 1  */ { a: '#ff8844', b: '#ff6622', c: '#ffaa44', elite: '#ff4400', boss: '#ff2200' },
  /* 2  */ { a: '#88ddff', b: '#aaeeff', c: '#66ccff', elite: '#ff7744', boss: '#ff3366' },
  /* 3  */ { a: '#aaffaa', b: '#88ff88', c: '#ccffcc', elite: '#88ff44', boss: '#ff6600' },
  /* 4  */ { a: '#ff99cc', b: '#ff77bb', c: '#ffbbdd', elite: '#ff5599', boss: '#cc0044' },
  /* 5  */ { a: '#99ff77', b: '#77ff55', c: '#bbff99', elite: '#ffdd55', boss: '#ff3300' },
  /* 6  */ { a: '#bb88ff', b: '#9966ff', c: '#ddbbff', elite: '#dd44ff', boss: '#660099' },
  /* 7  */ { a: '#ffdd44', b: '#ffcc22', c: '#ffee88', elite: '#ff8800', boss: '#ff6600' },
  /* 8  */ { a: '#88aaff', b: '#6688ff', c: '#aaccff', elite: '#4466ff', boss: '#0033ff' },
  /* 9  */ { a: '#ff8866', b: '#ff6644', c: '#ffaa88', elite: '#ff3300', boss: '#ff2200' },
  /* 10 */ { a: '#cc66ff', b: '#aa44ff', c: '#ee88ff', elite: '#ff88ff', boss: '#440077' },
  /* 11 */ { a: '#ffffff', b: '#e0e0ff', c: '#c0c0ff', elite: '#ffaa00', boss: '#ff00ff' },
];

const SHAPES = { a: 'circle', b: 'diamond', c: 'hexagon', elite: 'circle', boss: 'star' };
const RADII  = { a: 12,       b: 9,         c: 16,        elite: 18,       boss: 30     };

const ENEMY_BASE = {
  hp:               5,
  damage:           2,
  coins:            2,
  speed:            30,     // px/s
  attackIntervalMs: 2000,
};

const TYPE_MULT = {
  a:     { hp: 1.0,  damage: 1.0,  speed: 1.0, coinsMult: 1  },
  b:     { hp: 0.5,  damage: 0.75, speed: 1.5, coinsMult: 1  },
  c:     { hp: 2.0,  damage: 1.25, speed: 0.5, coinsMult: 1  },
  elite: { hp: 6.0,  damage: 1.75, speed: 0.7, coinsMult: 5  },
  boss:  { hp: 60.0, damage: 3.0,  speed: 0.4, coinsMult: 20 },
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
  const nameMap  = ENEMY_NAMES[era];
  const colorMap = ENEMY_COLORS[era];
  return {
    name:             nameMap[type]  || nameMap.a,
    color:            colorMap[type] || colorMap.a,
    shape:            SHAPES[type]   || 'circle',
    radius:           RADII[type]    || 12,
    maxHp:            ENEMY_BASE.hp     * tm.hp     * eraScale('hp',     era),
    damage:           ENEMY_BASE.damage * tm.damage * eraScale('damage', era),
    coins:            Math.ceil(ENEMY_BASE.coins * eraScale('coins', era) * tm.coinsMult),
    speed:            ENEMY_BASE.speed  * tm.speed  * eraScale('speed',  era),
    attackIntervalMs: type === 'boss'  ? 1500
                    : type === 'elite' ? 1800
                    : ENEMY_BASE.attackIntervalMs,
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
    chargeFlash: 0,    // aura de carga (jefe antes de invocar; 0..1)
    alive:       true,
    isBoss:      type === 'boss',
    isElite:     type === 'elite',
    isMini:      false,
  };
}
