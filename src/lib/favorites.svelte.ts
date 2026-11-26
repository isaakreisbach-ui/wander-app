// Lieblingsorte (z. B. Stamm-Parkplatz) – schnell als Startpunkt nutzen.
const KEY = 'wander.favs';
export type Fav = { id: string; name: string; lng: number; lat: number };

function load(): Fav[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export const favs = $state<{ list: Fav[] }>({ list: load() });
const save = () => localStorage.setItem(KEY, JSON.stringify(favs.list));

export function addFav(lng: number, lat: number, name: string) {
  favs.list = [...favs.list, { id: `f${Date.now().toString(36)}`, name: name.trim() || 'Lieblingsort', lng, lat }];
  save();
}
export function removeFav(id: string) {
  favs.list = favs.list.filter((f) => f.id !== id);
  save();
}
