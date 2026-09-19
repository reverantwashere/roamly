import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Destination } from '../lib/data';
import './DestinationMap.css';

interface DestinationMapProps {
  places: Destination[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

/** A replaceable base-map view. Coordinates come from the destination catalogue. */
export default function DestinationMap({ places, selectedId, onSelect, className = '' }: DestinationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const select = useRef(onSelect);
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  select.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    let active = true;
    let failed = false;
    const instance = L.map(container.current, {
      center: [23, 36], zoom: 2, minZoom: 2, maxZoom: 18,
      scrollWheelZoom: false, attributionControl: true,
    });
    map.current = instance;
    instance.attributionControl.setPrefix(false);
    // Tile attribution remains visible even when the tile service is unavailable.
    const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      maxZoom: 19,
    });
    layer.on('loading', () => { failed = false; if (active) setTileStatus('loading'); });
    layer.on('tileerror', () => { failed = true; if (active) setTileStatus('unavailable'); });
    layer.on('load', () => { if (active) setTileStatus(failed ? 'unavailable' : 'ready'); });
    layer.addTo(instance);
    tiles.current = layer;
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    resize.observe(container.current);
    return () => {
      active = false;
      resize.disconnect();
      markers.current.clear();
      tiles.current = null;
      map.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    markers.current.forEach(marker => marker.remove());
    markers.current.clear();
    const coordinates: L.LatLngTuple[] = [];
    places.forEach(place => {
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng) || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return;
      const coordinate: L.LatLngTuple = [place.lat, place.lng];
      coordinates.push(coordinate);
      const popup = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = place.name;
      const country = document.createElement('div');
      country.textContent = place.country;
      popup.append(name, country);
      const marker = L.circleMarker(coordinate, {
        radius: 9, color: '#ffffff', weight: 3, fillColor: '#2d7058', fillOpacity: 1,
      }).addTo(instance).bindPopup(popup);
      marker.on('click', () => select.current?.(place.id));
      const element = marker.getElement();
      if (element) {
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Explore ${place.name}, ${place.country}`);
        element.addEventListener('keydown', (event: Event) => {
          const key = (event as KeyboardEvent).key;
          if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            marker.openPopup();
            select.current?.(place.id);
          }
        });
      }
      markers.current.set(place.id, marker);
    });
    if (coordinates.length === 1) instance.setView(coordinates[0], 9, { animate: false });
    else if (coordinates.length > 1) instance.fitBounds(L.latLngBounds(coordinates), { padding: [42, 42], maxZoom: 9, animate: false });
    else instance.setView([23, 36], 2, { animate: false });
  }, [places]);

  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const selected = id === selectedId;
      marker.setRadius(selected ? 12 : 9);
      marker.setStyle({ fillColor: selected ? '#c78e46' : '#2d7058' });
      marker.getElement()?.setAttribute('aria-pressed', String(selected));
      if (selected) marker.bringToFront();
    });
  }, [selectedId, places]);

  return (
    <div className={`destination-map ${className}`}>
      <div ref={container} className="destination-map-canvas" role="region" aria-label="Destination map. Use the zoom controls and select a destination marker to explore." />
      {tileStatus === 'unavailable' && <div className="destination-map-notice" role="status">
        Some map tiles could not load. Destination markers use saved coordinates.{' '}
        <button type="button" onClick={() => tiles.current?.redraw()}>Retry map</button>
      </div>}
      {!places.length && <div className="destination-map-empty" role="status">No destinations match your filters.</div>}
    </div>
  );
}
