/**
 * Live telemetry from the Artemis II mission via community orbit API.
 *
 * Polls artemis.cdnspace.ca/api/orbit every 60 seconds.
 * Falls back gracefully when the API is unreachable.
 */

import { useEffect, useState } from 'react'

const ORBIT_API = 'https://artemis.cdnspace.ca/api/orbit'
const POLL_INTERVAL = 60_000 // 60 seconds

interface OrbitResponse {
  metMs: number           // mission elapsed time (milliseconds)
  speedKmS: number        // speed (km/s)
  speedKmH: number        // speed (km/h)
  altitudeKm: number      // altitude above Earth surface (km)
  earthDistKm: number     // distance from Earth center (km)
  moonDistKm: number      // distance from Moon center (km)
  moonRelSpeedKmH: number // speed relative to Moon (km/h)
  gForce: number          // current G-force
}

export interface LiveTelemetry {
  /** Mission elapsed time in seconds */
  metSeconds: number
  /** Speed in m/s */
  speed: number
  /** Speed in km/h (for display) */
  speedKmH: number
  /** Altitude above Earth surface in km */
  altitudeKm: number
  /** Distance from Earth center in km */
  earthDistKm: number
  /** Distance from Moon center in km */
  moonDistKm: number
  /** Speed relative to Moon in km/h */
  moonRelSpeedKmH: number
  /** Whether this is live data (true) or unavailable (false) */
  isLive: boolean
  /** Timestamp of last successful fetch */
  lastUpdate: number
}

const INITIAL: LiveTelemetry = {
  metSeconds: 0,
  speed: 0,
  speedKmH: 0,
  altitudeKm: 0,
  earthDistKm: 0,
  moonDistKm: 0,
  moonRelSpeedKmH: 0,
  isLive: false,
  lastUpdate: 0,
}

async function fetchOrbit(): Promise<LiveTelemetry | null> {
  try {
    const res = await fetch(ORBIT_API)
    if (!res.ok) return null
    const data: OrbitResponse = await res.json()
    return {
      metSeconds: data.metMs / 1000,
      speed: data.speedKmS * 1000,
      speedKmH: data.speedKmH,
      altitudeKm: data.altitudeKm,
      earthDistKm: data.earthDistKm,
      moonDistKm: data.moonDistKm,
      moonRelSpeedKmH: data.moonRelSpeedKmH,
      isLive: true,
      lastUpdate: Date.now(),
    }
  } catch {
    return null
  }
}

export function useLiveTelemetry(): LiveTelemetry {
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(INITIAL)

  useEffect(() => {
    // Fetch immediately on mount
    fetchOrbit().then(data => {
      if (data) setTelemetry(data)
    })

    // Then poll every 60s
    const interval = setInterval(async () => {
      const data = await fetchOrbit()
      if (data) setTelemetry(data)
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  return telemetry
}
