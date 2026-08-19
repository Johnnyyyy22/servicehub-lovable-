/**
 * Logout location capture.
 *
 * Requires high-accuracy GPS and blocks logout when location can't be
 * trusted. Mirrors what the engineer sees, so keep the two error messages
 * in sync with the copy used in dispatch.tsx.
 */

export const LOCATION_DISABLED_MSG =
  "Please enable location services to log out.";
export const LOCATION_MOCKED_MSG =
  "Invalid location detected. Please disable mock location tools.";

export class LocationBlockedError extends Error {}

export type GeoResult = {
  lat: number;
  lng: number;
  accuracy: number;
};

/** "lat, lng" — the exact format the sheet's LOCATION column expects. */
export function formatLocation(loc: GeoResult): string {
  return `${loc.lat}, ${loc.lng}`;
}

/**
 * Requests a fresh, high-accuracy position for a logout.
 *
 * Rejects with LocationBlockedError (message already set to the right
 * user-facing copy) whenever the position can't be captured OR looks
 * spoofed, so callers can just show err.message and stop.
 *
 * Note on mock-location detection: the standard web Geolocation API does
 * not expose a reliable "this is fake" signal — that's an OS/app-level
 * concept, not something a browser can always see. Some Android WebViews
 * surface a non-standard `mocked` boolean on the position object when a
 * mock-location app is active; when present, we honor it. This is a
 * best-effort check, not a guarantee — real anti-spoofing has to happen
 * server-side (see the Apps Script bounds check).
 */
export function requestLogoutLocation(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationBlockedError(LOCATION_DISABLED_MSG));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const mocked = (position as unknown as { mocked?: boolean }).mocked;
        if (mocked === true) {
          reject(new LocationBlockedError(LOCATION_MOCKED_MSG));
          return;
        }

        const { latitude, longitude, accuracy } = position.coords;
        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          Number.isNaN(latitude) ||
          Number.isNaN(longitude)
        ) {
          reject(new LocationBlockedError(LOCATION_DISABLED_MSG));
          return;
        }

        resolve({ lat: latitude, lng: longitude, accuracy });
      },
      () => {
        // PERMISSION_DENIED, POSITION_UNAVAILABLE, or TIMEOUT — all mean
        // we don't have a trustworthy fix, so treat them the same way.
        reject(new LocationBlockedError(LOCATION_DISABLED_MSG));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}
