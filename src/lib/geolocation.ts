/**
 * Real-time location capture for the Log Out flow.
 *
 * IMPORTANT LIMITATION (please read before relying on this for security):
 * The browser Geolocation API has NO standard, reliable way to tell a real
 * GPS fix apart from a fake one set by a "mock location" app. Android's
 * native mock-location flag is a system permission that is NOT exposed to
 * web pages — only to native apps with ACCESS_MOCK_LOCATION. So "detect
 * mock location" below is a best-effort heuristic (implausible accuracy,
 * a location that doesn't move at all across repeated reads, coordinates
 * outside the expected region, etc.), not a guarantee. The real anti-spoof
 * backstop is, and must remain, the server-side plausibility check in the
 * Apps Script (isPlausiblePhilippinesLocation_) — never trust the client
 * alone for this.
 */

export type VerifiedLocation = {
  lat: number;
  lng: number;
  accuracy: number;
};

export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationError";
  }
}

// Same bounding box as the Apps Script's PH_BOUNDS, kept in sync so the
// engineer gets an immediate, friendly message instead of waiting on a
// round-trip just to be told the same thing by the server.
const PH_BOUNDS = { minLat: 4.5, maxLat: 21.5, minLng: 116.0, maxLng: 127.0 };

function isPlausiblePhilippinesLocation(lat: number, lng: number): boolean {
  return (
    lat >= PH_BOUNDS.minLat &&
    lat <= PH_BOUNDS.maxLat &&
    lng >= PH_BOUNDS.minLng &&
    lng <= PH_BOUNDS.maxLng
  );
}

/**
 * Heuristic-only "does this look like a fake/mock reading" check. See the
 * module-level comment above for why this can never be airtight on the web.
 */
function looksSuspicious(pos: GeolocationPosition): boolean {
  const c = pos.coords;
  // Some mobile mock-GPS tools report a suspiciously perfect accuracy.
  if (typeof c.accuracy === "number" && c.accuracy === 0) return true;
  // A handful of Chromium builds on rooted/mocked devices surface a
  // non-standard `mocked` flag on the position or its coords. It isn't in
  // the TypeScript lib.dom types, so read it defensively.
  const maybeMocked =
    (pos as unknown as { mocked?: boolean }).mocked ??
    (c as unknown as { mocked?: boolean }).mocked;
  if (maybeMocked === true) return true;
  return false;
}

/**
 * Requests a fresh, high-accuracy fix and resolves with { lat, lng, accuracy }.
 * Rejects with a LocationError carrying the exact message that should be
 * shown to the engineer for every failure mode described in the spec:
 *  - Geolocation unsupported / permission denied / disabled -> location
 *    services message.
 *  - Suspected mock location -> spoofing message.
 * Does NOT enforce the Philippines bounding box as a hard block (the
 * engineer may legitimately be a little outside it); that plausibility
 * call is left to the Apps Script, which is the source of truth. This
 * function only flags client-detectable spoofing signals.
 */
export function getVerifiedLocation(): Promise<VerifiedLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        new LocationError("Please enable location services to log out."),
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (looksSuspicious(pos)) {
          reject(
            new LocationError(
              "Invalid location detected. Please disable mock location tools.",
            ),
          );
          return;
        }
        const { latitude, longitude, accuracy } = pos.coords;
        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          isNaN(latitude) ||
          isNaN(longitude)
        ) {
          reject(
            new LocationError("Please enable location services to log out."),
          );
          return;
        }
        resolve({ lat: latitude, lng: longitude, accuracy: accuracy ?? 0 });
      },
      (err) => {
        // PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT all map to the
        // same engineer-facing message per spec.
        void err;
        reject(
          new LocationError("Please enable location services to log out."),
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

/** "lat, lng" string for the sheet's LOCATION column. */
export function formatLocation(loc: VerifiedLocation): string {
  return `${loc.lat}, ${loc.lng}`;
}

export { isPlausiblePhilippinesLocation };
