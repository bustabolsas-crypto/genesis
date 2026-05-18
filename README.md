# Génesis

Juego incremental web de tema cósmico. Empezás como un punto de luz y, click a click, evolucionás hasta convertirte en un universo entero. Al llegar al final, podés colapsarlo todo y empezar de nuevo con un multiplicador permanente.

Stack: **HTML + CSS + JavaScript vanilla**. Sin frameworks, sin build, sin dependencias.

## Cómo correrlo

Es un sitio estático puro.

### Opción 1 — Doble click

Hacé doble click en `index.html`. Se abre en tu navegador y funciona. Las fuentes se cargan desde Google Fonts (necesita conexión la primera vez); el juego en sí trabaja 100% offline una vez cargado, y guarda en `localStorage` desde `file://` sin problema.

### Opción 2 — Servidor local

Si querés evitar cualquier rareza de `file://`:

```bash
python3 -m http.server 8000
# y abrir http://localhost:8000
```

## Cómo se juega

1. **Click** sobre el punto de luz para generar Energía.
2. Cuando tengas suficiente E, comprás **generadores** del panel lateral. Cada generador produce E/segundo automáticamente.
3. Al cruzar el umbral de cada era, se desbloquea la siguiente con sus propios generadores. Hay **12 eras**: Vacío → Partícula → Átomo → Molécula → Célula → Organismo → Especie → Civilización → Planeta → Sistema Solar → Galaxia → Universo.
4. Al alcanzar el Universo, aparece el botón **BIG BANG**: colapsás el run actual a cambio de **Constantes Universales (CU)**, que multiplican la producción para siempre.

## Features

### Mecánicas
- 12 eras con visuales únicos en canvas (átomos con órbitas elípticas, células que se dividen, planetas rotando, galaxias en espiral, etc.).
- 4 generadores en Partícula + 5 en cada una de las 10 eras siguientes (54 totales).
- Costos crecientes (×1.15 por compra) con balanceo automático entre eras.
- Multiplicador de prestige: `1 + CU × 0.05`.
- Fórmula de CU: `floor(sqrt(E_run / 1e10))`.

### Persistencia
- Auto-save cada 10 segundos en `localStorage`.
- Botón **Guardar** manual.
- Cálculo offline al volver: hasta 4 horas de producción ganada, mostrada en un modal de bienvenida con un botón "Recoger".
- **Exportar/Importar partida** como string base64 (ajustes → exportar copia al portapapeles).

### UX
- Tutorial contextual de 3 pasos que aparece **una sola vez** (intro, primer generador, primera era nueva).
- Notificación grande con flash al desbloquear cada era.
- Animación de Big Bang de 4 segundos (explosión radial, flash, fade, renacer).
- Paleta de colores única por era con transición suave (~3s).
- Pausa breve del game loop al cambiar de era para dar peso dramático.
- Contador de Energía con suavizado al subir, salto seco al gastar.
- Tarjetas de generadores con animación de entrada en stagger y pulse al comprar.

### Modo dev (consola del navegador)
```js
Game.devSetEra(11)   // saltar a Universo
Game.devGiveCU(1000) // otorgar CU para probar el multiplicador
```

## Estructura

```
genesis/
├── index.html         # estructura y puntos de anclaje del DOM
├── styles.css         # tema oscuro, layout en grid, modal, tooltip
├── js/
│   ├── game.js        # estado, game loop, cálculo offline
│   ├── stages.js      # las 12 eras, generadores y paletas (datos)
│   ├── visuals.js     # canvas: 12 renderers + transiciones + Big Bang
│   ├── prestige.js    # lógica del Big Bang y CU
│   ├── tutorial.js    # tooltips contextuales
│   ├── ui.js          # DOM, formato de números, modal genérico, settings
│   └── save.js        # persistencia en localStorage
└── README.md
```

Los scripts no usan módulos ES (importación) para que funcione en `file://` sin servidor. Cada archivo expone un objeto global (`Game`, `Visuals`, `UI`, `Modal`, `Save`, `Prestige`, `Tutorial`, `STAGES`).

## Plan de fases

- **Fase 1** — Esqueleto jugable: HTML/CSS, game loop, click manual con partículas, contador de energía, save/reset manual.
- **Fase 2** — Primera era completa: generadores, costos crecientes, transición Vacío → Partícula, auto-save.
- **Fase 3** — Las 12 eras: cada una con 5 generadores, paleta de colores, renderer único, transición suave.
- **Fase 4** *(esta versión)* — Big Bang, CU, cálculo offline, tutorial, settings (export/import/reset), polish.

## Notas técnicas

- **No hay sonidos** todavía: el toggle de "Sonidos" en ajustes guarda la preferencia pero no reproduce nada.
- **Cap del cálculo offline** en 4 horas (14400s) y `Math.max(0, ...)` para tolerar saltos de reloj hacia atrás.
- **formatNumber** usa sufijos cortos (K, M, B, T, Qa, Qi, Sx, Sp, Oc) hasta 10²⁹ y notación científica de 10³⁰ en adelante.
- **Performance**: el array de partículas se capea a 1000 para no bajar fps en clicks frenéticos.
- **Compatibilidad de saves**: los saves de fases anteriores se cargan correctamente; los campos nuevos toman valores por defecto.
