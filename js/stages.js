'use strict';

/* ============================================
   stages.js — definición completa de las 12 eras.

   Cada era expone:
     id, name, flavor, palette, unlockAt, generators[]

   Las 2 primeras (Vacío, Partícula) tienen costos hechos a mano.
   Las 10 siguientes se calculan por fórmula (ver más abajo).

   Por qué calcular en lugar de hardcodear: la progresión depende de
   un solo número mágico (factor entre eras). Cambiando la fórmula
   re-balanceamos todo el juego sin tocar 50 valores a mano.
   ============================================ */

// ----------- PALETAS POR ERA -----------
// Cada paleta describe los colores principales que pinta el canvas.
// Los renderers leen estos valores y los interpolan durante la transición.
//   bg       : color de fondo (RGB)
//   fog      : velo radial central, da profundidad cósmica (RGBA)
//   accent   : color principal de la entidad (núcleo, brillo, partículas)
//   accent2  : color secundario (halos suaves, detalles)
//   starAlpha: cuánto brillan las estrellas de fondo (0=nada, 1=lleno)
const PALETTES = {
  vacio:        { bg:{r:6,  g:6,  b:14}, fog:{r:40, g:25, b:80,  a:0.35}, accent:{r:0,   g:255, b:225}, accent2:{r:167, g:139, b:250}, starAlpha: 1.00 },
  particula:    { bg:{r:8,  g:8,  b:18}, fog:{r:50, g:30, b:100, a:0.35}, accent:{r:90,  g:220, b:255}, accent2:{r:180, g:150, b:255}, starAlpha: 1.00 },
  atomo:        { bg:{r:15, g:8,  b:25}, fog:{r:60, g:20, b:90,  a:0.40}, accent:{r:60,  g:140, b:255}, accent2:{r:180, g:110, b:255}, starAlpha: 0.85 },
  molecula:     { bg:{r:5,  g:18, b:22}, fog:{r:10, g:50, b:60,  a:0.40}, accent:{r:140, g:255, b:100}, accent2:{r:90,  g:230, b:200}, starAlpha: 0.70 },
  celula:       { bg:{r:22, g:8,  b:8 }, fog:{r:80, g:25, b:25,  a:0.40}, accent:{r:255, g:130, b:90 }, accent2:{r:255, g:180, b:100}, starAlpha: 0.55 },
  organismo:    { bg:{r:20, g:14, b:8 }, fog:{r:70, g:50, b:30,  a:0.40}, accent:{r:130, g:180, b:100}, accent2:{r:200, g:170, b:130}, starAlpha: 0.45 },
  especie:      { bg:{r:8,  g:18, b:10}, fog:{r:30, g:70, b:35,  a:0.40}, accent:{r:220, g:230, b:110}, accent2:{r:255, g:220, b:100}, starAlpha: 0.45 },
  civilizacion: { bg:{r:24, g:16, b:8 }, fog:{r:90, g:60, b:25,  a:0.45}, accent:{r:255, g:200, b:100}, accent2:{r:220, g:130, b:70 }, starAlpha: 0.35 },
  planeta:      { bg:{r:8,  g:15, b:28}, fog:{r:30, g:60, b:100, a:0.40}, accent:{r:110, g:180, b:130}, accent2:{r:230, g:240, b:255}, starAlpha: 0.65 },
  sistema:      { bg:{r:24, g:10, b:4 }, fog:{r:120,g:50, b:15,  a:0.45}, accent:{r:255, g:150, b:60 }, accent2:{r:255, g:230, b:100}, starAlpha: 0.75 },
  galaxia:      { bg:{r:16, g:8,  b:22}, fog:{r:80, g:30, b:100, a:0.45}, accent:{r:220, g:100, b:220}, accent2:{r:255, g:150, b:200}, starAlpha: 0.30 },
  universo:     { bg:{r:2,  g:2,  b:6 }, fog:{r:40, g:30, b:60,  a:0.30}, accent:{r:255, g:255, b:255}, accent2:{r:100, g:255, b:255}, starAlpha: 0.20 },
};

// ----------- DEFINICIÓN BÁSICA POR ERA -----------
// Las eras 0 y 1 fijan sus generadores (Fase 2). Las demás sólo declaran
// los nombres; los costos y producción los calcula la fórmula más abajo.
const ERA_DEFS = [
  {
    name: 'Vacío',
    flavor: 'En el principio, no había nada. Sólo un punto de luz.',
    palette: PALETTES.vacio,
    unlockAt: 0,
    generators: [],
  },
  {
    name: 'Partícula',
    flavor: 'La primera partícula vibra en la nada.',
    palette: PALETTES.particula,
    unlockAt: 50,
    // Sólo 4 generadores en esta era (especial). Los costos y producción
    // los calcula la fórmula común al final del archivo, igual que el resto.
    gens: [
      { id: 'quark',    name: 'Quark'    },
      { id: 'electron', name: 'Electrón' },
      { id: 'photon',   name: 'Fotón'    },
      { id: 'neutrino', name: 'Neutrino' },
    ],
  },
  {
    name: 'Átomo',
    flavor: 'Las partículas se atraen y forman los primeros átomos.',
    palette: PALETTES.atomo,
    gens: [
      { id: 'hidrogeno', name: 'Hidrógeno' },
      { id: 'helio',     name: 'Helio'     },
      { id: 'carbono',   name: 'Carbono'   },
      { id: 'hierro',    name: 'Hierro'    },
      { id: 'uranio',    name: 'Uranio'    },
    ],
  },
  {
    name: 'Molécula',
    flavor: 'Los átomos se unen en estructuras más complejas.',
    palette: PALETTES.molecula,
    gens: [
      { id: 'h2o',        name: 'H₂O'        },
      { id: 'aminoacido', name: 'Aminoácido' },
      { id: 'adn',        name: 'ADN'        },
      { id: 'cristal',    name: 'Cristal'    },
      { id: 'polimero',   name: 'Polímero'   },
    ],
  },
  {
    name: 'Célula',
    flavor: 'La materia despierta y se organiza para vivir.',
    palette: PALETTES.celula,
    gens: [
      { id: 'bacteria', name: 'Bacteria' },
      { id: 'alga',     name: 'Alga'     },
      { id: 'hongo',    name: 'Hongo'    },
      { id: 'plancton', name: 'Plancton' },
      { id: 'virus',    name: 'Virus'    },
    ],
  },
  {
    name: 'Organismo',
    flavor: 'Millones de células colaboran como un solo ser.',
    palette: PALETTES.organismo,
    gens: [
      { id: 'pez',      name: 'Pez'      },
      { id: 'insecto',  name: 'Insecto'  },
      { id: 'reptil',   name: 'Reptil'   },
      { id: 'mamifero', name: 'Mamífero' },
      { id: 'ave',      name: 'Ave'      },
    ],
  },
  {
    name: 'Especie',
    flavor: 'Un linaje persiste a través del tiempo.',
    palette: PALETTES.especie,
    gens: [
      { id: 'tribu',      name: 'Tribu'      },
      { id: 'manada',     name: 'Manada'     },
      { id: 'colonia',    name: 'Colonia'    },
      { id: 'ecosistema', name: 'Ecosistema' },
      { id: 'bioma',      name: 'Bioma'      },
    ],
  },
  {
    name: 'Civilización',
    flavor: 'La especie aprende, escribe y construye.',
    palette: PALETTES.civilizacion,
    gens: [
      { id: 'aldea',   name: 'Aldea'   },
      { id: 'ciudad',  name: 'Ciudad'  },
      { id: 'nacion',  name: 'Nación'  },
      { id: 'imperio', name: 'Imperio' },
      { id: 'ia',      name: 'IA'      },
    ],
  },
  {
    name: 'Planeta',
    flavor: 'La vida cubre un mundo entero.',
    palette: PALETTES.planeta,
    gens: [
      { id: 'marte',      name: 'Marte'      },
      { id: 'jupiter',    name: 'Júpiter'    },
      { id: 'saturno',    name: 'Saturno'    },
      { id: 'exoplaneta', name: 'Exoplaneta' },
      { id: 'gigante',    name: 'Gigante'    },
    ],
  },
  {
    name: 'Sistema Solar',
    flavor: 'El planeta gira en torno a una estrella.',
    palette: PALETTES.sistema,
    gens: [
      { id: 'sol',           name: 'Sol'             },
      { id: 'binaria',       name: 'Estrella binaria'},
      { id: 'pulsar',        name: 'Púlsar'          },
      { id: 'enana_blanca',  name: 'Enana blanca'    },
      { id: 'agujero_negro', name: 'Agujero negro'   },
    ],
  },
  {
    name: 'Galaxia',
    flavor: 'Miles de millones de soles giran en espiral.',
    palette: PALETTES.galaxia,
    gens: [
      { id: 'espiral',    name: 'Espiral'    },
      { id: 'eliptica',   name: 'Elíptica'   },
      { id: 'cuasar',     name: 'Cuásar'     },
      { id: 'cumulo',     name: 'Cúmulo'     },
      { id: 'filamento',  name: 'Filamento'  },
    ],
  },
  {
    name: 'Universo',
    flavor: 'Todo lo que existe.',
    palette: PALETTES.universo,
    gens: [
      { id: 'multiverso',     name: 'Multiverso'     },
      { id: 'vacio_cuantico', name: 'Vacío cuántico' },
      { id: 'realidad',       name: 'Realidad'       },
      { id: 'singularidad',   name: 'Singularidad'   },
      { id: 'todo',           name: 'Todo'           },
    ],
  },
];

// ----------- FÓRMULA DE BALANCEO -----------
// Para cada era con `gens` (sin valores), aplicamos:
//   umbral_N      = costo del último generador de la era N-1
//   primer_costo  = umbral_N × fc            (fc = "first cost factor")
//   siguiente     = anterior × mult
//   producción    = costo / divisor
//
// Los parámetros (fc, mult, divisor) los devuelve eraParams() y varían
// por era para conseguir el pacing objetivo (ver balance.js):
//   - V→P 30s, P→A 2.5min, ..., G→U 2h30m
//
// La parte clave: el divisor crece geométricamente desde la era 5 para
// que cada transición sea progresivamente más larga, simulando la
// dificultad creciente del idle game. Sin esto las eras tardías quedan
// constantes en tiempo (~25 min cada una), perdiendo el sentido de progreso.
function eraParams(eraIdx) {
  // Pacing objetivo (primer run sin CU): 25-40 horas totales.
  // V→P 30s, P→A 2.5min, A→M 6.5min, M→C 13.5min, C→O 27.5min,
  // O→E 52.5min, E→Civ 1h45m, Civ→P 2h45m, P→SS 4h30m, SS→G 7h, G→U 10h.
  // La tabla de verificación se imprime en consola al arrancar en dev.
  const baseDiv  = 10.5;    // divisor base para eras 0-2
  const ramp     = 1.52;    // ralentización geométrica por era desde startEra
  const startEra = 2;       // el ramp arranca en Átomo (era 2)
  const slowdown = Math.max(1, Math.pow(ramp, eraIdx - startEra));
  return {
    divisor: baseDiv * slowdown,
    mult:    4,             // multiplicador entre generadores dentro de la era
    fc:      0.5,           // primer costo de la era = umbral × fc
  };
}

const STAGES = [];
for (let i = 0; i < ERA_DEFS.length; i++) {
  const def = ERA_DEFS[i];

  // 1) Umbral de desbloqueo: si no se fijó a mano, sale del último gen previo.
  let unlockAt = def.unlockAt;
  if (unlockAt === undefined) {
    const prev = STAGES[i - 1];
    const lastGen = prev.generators[prev.generators.length - 1];
    unlockAt = lastGen ? lastGen.baseCost : 0;
  }

  // 2) Generadores: si la era los declara con `gens` (sólo nombres),
  //    aplicamos la fórmula. Si tiene `generators: []` queda vacía (Vacío).
  let generators = [];
  if (def.gens && def.gens.length > 0) {
    const p = eraParams(i);
    const firstCost = unlockAt * p.fc;
    generators = def.gens.map((g, j) => {
      const baseCost = firstCost * Math.pow(p.mult, j);
      return {
        id: g.id,
        name: g.name,
        baseCost,
        baseProduction: baseCost / p.divisor,
      };
    });
  }

  STAGES.push({
    id: i,
    name: def.name,
    flavor: def.flavor,
    palette: def.palette,
    unlockAt,
    generators,
  });
}

// ----------- HELPERS DE GENERADORES -----------

// Costo de la siguiente compra: baseCost × 1.15^owned, redondeado.
function generatorCost(gen, owned) {
  return Math.ceil(gen.baseCost * Math.pow(1.15, owned));
}

// Busca un generador por id en cualquier era.
function findGenerator(id) {
  for (const stage of STAGES) {
    const g = stage.generators.find(g => g.id === id);
    if (g) return g;
  }
  return null;
}

// ----------- MEJORAS DE CLICK -----------
// 2 mejoras por era a partir de Partícula (era idx 1).
//   kind 'mult': multiplican el clickMultiplier (×2 cada una)
//   kind 'flat': suman a baseClick
// Se compran UNA sola vez (no escalan), costo = baseCost del 3er generador
// de su era (más o menos a mitad de avanzar la era).
const UPGRADE_DEFS = [
  // Partícula (idx 1)
  { era: 1,  id: 'resonancia',   name: 'Resonancia',   kind: 'mult', value: 2 },
  { era: 1,  id: 'espin',        name: 'Espín',        kind: 'flat', value: 5 },
  // Átomo (idx 2)
  { era: 2,  id: 'fision',       name: 'Fisión',       kind: 'mult', value: 2 },
  { era: 2,  id: 'excitacion',   name: 'Excitación',   kind: 'flat', value: 50 },
  // Molécula (idx 3)
  { era: 3,  id: 'catalisis',    name: 'Catálisis',    kind: 'mult', value: 2 },
  { era: 3,  id: 'enlace',       name: 'Enlace',       kind: 'flat', value: 500 },
  // Célula (idx 4)
  { era: 4,  id: 'mitosis',      name: 'Mitosis',      kind: 'mult', value: 2 },
  { era: 4,  id: 'membrana',     name: 'Membrana',     kind: 'flat', value: 5000 },
  // Organismo (idx 5)
  { era: 5,  id: 'adaptacion',   name: 'Adaptación',   kind: 'mult', value: 2 },
  { era: 5,  id: 'metabolismo',  name: 'Metabolismo',  kind: 'flat', value: 50000 },
  // Especie (idx 6)
  { era: 6,  id: 'evolucion',    name: 'Evolución',    kind: 'mult', value: 2 },
  { era: 6,  id: 'cooperacion',  name: 'Cooperación',  kind: 'flat', value: 500000 },
  // Civilización (idx 7)
  { era: 7,  id: 'innovacion',   name: 'Innovación',   kind: 'mult', value: 2 },
  { era: 7,  id: 'tecnologia',   name: 'Tecnología',   kind: 'flat', value: 5000000 },
  // Planeta (idx 8)
  { era: 8,  id: 'tectonica',    name: 'Tectónica',    kind: 'mult', value: 2 },
  { era: 8,  id: 'atmosfera',    name: 'Atmósfera',    kind: 'flat', value: 5e7 },
  // Sistema Solar (idx 9)
  { era: 9,  id: 'gravedad',     name: 'Gravedad',     kind: 'mult', value: 2 },
  { era: 9,  id: 'radiacion',    name: 'Radiación',    kind: 'flat', value: 5e8 },
  // Galaxia (idx 10)
  { era: 10, id: 'espiral',      name: 'Espiral',      kind: 'mult', value: 2 },
  { era: 10, id: 'dilatacion',   name: 'Dilatación',   kind: 'flat', value: 5e9 },
  // Universo (idx 11)
  { era: 11, id: 'inflacion',    name: 'Inflación',    kind: 'mult', value: 2 },
  { era: 11, id: 'singularidad', name: 'Singularidad', kind: 'flat', value: 5e10 },
];

// Construir CLICK_UPGRADES con costo derivado del 3er generador de la era.
const CLICK_UPGRADES = UPGRADE_DEFS.map(def => {
  const stage = STAGES[def.era];
  const cost = stage.generators[2].baseCost; // índice 2 = 3er generador
  return { ...def, cost };
});

function findUpgrade(id) {
  return CLICK_UPGRADES.find(u => u.id === id) || null;
}
