// Info-Fenster für Wasserstellen und Hütten (von Karte und Liste genutzt).
import { Popup } from 'maplibre-gl';
import { mapState } from './map.svelte';
import { openingInfo, POI_STYLE, type Poi } from './pois.svelte';
import { wxShared } from './wxshared.svelte';

export const POI_LAYERS = ['pois-main', 'pois-food'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const link = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

function poiHtml(p: Poi): string {
  const st = POI_STYLE[p.kind];
  const drink = p.kind === 'water'
    ? p.drink === 'yes' ? '<div class="pp-ok">✓ Trinkwasser</div>'
      : p.drink === 'no' ? '<div class="pp-bad">✗ Kein Trinkwasser</div>'
      : '<div class="pp-warn">? Trinkbarkeit unbekannt – im Zweifel filtern/abkochen</div>'
    : '';
  const links = [
    p.menu ? `<a href="${esc(link(p.menu))}" target="_blank" rel="noopener">Speisekarte</a>` : '',
    p.website ? `<a href="${esc(link(p.website))}" target="_blank" rel="noopener">Webseite</a>` : '',
    p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}">Anrufen</a>` : '',
  ].filter(Boolean).join(' · ');
  const eat = p.kind === 'food' || p.kind === 'hut';
  return `<div class="pp">
    <div class="pp-title">${st.emoji} ${esc(p.name)}</div>
    <div class="pp-sub">${esc(p.label)}${p.ele ? ` · ${p.ele} m` : ''}${p.seasonal ? ' · saisonal' : ''}</div>
    ${drink}
    ${p.openingHours ? `<div class="pp-oh" data-oh>Öffnungszeiten: ${esc(p.openingHours)}</div>` : eat ? '<div class="pp-sub">Keine Öffnungszeiten eingetragen</div>' : ''}
    ${links ? `<div class="pp-links">${links}</div>` : ''}
    ${eat ? '<div class="pp-note">Speisekarte &amp; Preise gibt es nur über die Webseite der Hütte, falls vorhanden.</div>' : ''}
  </div>`;
}

let popup: Popup | null = null;

export async function showPoiPopup(p: Poi, fly = false) {
  const map = mapState.map;
  if (!map) return;
  if (fly) map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
  popup?.remove();
  popup = new Popup({ closeButton: true, maxWidth: '280px', offset: 14 }).setLngLat([p.lng, p.lat]).setHTML(poiHtml(p)).addTo(map);
  if (!p.openingHours) return;
  const day = wxShared.current?.day.date;
  const today = new Date().toISOString().slice(0, 10);
  const now = await openingInfo(p);
  const onDay = day && day !== today ? await openingInfo(p, new Date(day + 'T12:00')) : null;
  const el = popup.getElement()?.querySelector('[data-oh]');
  if (el && now) {
    el.innerHTML =
      `<span class="${now.open ? 'pp-ok' : now.open === false ? 'pp-bad' : ''}">${esc(now.text)}</span>` +
      (onDay ? `<br><span class="${onDay.open ? 'pp-ok' : 'pp-bad'}">${esc(onDay.text)} (Tourtag, 12 Uhr)</span>` : '') +
      `<div class="pp-raw">${esc(p.openingHours)}</div>`;
  }
}
