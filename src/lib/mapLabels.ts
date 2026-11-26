import type L from 'leaflet';

/** Closer than this, the reporting points' and fixes' names show; further out they would crowd each other. */
export const NAME_LABEL_ZOOM = 10;
/** Closer than this, the navaids' labels (ident and frequency) show. */
export const NAVAID_LABEL_ZOOM = 8;

/**
 * Keeps the map's container classes in step with its zoom: route-map--far hides the reporting
 * points' and fixes' names, route-map--very-far the navaids' labels too (index.css). The markers
 * stay; their names come back when zoomed in.
 */
export function labelsByZoom(map: L.Map, container: HTMLElement): void {
  const set = () => {
    const z = map.getZoom();
    container.classList.toggle('route-map--far', z < NAME_LABEL_ZOOM);
    container.classList.toggle('route-map--very-far', z < NAVAID_LABEL_ZOOM);
  };
  map.on('zoomend', set);
  map.whenReady(set);
}
