# Artemis II Explorable Explanation — Project Specification

## 1. Overview

An interactive web page that teaches orbital mechanics through the lens of NASA's Artemis II mission, currently in progress (launched April 1, 2026). The format follows Bret Victor's "explorable explanation" pattern: Tufte-style typography with inline interactive visualizations where the reader manipulates parameters and watches trajectories update in real time.

A floating 5-level explanation switcher (inspired by Wired's "5 Levels of Difficulty") lets the reader change the depth of explanation in real time. The visualizations stay identical at every level — only the prose and equations morph.

Deploy to Vercel as a static site via GitHub.

---

## 2. Artemis II Mission Data

All data sourced from NASA, ESA, and space journalism as of April 4, 2026. The mission is currently in transit to the Moon.

### Launch and Vehicle

- **Launch**: April 1, 2026, 6:35 PM EDT from Launch Complex 39B, Kennedy Space Center
- **Vehicle**: SLS (Space Launch System) Block 1
  - 322 feet tall, 5.7 million pounds at liftoff
  - Core stage: four RS-25D engines (Shuttle heritage)
  - Boosters: two five-segment SRBs, 3.6 million lbs thrust each
  - Total liftoff thrust: 8.8 million pounds (39,000 kN)
  - Upper stage: ICPS (Interim Cryogenic Propulsion Stage) — modified Delta Cryogenic Second Stage, single RL10 engine, 24,750 lbs thrust, LH2/LOX
- **Spacecraft**: Orion capsule CM-003, crew-named "Integrity"
  - Service module: European Service Module (ESM), built by ESA/Airbus
  - ESM main engine: AJ10, 6,000 lbs thrust
  - Solar array wingspan: ~63 feet

### Crew

| Role | Name | Agency | Notable |
|------|------|--------|---------|
| Commander | Reid Wiseman | NASA | Former Navy test pilot, ISS veteran |
| Pilot | Victor Glover | NASA | First person of color to fly to the Moon |
| Mission Specialist 1 | Christina Koch | NASA | First woman to fly to the Moon; longest single spaceflight by a woman (328 days) |
| Mission Specialist 2 | Jeremy Hansen | CSA | First Canadian to fly to the Moon; first non-American beyond LEO |

### Mission Timeline (10 days)

**Day 1 — Launch and Earth Orbit (April 1)**
- T+0: Liftoff. SRB separation ~2 min. Core stage separation ~8 min.
- T+49 min: ICPS perigee raise maneuver (RL10 engine)
- T+1h48m: ICPS apogee raise maneuver. Raises orbit to ~1,500 x 46,000 miles (2,414 x 74,030 km). 24-hour period. 46,000-mile apogee is ~1/6 of the way to the Moon.
- ICPS separates. Crew performs proximity operations (manual flying near spent stage).

**Day 2 — Trans-Lunar Injection (April 2)**
- ESM perigee correction burn: AJ10 fires ~43 seconds
- **TLI burn at 7:49 PM EDT**: AJ10 fires for **5 minutes 49 seconds** (349 sec)
  - **Delta-v: ~388 m/s** (1,274 ft/s). This is added to the already-raised orbit velocity.
  - Post-TLI velocity: ~25,000 km/h (6,944 m/s) relative to Earth
  - Places Orion on a **free-return trajectory**
- Key difference from Artemis I: on the uncrewed flight, ICPS performed TLI. On Artemis II, ESM performs TLI because ICPS was expended on the orbit-raising maneuvers needed for crewed mission checkout time.
- First humans to leave Earth orbit since Apollo 17, December 1972 — a 53-year gap.

**Days 3-4 — Outbound Transit (April 3-4)**
- Systems monitoring, biomedical data on deep-space radiation
- Trajectory correction burns as needed (small ESM firings)
- Lunar photography practice

**Day 5 — Entering Lunar Sphere of Influence (April 5)**
- Orion crosses into the Moon's gravitational sphere of influence
- No lunar orbit insertion — flyby only

**Day 6 — Lunar Flyby (April 6)**
- **Closest approach: ~4,047 miles (6,513 km) from the lunar surface** (far side)
- **Maximum distance from Earth: 252,757 miles (406,773 km)**
  - Breaks Apollo 13's record of 248,655 miles (400,171 km) by ~4,100 miles
- Brief loss of radio contact behind the far side
- Moon appears as large as a basketball held at arm's length
- Moon's gravity bends trajectory, redirecting Orion back toward Earth — the "free return"

**Days 7-9 — Return Transit (April 7-9)**
- Trajectory correction burns for reentry targeting
- Cabin prep for reentry

**Day 10 — Reentry and Splashdown (April 10)**
- Orion separates from ESM
- **Reentry speed: ~25,000 mph (40,000 km/h)** — fastest crewed reentry ever
- **Heat shield: ~5,000 deg F (2,760 deg C)**. Largest ablative heat shield ever built (16.5 ft diameter)
- Parachute sequence: 2 drogue chutes, then 3 main chutes
- **Splashdown: ~8:06 PM EDT**, Pacific Ocean near San Diego

### Notable Events (as of April 4)

- **Battery sensor**: Pre-launch, one LAS battery showed high temperature. Determined to be faulty sensor, not thermal issue. Launched on schedule.
- **Comms glitch (Day 1)**: Brief loss of two-way comms. Traced to ground TDRS configuration issue. Resolved quickly.
- **Toilet (Days 1-3)**: Waste pump wouldn't prime (insufficient water). Then frozen urine in external vent line. Both resolved by Day 3.
- **Outlook (Day 1)**: Neither Microsoft Outlook installation on crew laptops was working. Mission Control provided tech support. (Yes, really.)
- **Overall**: NASA characterizes all issues as minor. Mission proceeding nominally.

---

## 3. Orbital Mechanics — Physics to Implement

### 3.1 Constants

```
mu_earth  = 3.986004418e14   m^3/s^2   (GM for Earth)
mu_moon   = 4.9048695e12     m^3/s^2   (GM for Moon)
R_earth   = 6.371e6          m         (mean radius)
R_moon    = 1.7374e6         m
D_moon    = 3.844e8          m         (mean Earth-Moon distance)
SOI_moon  = 6.6183e7         m         (~66,183 km, Moon's sphere of influence)
```

### 3.2 The Vis-Viva Equation

The fundamental energy equation of orbital mechanics, from conservation of energy:

```
v^2 = mu * (2/r - 1/a)
```

Where:
- v = orbital speed at distance r from the central body
- mu = GM (gravitational parameter)
- r = current distance from center of mass
- a = semi-major axis of the orbit

Derived quantities:
- Circular orbit velocity: `v_circ = sqrt(mu / r)`
- Escape velocity: `v_esc = sqrt(2 * mu / r)`
- Orbital energy: `epsilon = -mu / (2*a)` (negative for bound orbits)

For LEO at 200 km altitude:
- r = 6.571e6 m
- v_circ = 7,784 m/s
- v_esc = 11,009 m/s
- TLI delta-v from LEO to reach Moon: ~3,130 m/s (Artemis II started from a higher orbit, so only needed 388 m/s from ESM)

### 3.3 Kepler's Equation

Relates time to position along an orbit. For elliptical orbits:

```
M = E - e * sin(E)
```

Where:
- M = mean anomaly (proportional to time: M = n * t, where n = sqrt(mu / a^3))
- E = eccentric anomaly (geometric parameter)
- e = eccentricity

Solve for E given M using Newton-Raphson iteration:
```
E_{n+1} = E_n - (E_n - e*sin(E_n) - M) / (1 - e*cos(E_n))
```
Converges in 6-8 iterations to 1e-12 precision.

Convert eccentric anomaly to true anomaly:
```
tan(nu/2) = sqrt((1+e)/(1-e)) * tan(E/2)
```

For hyperbolic orbits (flyby), use the hyperbolic Kepler equation:
```
M = e * sinh(H) - H
```
Newton-Raphson: `H_{n+1} = H_n - (e*sinh(H_n) - H_n - M) / (e*cosh(H_n) - 1)`

### 3.4 Orbit Geometry

Position in orbital plane from true anomaly:
```
r = a * (1 - e^2) / (1 + e * cos(nu))
x = r * cos(nu)
y = r * sin(nu)
```

For an ellipse: `0 < e < 1`, `a > 0`
For a hyperbola: `e > 1`, `a < 0`

Useful functions to implement:
- `ellipsePoints(a, e, nPoints)` → array of {x, y} around the full ellipse
- `hyperbolaPoints(a, e, nuMax)` → array of {x, y} for the hyperbolic arc
- `orbitStateAtAnomaly(a, e, mu, nu)` → {x, y, vx, vy}

### 3.5 Patched Conic Approximation

The three-body problem (Earth + Moon + spacecraft) has no closed-form solution. The patched conic method breaks the trajectory into segments, each governed by one body:

**Segment 1 — Earth-departure ellipse** (TLI to Moon's SOI):
- Central body: Earth. Moon's gravity ignored.
- From vis-viva at injection point: `a = 1 / (2/r - v^2/mu_earth)`
- Eccentricity from: `e = 1 - r_periapsis / a` (if injecting at periapsis)
- Propagate using Kepler's equation until spacecraft reaches Moon's SOI

**Segment 2 — Lunar hyperbola** (inside Moon's SOI):
- Central body: Moon. Earth's gravity ignored.
- Convert state to Moon-centered frame (subtract Moon's position and velocity)
- v_infinity = magnitude of velocity relative to Moon at SOI entry
- Hyperbolic orbit elements:
  - `a_hyp = -mu_moon / v_inf^2`
  - `e_hyp = 1 + r_periapsis * v_inf^2 / mu_moon`
  - Turn angle: `delta = 2 * arcsin(1 / e_hyp)`
- For Artemis II: flyby at 6,513 km altitude → r_periapsis = 6,513e3 + 1.7374e6 m

**Segment 3 — Earth-return ellipse** (Moon's SOI to Earth):
- Convert exit state back to Earth-centered frame (add Moon's position/velocity)
- Compute return orbit from exit state
- Propagate to Earth reentry

At each SOI boundary, position and velocity are "patched" — converted between reference frames. This is why it's called "patched conics."

**Finding SOI intersection**: The departure ellipse must intersect a sphere of radius SOI_moon centered on the Moon's position. This requires iterative solving (bisection on true anomaly, checking distance to Moon at each point).

### 3.6 The Free-Return Trajectory

What makes it special: after the TLI burn, the spacecraft follows a path that loops around the Moon's far side and returns to Earth **without any additional engine burn**. The Moon's gravity does all the redirection. This is the ultimate safety feature — if all engines fail after TLI, the crew still comes home (as demonstrated by Apollo 13).

The flyby altitude is the critical parameter:
- Too close: Moon bends the path too much, spacecraft misses Earth on return
- Too far: not enough bending, also misses Earth
- Sweet spot: return trajectory targets the correct reentry corridor

The relationship: lowering flyby altitude increases eccentricity of the hyperbolic flyby, which increases the turn angle. The Artemis II altitude of 6,513 km was chosen to produce the correct return trajectory.

### 3.7 Level 5 Depth — Sonar Pings

At Level 5 (B.S. Physics), the prose should acknowledge and briefly sketch these deeper topics without full derivation:

- **The Lagrangian approach**: L = T - V in polar coordinates gives the orbit equation via Euler-Lagrange. The cyclic coordinate theta yields angular momentum conservation directly. Name it, write the Lagrangian, point at the result.
- **The restricted three-body problem**: When you don't ignore the second body's gravity, you get the CR3BP. Jacobi constant (the one integral of motion). Mention zero-velocity curves. Don't derive.
- **Lagrange points**: Where the effective potential has equilibria. L1-L5. Note that Artemis III (Lunar Gateway) will use a near-rectilinear halo orbit around L2.
- **Why patched conics is approximate**: It ignores the transition region where both bodies matter. Modern mission design uses numerical integration of the full force model. Patched conics gets you within ~1% for Earth-Moon transfers.
- **Perturbation theory**: Real trajectories are perturbed by solar gravity, Earth's J2 oblateness, solar radiation pressure. These are why trajectory correction burns exist.
- **Hohmann vs. free-return**: Hohmann transfers are minimum-energy but require a circularization burn at arrival. Free-return trades fuel efficiency for safety. Compare the delta-v budgets.

---

## 4. Section Design

### Section 1: The Hook

**Opening line (Level 3)**: "Right now, as you read this, four astronauts are falling toward the Moon."

**Canvas**: Simple animation — Earth (left), Moon's orbit (gray arc), and a blinking dot for Orion at its current approximate position. Computed from actual elapsed mission time (`Date.now()` vs. launch date). A thin dashed line traces the predicted remaining trajectory.

**Interactivity**: Minimal. The animation runs automatically. The position updates if the reader sits on the page. A small clock shows mission elapsed time.

**Purpose**: Set the stakes. This isn't hypothetical — it's happening right now. Then: "How does NASA know this path will bring them home? That's what this page is about."

**Level variations**:
- Level 1: "Right now, four people are on the longest road trip in history — to the Moon and back!"
- Level 3: (as above, with velocity/distance readout)
- Level 5: "Orion is currently at [computed] km from Earth, traveling at [computed] km/s on a free-return trajectory with the following osculating elements: ..."

### Section 2: Orbits from First Principles (Newton's Cannon)

**Concept**: Start with the thought experiment Newton described in the Principia — a cannon on a very tall mountain. Fire horizontally. At low velocity, the ball falls to the ground. Faster: it goes farther. Fast enough: it curves around the Earth. Even faster: it escapes entirely.

**Canvas**: Earth rendered at center-bottom of canvas. A mountain peak at the top. A cannon points horizontally. The cannonball traces its path. The path redraws as the reader adjusts velocity.

**Interactive parameters**:
- `cannonVelocity`: scrubable number + slider, range 5,000–12,000 m/s, step 50 m/s

**Physics** (what happens at each velocity):
- v < ~7,784 m/s: Suborbital. Trajectory intersects Earth's surface. Color: red
- v ≈ 7,784 m/s: Circular orbit. Color: green. Annotation: "This is a circular orbit"
- 7,784 < v < 11,009 m/s: Elliptical orbit. Grows larger. Color: yellow/orange
- v ≈ 11,009 m/s: Parabolic escape. Color: blue. Annotation: "Escape velocity"
- v > 11,009: Hyperbolic escape. Color: blue-purple

**Key teaching moment**: The vis-viva equation emerges naturally. "The speed you start at determines the entire shape of your orbit." At Level 3, show the equation. At Level 4, derive it from energy conservation. At Level 5, from the Lagrangian.

**Sidenote opportunity**: "Newton imagined this in 1687. It took 270 years to actually do it."

### Section 3: Reaching the Moon (Transfer Orbits)

**Concept**: Now we have a spacecraft in circular low Earth orbit. To reach the Moon, we fire the engine to speed up. The orbit stretches. How much do we speed up to reach the Moon's distance?

**Canvas**: Earth at center (small blue dot), Moon's orbit drawn as a gray circle at 384,400 km. The spacecraft's orbit is an ellipse that grows as the reader increases delta-v.

**Interactive parameters**:
- `tliDeltaV`: scrubable number + slider, range 0–4,000 m/s, step 10 m/s
- Annotations update: apoapsis distance, transfer time, orbital period

**Physics**:
- Starting velocity: v_circ at 200 km = 7,784 m/s
- New velocity: 7,784 + tliDeltaV
- From vis-viva: `a = 1 / (2/r - v^2/mu)`, then apoapsis = 2a - r
- When apoapsis reaches 384,400 km: "Your orbit now reaches the Moon!"
- Required delta-v from LEO: ~3,130 m/s

**Key teaching moment**: Explain why Artemis II only needed 388 m/s for TLI — the ICPS already raised the orbit to 1,500 x 46,000 miles. The ESM just added the final push. Show energy equivalence: total energy added across all burns equals what a single 3,130 m/s burn from LEO would provide.

**Sidenote**: Introduce patched conics concept here. "We've been pretending the Moon's gravity doesn't exist. That's about to change."

### Section 4: The Free Return (Centerpiece)

**Concept**: When the spacecraft reaches the Moon, the Moon's gravity grabs it, swings it around, and flings it back toward Earth — for free. No engine burn needed. This is the trajectory that kept Apollo 13's crew alive.

**Canvas**: Full Earth-Moon system. Earth (blue, left), Moon (gray, right), and the complete free-return trajectory in three colored segments: departure (blue), lunar flyby (red), return (green). Moon's SOI drawn as a subtle dashed circle.

**Interactive parameters**:
- `flybyAltitude`: scrubable number, range 100–20,000 km, step 100 km. **This is the star interaction.** As the reader changes flyby altitude, the deflection angle changes visibly, and the return path swings. There's a sweet spot where the return trajectory targets Earth.
- `tliVelocity`: scrubable number for fine-tuning injection (secondary control)

**Physics**: Full patched conic computation (see Section 3.5 of this spec):
1. Compute departure ellipse
2. Find SOI intersection
3. Compute hyperbolic flyby at given altitude
4. Compute return ellipse from exit state
5. Check if return trajectory hits Earth

**Inset view**: A zoomed-in view of the lunar flyby showing the hyperbolic path, periapsis point, deflection angle arc, and velocity vectors at entry/exit.

**Critical visualization**: As flyby altitude changes:
- Very low (~100 km): extreme deflection, return path overshoots
- Sweet spot (~6,500 km for Artemis II parameters): return path hits Earth
- Very high (~20,000 km): minimal deflection, return path undershoots
- The reader discovers the sweet spot by playing with the slider

**Level variations**:
- Level 1: "The Moon acts like a giant slingshot! If the spaceship flies by at just the right distance, the Moon flings it right back home."
- Level 3: Show force arrows during flyby. Explain that speed relative to Moon is the same entering and leaving (elastic gravitational interaction). The direction change is what matters.
- Level 4: Derive the turn angle from hyperbolic geometry. Show energy conservation across SOI boundary. Explain the velocity frame transformation.
- Level 5: Note the Jacobi constant. Discuss why patched conics is ~1% accurate here and what numerical integration adds. Mention the sensitivity to initial conditions — small TLI errors propagate.

**Apollo 13 sidenote**: "In April 1970, an oxygen tank exploded on Apollo 13, disabling the main engine. The crew survived because they were on a free-return trajectory. The Moon brought them home."

### Section 5: The Real Artemis II

**Concept**: Lock in the actual mission parameters. Let the reader scrub through the entire 10-day mission.

**Canvas**: The largest visualization. Full trajectory with the spacecraft as a moving dot. Data overlay showing real-time numbers.

**Interactive parameters**:
- `missionTime`: Large slider spanning T+0 to T+10 days. This is the primary interaction.
- As the reader scrubs, the spacecraft moves along the pre-computed trajectory

**Data panel** (updates with time scrubber):
- Mission elapsed time (hours:minutes)
- Calendar date and time (EDT)
- Distance from Earth (km and miles)
- Distance from Moon (km and miles)
- Velocity relative to Earth (km/s and mph)
- Current mission phase

**Timeline bar**: Below the canvas, a horizontal bar divided into phases:
- Launch / Orbit Raising / TLI Burn / Outbound Coast / Lunar Flyby / Return Coast / Reentry & Splashdown
- Key events marked: ICPS separation, TLI burn start/end, max distance from Earth, closest lunar approach, CM/SM separation, splashdown

**Rendering**:
- Full trajectory as a faded path (pre-drawn)
- Spacecraft position highlighted with a pulsing dot
- Velocity vector as a scaled arrow
- Thin lines to Earth and Moon showing current distances
- Phase-colored trajectory segments

**Level variations**:
- Level 1: Simple labels along the path ("Leaving home", "Halfway there!", "Going around the Moon!", "Almost back!")
- Level 3: Velocity and distance numbers at key points. Explain the velocity profile — why the spacecraft slows down going out and speeds up coming back.
- Level 5: Full state vector at current time. Osculating orbital elements. Comparison note: "In practice, trajectory correction burns adjust for solar perturbation, J2, and measurement uncertainty. The patched conic model you're seeing is within ~1% of the actual ephemeris."

---

## 5. The Level Switcher UI

### Visual Design

A floating panel on the right side of the viewport, vertically centered. Designed to feel like a "reading mode" selector, not a settings panel.

```
  ┌─────────────┐
  │  Explanation │
  │    Level     │
  ├─────────────┤
  │ ○ Curious   │
  │   Kid       │
  ├─────────────┤
  │ ○ Middle    │
  │   School    │
  ├─────────────┤
  │ ● HS        │  ← active (default)
  │   Physics   │
  ├─────────────┤
  │ ○ Undergrad │
  │   Physics   │
  ├─────────────┤
  │ ○ B.S.      │
  │   Physics   │
  └─────────────┘
```

- Subtle background (semi-transparent, slight blur)
- Active level has a filled indicator and slightly bolder text
- Hover state on inactive levels
- Transition: when switching levels, a brief content fade (150ms out, 150ms in)
- Keyboard accessible (arrow keys to switch)
- On mobile (<760px): collapses to a compact bottom bar or single-button dropdown

### Behavior

- Default level: 3 (High School Physics)
- Switching levels morphs all visible text simultaneously
- Canvas visualizations do NOT change — only prose and annotations
- At higher levels, additional equation blocks may appear/disappear
- Canvas annotation detail increases with level (e.g., Level 1 shows "speed", Level 4 shows "v = 10,840 m/s")
- Level preference persists in localStorage across page reloads

---

## 6. Scrubable Numbers — Implementation Guide

Based on Bret Victor's Tangle library pattern (TKAdjustableNumber).

### HTML Pattern

```html
<span class="scrubable" 
      data-var="flybyAltitude" 
      data-min="100" 
      data-max="20000" 
      data-step="100"
      data-precision="0"
      data-unit="km"
      data-sensitivity="5">6513</span>
```

### Behavior

1. **Default state**: Subtle dotted underline, accent color, `cursor: col-resize`
2. **Hover**: Background highlight appears
3. **Drag**: User clicks and drags horizontally. Value changes proportionally to horizontal displacement. `sensitivity` = pixels per step (5px = 1 step). The original Tangle used exactly this model.
4. **Release**: Value snaps to nearest step. Fires update event.
5. **Linked slider**: If a `<input type="range">` exists with the same `data-var`, they stay in sync bidirectionally.

### Events

Scrubable numbers dispatch a `CustomEvent('scrub', { detail: { var, value } })` that bubbles. Section controllers listen on their container element and trigger physics recomputation + canvas re-render.

---

## 7. Rendering Notes

### Coordinate System

Each canvas has a `ViewTransform` that maps physical coordinates (meters, centered on Earth) to screen pixels. Different sections use different scales:

| Section | View Radius | Pixels per km (approx at 740px) |
|---------|-------------|----------------------------------|
| Newton's Cannon | ~15,000 km | ~0.025 |
| Transfer Orbits | ~500,000 km | ~0.00074 |
| Free Return | ~500,000 km | ~0.00074 |
| Real Mission | ~500,000 km (switchable) | ~0.00074 |

### Color Palette

- Earth: `#4A90D9` (blue) with subtle radial gradient
- Moon: `#C0C0C0` (gray) with subtle shading
- Departure trajectory: `#2E86C1` (blue)
- Lunar flyby: `#E74C3C` (red)
- Return trajectory: `#27AE60` (green)
- SOI boundary: `#CCCCCC` dashed
- Background (canvas): transparent (inherits page background `#fffff8`)
- Velocity vectors: `#F39C12` (gold/orange)
- Annotations: `#555555`

### Canvas Sizing

- Width: spans into sidenote margin (~87.5% of body width, matching Tufte figure width)
- Height: 500px default (adjustable per section)
- Use `devicePixelRatio` for crisp rendering on retina displays
- Responsive: resize canvases on window resize, recalculate ViewTransform

---

## 8. Testing and Verification

### Physics Smoke Tests (accessible via `?test=1`)

Run these automatically and display pass/fail:

1. `circularVelocity(mu_earth, R_earth + 200e3)` → 7,784 m/s (±10)
2. `escapeVelocity(mu_earth, R_earth + 200e3)` → 11,009 m/s (±10)
3. `solveKepler(M=1.0, e=0.5)` → E ≈ 1.4987 (±0.001)
4. `solveKeplerHyperbolic(M=1.0, e=2.0)` → converges
5. Vis-viva consistency: `v` at `r=a(1-e)` should equal `sqrt(mu*(1+e)/(a*(1-e)))`
6. Patched conic: trajectory with Artemis II parameters returns to Earth (perigee < 200 km)
7. Max distance from Earth ≈ 406,800 km (±5,000)
8. Flyby altitude ≈ 6,513 km (±500) — this validates the SOI transition math
9. Energy conservation: specific orbital energy constant within each segment (±0.1%)
10. Angular momentum conservation: within each segment (±0.1%)

### Interactive Tests (manual)

- Every scrubable number: verify min, max, and mid-range produce stable visualizations (no NaN, no Infinity)
- Level switcher: cycle all 5 levels on every section. Verify no content leaks between levels.
- Time scrubber: verify smooth spacecraft motion from T+0 to T+10 days
- Responsive: check at 1440px, 1024px, 768px, 375px widths

### Browser Targets

- Chrome (latest), Safari (latest), Firefox (latest) on macOS
- Safari on iOS (most constrained — test pointer events carefully)
- Canvas rendering and pointer events must work on all

### Performance Targets

- Page load: < 1 second on fast connection
- Pre-computation of Artemis II trajectory: < 100ms
- Scrub interaction frame time: < 5ms physics + < 5ms render = 60fps
