/** Gravitational parameter for Earth (m^3/s^2) */
export const MU_EARTH = 3.986004418e14

/** Gravitational parameter for Moon (m^3/s^2) */
export const MU_MOON = 4.9048695e12

/** Mean radius of Earth (m) */
export const R_EARTH = 6.371e6

/** Mean radius of Moon (m) */
export const R_MOON = 1.7374e6

/** Mean Earth-Moon distance (m) */
export const D_MOON = 3.844e8

/** Moon's sphere of influence radius (m) */
export const SOI_MOON = 6.6183e7

/** Moon's orbital period (s) */
export const T_MOON = 27.322 * 86400

/** Moon's mean orbital velocity (m/s) */
export const V_MOON = (2 * Math.PI * D_MOON) / T_MOON

/** Standard LEO altitude for examples (m) */
export const LEO_ALTITUDE = 200e3

/** LEO orbital radius (m) */
export const R_LEO = R_EARTH + LEO_ALTITUDE

// ── Artemis II Mission Data ──

/** Launch epoch: April 1, 2026, 22:35 UTC (6:35 PM EDT) */
export const LAUNCH_EPOCH = Date.UTC(2026, 3, 1, 22, 35, 0)

/** TLI epoch: April 2, 2026, 23:49 UTC (7:49 PM EDT) — T+1d1h14m */
export const TLI_EPOCH = Date.UTC(2026, 3, 2, 23, 49, 0)

/** TLI delta-v from the raised orbit (m/s) */
export const TLI_DELTA_V = 388

/** TLI burn duration (s) */
export const TLI_BURN_DURATION = 349

/** Flyby altitude above lunar surface (m) */
export const FLYBY_ALTITUDE = 6513e3

/** Flyby periapsis from Moon center (m) */
export const FLYBY_PERIAPSIS = FLYBY_ALTITUDE + R_MOON

/** Maximum distance from Earth (m) — breaks Apollo 13 record */
export const MAX_DISTANCE = 406773e3

/** Total mission duration (days) */
export const MISSION_DURATION_DAYS = 10

/** Splashdown epoch: April 10, 2026 */
export const SPLASHDOWN_EPOCH = Date.UTC(2026, 3, 11, 0, 6, 0)

/** High Earth Orbit after ICPS raises — apogee (m) */
export const HEO_APOGEE = 74030e3

/** High Earth Orbit — perigee (m) */
export const HEO_PERIGEE = R_EARTH + 2414e3

/** Reentry speed (m/s) — ~40,000 km/h */
export const REENTRY_SPEED = 11111
