/**
 * Fetch real Artemis II trajectory from JPL Horizons.
 *
 * Queries both Orion (ID -1024) and the Moon (ID 301) over the full
 * mission window at 30-minute intervals in the J2000 Earth-centered
 * inertial frame, then transforms into the 2D co-rotating frame where
 * the Moon sits at fixed (D_MOON, 0).
 *
 * Output: src/data/orion-trajectory.json
 *
 * Run manually with:  npx tsx scripts/fetch-ephemeris.ts
 *
 * The JSON is committed to git — the build does NOT fetch at build time.
 * Re-run this script when fresh data is wanted (e.g., post-splashdown).
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'orion-trajectory.json')

const START = '2026-04-02 02:00'   // ~3h after launch; Horizons has no data before this
const STOP = '2026-04-10 23:00'    // ~1h before splashdown
const STEP = '30 m'                 // 30-minute intervals → ~430 samples

interface Sample {
  /** ISO timestamp (TDB) */
  time: string
  /** Julian date */
  jd: number
  /** Position km (J2000 Earth-centered inertial) */
  x: number
  y: number
  z: number
  /** Velocity km/s (J2000) */
  vx: number
  vy: number
  vz: number
}

async function fetchHorizons(command: string, label: string): Promise<Sample[]> {
  const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api')
  url.searchParams.set('format', 'json')
  url.searchParams.set('COMMAND', `'${command}'`)
  url.searchParams.set('OBJ_DATA', 'NO')
  url.searchParams.set('MAKE_EPHEM', 'YES')
  url.searchParams.set('EPHEM_TYPE', 'VECTORS')
  url.searchParams.set('CENTER', "'500@399'") // Earth center
  url.searchParams.set('START_TIME', `'${START}'`)
  url.searchParams.set('STOP_TIME', `'${STOP}'`)
  url.searchParams.set('STEP_SIZE', `'${STEP}'`)
  url.searchParams.set('VEC_TABLE', '2') // position + velocity
  url.searchParams.set('REF_SYSTEM', 'J2000')
  url.searchParams.set('OUT_UNITS', 'KM-S')

  console.log(`Fetching ${label} (${command}) from Horizons...`)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}: ${label}`)
  const data = await res.json() as { result: string }

  const text = data.result
  const soe = text.indexOf('$$SOE')
  const eoe = text.indexOf('$$EOE')
  if (soe < 0 || eoe < 0) {
    throw new Error(`Horizons response missing $$SOE/$$EOE markers for ${label}\n${text.slice(0, 500)}`)
  }
  const block = text.slice(soe + 5, eoe).trim()

  // Parse blocks of 3 lines: JD + date, position, velocity
  const lines = block.split('\n')
  const samples: Sample[] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const header = lines[i]!
    const posLine = lines[i + 1]!
    const velLine = lines[i + 2]!

    // JD is the first number on the header line
    const jdMatch = header.match(/^\s*([\d.]+)\s*=\s*A\.D\.\s*(\S+\s\S+\s\S+)/)
    if (!jdMatch) continue
    const jd = parseFloat(jdMatch[1]!)
    const timeStr = jdMatch[2]!

    const posMatch = posLine.match(/X\s*=\s*([-\d.E+]+)\s+Y\s*=\s*([-\d.E+]+)\s+Z\s*=\s*([-\d.E+]+)/)
    const velMatch = velLine.match(/VX\s*=\s*([-\d.E+]+)\s+VY\s*=\s*([-\d.E+]+)\s+VZ\s*=\s*([-\d.E+]+)/)
    if (!posMatch || !velMatch) continue

    samples.push({
      time: timeStr,
      jd,
      x: parseFloat(posMatch[1]!),
      y: parseFloat(posMatch[2]!),
      z: parseFloat(posMatch[3]!),
      vx: parseFloat(velMatch[1]!),
      vy: parseFloat(velMatch[2]!),
      vz: parseFloat(velMatch[3]!),
    })
  }
  console.log(`  parsed ${samples.length} samples`)
  return samples
}

function assertAligned(a: Sample[], b: Sample[], label: string): void {
  if (a.length !== b.length) {
    throw new Error(`${label}: length mismatch (${a.length} vs ${b.length})`)
  }
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]!.jd - b[i]!.jd) > 1e-6) {
      throw new Error(`${label}: jd mismatch at index ${i}: ${a[i]!.jd} vs ${b[i]!.jd}`)
    }
  }
}

/**
 * Transform an Orion sample from J2000 inertial into the 2D co-rotating
 * frame where the Moon sits at (+moonDist, 0).
 *
 * We rotate about the z-axis by the Moon's angle in the xy-plane, then
 * drop the z component. Preserves distances-from-Earth; the Moon's
 * actual distance from Earth varies slightly (elliptical lunar orbit),
 * so the Moon's true x-coordinate varies from ~D_MOON by a few percent.
 */
function toCoRotating2D(orion: Sample, moon: Sample) {
  const moonAngle = Math.atan2(moon.y, moon.x)
  const cosA = Math.cos(moonAngle)
  const sinA = Math.sin(moonAngle)

  // Rotate Orion by -moonAngle (so Moon ends up on +x axis)
  const x = orion.x * cosA + orion.y * sinA
  const y = -orion.x * sinA + orion.y * cosA

  // Velocity in the rotating frame: v_rot = R(-θ) * v_inertial - ω × r
  // where ω is the Moon's angular velocity and r is the rotated position.
  // For the display we only need speed (invariant under rotation), so
  // store the inertial speed magnitude.
  const speed = Math.sqrt(orion.vx * orion.vx + orion.vy * orion.vy + orion.vz * orion.vz)

  return { x, y, speed }
}

async function main() {
  const [orion, moon] = await Promise.all([
    fetchHorizons('-1024', 'Artemis II / Orion'),
    fetchHorizons('301', 'Moon'),
  ])
  assertAligned(orion, moon, 'Orion/Moon')

  // Reference time: Horizons first sample in milliseconds UTC.
  // We convert JD to Unix time (JD 2440587.5 = 1970-01-01 00:00:00 UTC)
  // and use the delta from launch for mission elapsed time.
  const LAUNCH_UTC_MS = Date.UTC(2026, 3, 1, 22, 35, 0) // April 1 22:35 UTC

  const JD_UNIX_EPOCH = 2440587.5
  const jdToUnixMs = (jd: number) => (jd - JD_UNIX_EPOCH) * 86400 * 1000

  const points = orion.map((o, i) => {
    const m = moon[i]!
    const { x, y, speed } = toCoRotating2D(o, m)

    const unixMs = jdToUnixMs(o.jd)
    const metSeconds = (unixMs - LAUNCH_UTC_MS) / 1000

    const distEarth = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z) * 1000 // km → m
    const distMoon =
      Math.sqrt((o.x - m.x) ** 2 + (o.y - m.y) ** 2 + (o.z - m.z) ** 2) * 1000

    // Moon's actual distance from Earth (so the renderer can place it
    // correctly in the co-rotating frame — varies ~4% across the mission).
    const moonX = Math.sqrt(m.x * m.x + m.y * m.y + m.z * m.z) * 1000

    return {
      t: metSeconds,
      x: x * 1000, // km → m
      y: y * 1000,
      speed: speed * 1000, // km/s → m/s
      distEarth,
      distMoon,
      moonX,
    }
  })

  // Validate: Moon should be roughly at D_MOON ≈ 384,400 km on +x axis
  // in the co-rotating frame. Check first and middle samples.
  const moonDistances = moon.map((m) =>
    Math.sqrt(m.x * m.x + m.y * m.y + m.z * m.z)
  )
  const avgMoonDist = moonDistances.reduce((s, d) => s + d, 0) / moonDistances.length
  console.log(`\nMoon avg distance: ${avgMoonDist.toFixed(0)} km (ref D_MOON = 384,400)`)

  // Report trajectory stats
  const maxEarthDist = Math.max(...points.map((p) => p.distEarth))
  const minMoonDist = Math.min(...points.map((p) => p.distMoon))
  console.log(`Max Earth distance: ${(maxEarthDist / 1000).toFixed(0)} km`)
  console.log(`Min Moon distance:  ${(minMoonDist / 1000).toFixed(0)} km`)
  console.log(`Time range: T+${(points[0]!.t / 3600).toFixed(1)}h to T+${(points.at(-1)!.t / 86400).toFixed(1)}d`)

  const output = {
    source: 'JPL Horizons API',
    fetchedAt: new Date().toISOString(),
    launchUtc: new Date(LAUNCH_UTC_MS).toISOString(),
    start: START,
    stop: STOP,
    step: STEP,
    coordinateFrame: 'co-rotating 2D (Moon on +x axis)',
    moonAvgDistKm: avgMoonDist,
    points,
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
  console.log(`\nWrote ${points.length} points to ${OUT_PATH}`)
}

main().catch((err) => {
  console.error('Fetch failed:', err)
  process.exit(1)
})
