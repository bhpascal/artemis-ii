# CLAUDE.md — Artemis II Explorable Explanation

## What This Is

A Bret Victor-style "explorable explanation" of the orbital mechanics behind NASA's Artemis II free-return lunar trajectory. The mission launched April 1, 2026 and is currently in progress. The page teaches orbital mechanics through interactive visualizations where the reader manipulates parameters and watches trajectories change in real time.

**Inspirations**: Bret Victor's [Ladder of Abstraction](https://worrydream.com/LadderOfAbstraction/), Nicky Case's explorable explanations, Wired's "5 Levels of Difficulty" video series.

**Full project spec**: `docs/project-spec.md` — contains all research data, physics requirements, section designs, and architecture decisions. Read it before starting work.

**Live data sources**: `docs/live-data-sources.md` — API endpoints for real telemetry (community orbit API, AROW, JPL Horizons, mission timeline). Already integrated into Hook section.

**Claude Web visualization reference**: `docs/claude-web-viz` — comprehensive CR3BP analysis including the Arenstorf orbit approach (see "Current Status" below).

**Flyby rewrite spec**: `docs/flyby-rewrite-spec.md` — HISTORICAL. The patched-conic solver was replaced by a CR3BP integrator (`src/physics/cr3bp.ts`). This spec documents the debugging journey but the code it describes no longer exists.

## Current Status (as of 2026-04-09)

**What's working:**
- Sections 1-4 render with CR3BP trajectories at real μ = 0.012277471. No mass enhancement anywhere.
- **Free Return section uses 2D LEO-injection CR3BP at real μ** — slider controls injection Δv (3138–3143 m/s, step 0.1), sweet spot at 3142.5 (16 km reentry perigee). Δv=3140 misses (4,883 km perigee), Δv=3143 crashes into Earth. 6 m/s window between "misses" and "crashes". Flyby altitude at sweet spot is ~22,900 km — wider than real Artemis II (~6,500 km) because strict 2D geometry loses the slight inclination tightening the real mission uses.
- **Real Mission section uses real JPL Horizons ephemeris** for Orion (-1024) at 30-minute intervals. Flyby values match reality: 413,005 km Earth distance, 8,520 km Moon distance, 0.42 km/s at T+5d.
- Live telemetry in Hook section from `artemis.cdnspace.ca/api/orbit`
- Countdown to lunar closest approach
- Behind the Scenes page at `/behind-the-scenes`
- Physics test suite: `npm test` runs 24 vitest tests. Run these after any `cr3bp.ts` change.

**Why the Arenstorf detour got reverted (2026-04-09):**
A reference doc in `docs/claude-web-viz` claimed the Hairer benchmark Arenstorf orbit (x₀=0.994, ẏ₀=−2.00158) produces a "perfect figure-8". That claim is wrong — the orbit actually has 3 Earth lobes + 1 Moon flyby per period (6 axis crossings). True simple figure-8 periodic orbits don't really exist in the CR3BP at Earth-Moon mass ratio. What you want for "free return" is a *non-periodic* single-pass trajectory, which the old μ=0.15 LEO propagator was approximating. After a proper scan, 2D LEO injection at real μ DOES produce clean free returns — we just needed the right (Δv, injection angle) combo: (3142.5 m/s, 65°). The old μ=0.15 enhancement was a band-aid for a search that gave up too early.

The Arenstorf propagator and tests are still in the code (`propagateArenstorf()`, `renderArenstorfTrajectory()`, Arenstorf test cases) but unused by production. Could be deleted or kept as a "look at three-body periodic orbits" bonus. For now: unused.

**Refreshing ephemeris data:**
`npm run fetch-ephemeris` runs `scripts/fetch-ephemeris.ts`, which hits the JPL Horizons API for Orion and Moon, transforms into the 2D co-rotating frame, and writes `src/data/orion-trajectory.json`. Committed to git — builds do not hit Horizons. Re-run manually when fresh data is wanted.

**What's next:**
- **Inertial frame toggle**: Commented out in Free Return — needs CR3BP→inertial coordinate rotation. Transform formulas are in `docs/claude-web-viz`.
- **Behind the Scenes page**: Add the whole debugging arc: patched-conic failure → CR3BP at μ=0.15 → Arenstorf detour (and why the reference doc was wrong) → final Option D at real μ → real Horizons data for Section 5.
- **Cleanup**: Delete the unused Arenstorf code (`propagateArenstorf`, `renderArenstorfTrajectory`, their tests) once we're sure we don't want them as a bonus.

## Tech Stack

- **React + TypeScript** — component-based, type-safe
- **Vite** — fast dev server, simple build, static output
- **Modern CSS** — CSS Modules or vanilla CSS, no Tailwind (Tufte typography needs precise control)
- **HTML5 Canvas** — for orbital visualizations (not SVG — too slow for thousands of path points)
- **No heavy dependencies** — no MathJax/KaTeX (hand-crafted HTML math so equation terms can be scrubable), no physics libraries (we write the orbital mechanics)
- **Deploy**: Vercel static site from `dist/`

## Design Philosophy

### Tufte Typography
- ET Book font family (load from CDN: `edwardtufte.github.io/tufte-css/`)
- ~740px content column, generous right margin for sidenotes
- Sidenotes, not footnotes. On mobile (<760px), sidenotes collapse to toggleable inline elements
- Background: `#fffff8`. Text: `#111`. Links: understated
- Headings use size and spacing, not bold (Tufte convention)
- Math rendered as styled HTML (`<var>`, `<sup>`, flex-based fractions), not images or library output

### Interactive Elements
- **Scrubable numbers**: Inline numbers the reader can click-drag to change. They update linked visualizations in real time. Inspired by Bret Victor's Tangle library. Use pointer events (not separate mouse/touch). Visually: subtle dotted underline, cursor: col-resize, color accent
- **Canvas visualizations**: Embedded in the narrative flow, wider than the text column (spanning into sidenote margin). Each section has its own canvas with its own controller
- **Sliders**: For large-range parameters (e.g., mission time scrubber). Bidirectionally linked with any corresponding scrubable numbers
- **Progressive narrative**: Concepts build on each other. Scroll-driven — IntersectionObserver activates/deactivates canvas renderers for performance

### The 5-Level Explanation System

A floating panel lets the reader switch explanation level in real time. **The interactive visualizations are identical at every level** — only the prose and equations change. This is the core design constraint.

| Level | Label | Audience | Math Available |
|-------|-------|----------|----------------|
| 1 | Curious Kid | ~8 years old | No math. Pure metaphor. "Throw a ball so fast it misses the ground" |
| 2 | Middle School | ~12 years old | Arithmetic, basic algebra. Speed = distance/time. Proportional reasoning |
| 3 | High School Physics | ~17 years old | Trig, vectors, F = GMm/r^2. Newton's laws. **This is the default level** |
| 4 | Undergrad Physics | College + physics courses | Calculus, conservation laws, vis-viva equation. Can follow derivations |
| 5 | B.S. Physics | Physics degree holder | Has the full toolkit. Sonar pings into deeper topics (Lagrangian mechanics, restricted 3-body problem, Jacobi constants) — map the rabbit holes without full analysis |

**Implementation**: All 5 text variants live in the DOM simultaneously. CSS controls visibility (`display: none` + opacity transition). A `LevelManager` responds to button clicks and dispatches a `levelchange` CustomEvent. Section controllers listen and adjust canvas annotations accordingly.

**The floating panel**: Fixed position, right side, vertically centered. Vertical stack of buttons with active level highlighted. On mobile, collapses to bottom sheet or dropdown.

## Architecture

### Component Structure (suggested)
```
src/
  components/
    Article.tsx              — Main layout, Tufte structure
    LevelSwitcher.tsx        — Floating 5-level panel
    LevelText.tsx            — Wrapper that shows/hides based on active level
    ScrubableNumber.tsx      — Draggable inline number
    InteractiveFigure.tsx    — Canvas wrapper with controls
    Sidenote.tsx             — Tufte-style sidenote
    MathBlock.tsx            — Centered equation display
    MathFrac.tsx             — Fraction component for equations
  sections/
    HookSection.tsx          — Section 1: current mission status
    NewtonCannonSection.tsx  — Section 2: orbits from first principles
    TransferOrbitSection.tsx — Section 3: reaching the Moon
    FreeReturnSection.tsx    — Section 4: the free return (centerpiece)
    RealMissionSection.tsx   — Section 5: actual Artemis II trajectory
  physics/
    constants.ts             — Physical constants + Artemis II mission data
    kepler.ts                — Kepler equation solver, eccentric/true anomaly
    orbits.ts                — Vis-viva, orbital elements, conic geometry
    patched-conics.ts        — Full Earth→Moon→Earth trajectory computation
    trajectory.ts            — Pre-computed Artemis II trajectory
  rendering/
    canvas-utils.ts          — Coordinate transforms, drawing primitives
    orbit-renderer.ts        — Orbit path drawing
    body-renderer.ts         — Earth, Moon, spacecraft drawing
    annotation-renderer.ts   — Labels, dimension lines (level-aware)
  hooks/
    useLevel.ts              — Level context/state
    useScrubable.ts          — Scrubable number logic
    useCanvasRenderer.ts     — Canvas setup + animation frame management
    useIntersectionObserver.ts — Scroll-driven activation
  styles/
    tufte.css                — Base Tufte typography
    interactive.css          — Canvas figures, scrubable numbers, sliders
    level-switcher.css       — Floating panel styles
  App.tsx
  main.tsx
```

### Data Flow
Unidirectional, event-driven:
```
User Input (scrub/slider) → Parameter State (useState) → Physics Recomputation → Canvas Render
```
Each section owns its own state. Sections are independent — changing a parameter in one does not affect another. The level system is the only cross-cutting concern (React context).

### Performance
- Only render canvases that are in the viewport (IntersectionObserver)
- Physics computations are pure functions — fast, no allocation churn
- Use `requestAnimationFrame` for animations, not setInterval
- Pre-compute the Artemis II trajectory once at load time (~50ms)

## Physics Implementation Notes

The physics must be **real orbital mechanics**, not hand-waved approximations. The spec has full details, but the key algorithms:

1. **Vis-viva equation**: `v^2 = mu * (2/r - 1/a)` — the fundamental relationship
2. **Kepler equation solver**: Newton-Raphson iteration for eccentric anomaly from mean anomaly
3. **Patched conic approximation**: Three segments (Earth ellipse → Moon hyperbola → Earth return ellipse), velocity/position "patched" at SOI boundaries
4. **Hyperbolic flyby**: Turn angle from `delta = 2 * arcsin(1/e)` where eccentricity comes from approach velocity and periapsis distance

### Verification
Embed a test mode (`?test=1` URL parameter) that validates:
- Circular velocity at 200km LEO = ~7,784 m/s
- Escape velocity at 200km = ~11,009 m/s
- Kepler solver convergence for known cases
- Conservation of energy/angular momentum within each conic segment
- Artemis II trajectory matches known mission parameters (max distance, flyby altitude, duration)

## Writing Standards

The prose is as important as the code. This is an essay with embedded interactives, not a tech demo with captions.

- Each section tells a story. The interactive is the argument, not an illustration
- At Level 1: short sentences, wonder and excitement, concrete metaphors
- At Level 3 (default): clear technical writing, equations introduced with motivation
- At Level 5: assume competence, point toward deeper structure, name the theorems
- Sidenotes for tangents, historical notes, "fun facts"
- The Artemis II mission is happening RIGHT NOW — use present tense, create urgency

## Commit Conventions

- `feat:` new sections, interactives, components
- `fix:` physics bugs, rendering issues
- `style:` typography, layout, CSS
- `docs:` README, comments
- `refactor:` code restructuring
- `perf:` rendering optimizations

## Don't

- Don't add a build framework heavier than Vite
- Don't use MathJax or KaTeX (need scrubable terms inside equations)
- Don't use a CSS framework (Tufte typography needs precise manual control)
- Don't fake the physics — every trajectory must come from real equations
- Don't make the level switcher feel like a settings panel. It should feel like a reading mode — effortless, delightful
- Don't neglect mobile. Sidenotes collapse, canvases resize, level switcher adapts
