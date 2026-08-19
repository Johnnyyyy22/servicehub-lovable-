/**
 * Real-time location capture for logout, with basic anti-spoofing checks.
 *
 * The browser can't tell us definitively that a fix is genuine, so we use
 * the signals it does expose: high-accuracy mode, a plausible accuracy
 * radius, a fresh (non-cached) timestamp, and coordinates inside the
 * Philippines. Anything outside those bounds is treated as suspicious.
 */

export type Coords = { lat: number; lng: number; accuracy: number };

export class LocationError extends Error {}

/** Rough bounding box for the Philippines. */
const PH_BOUNDS = { minLat: 4.2, maxLat: 21.5, minLng: 116.0, maxLng: 127.0 };

const MSG = {
  disabled: "Please enable location services to log out.",
  spoofed: "Invalid location detected. Please disable mock location tools.",
  failed: "Couldn't get your location. Please try again outdoors.",
};

function looksMocked(pos: GeolocationPosition): boolean {
  const c = pos.coords as GeolocationCoordinates & { mocked?: boolean };
  if (c.mocked === true) return true;
  // Fresh fixes only — a timestamp far in the past means a cached/injected fix.
  if (Math.abs(Date.now() - pos.timestamp) > 60_000) return true;
  // Perfectly round zero-accuracy readings are typical of fake GPS apps.
  if (!Number.isFinite(c.accuracy) || c.accuracy <= 0) return true;
  if (c.latitude === 0 && c.longitude === 0) return true;
  if (
    c.latitude < PH_BOUNDS.minLat ||
    c.latitude > PH_BOUNDS.maxLat ||
    c.longitude < PH_BOUNDS.minLng ||
    c.longitude > PH_BOUNDS.maxLng
  )
    return true;
  return false;
}

/** Resolves with a verified high-accuracy fix, or throws a LocationError. */
export function getVerifiedLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationError(MSG.disabled));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (looksMocked(pos)) {
          reject(new LocationError(MSG.spoofed));
          return;
        }
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        reject(
          new LocationError(
            err.code === err.PERMISSION_DENIED ? MSG.disabled : MSG.failed,
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** "14.567890, 121.045678" — the value written to the sheet's LOCATION column. */
export function formatCoords(c: Coords): string {
  return `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
}
