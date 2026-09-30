export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker extends LatLng {
  kind: 'home' | 'tech';
  /** Tooltip (e.g. technician name on the operations map). */
  title?: string;
}

export interface FixoraMapProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** Draw a line between the first two markers and fit both in view. */
  route?: boolean;
  /** Fit every marker in view (live fleet map). */
  fit?: boolean;
  /** Fires after the user pans (for the fixed-centre-pin picker). */
  onMoveEnd?(center: LatLng): void;
  className?: string;
  label: string;
}

/** Only re-centre when the requested centre really moved (avoids feedback loops with onMoveEnd). */
export const moved = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) > 1e-5 || Math.abs(a.lng - b.lng) > 1e-5;
