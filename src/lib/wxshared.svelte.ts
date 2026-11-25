// Das Wetter am gewählten Tag – von der Wetter-Box geschrieben, von der Ausrüstungs-Box gelesen.
import type { GearWeather } from './gear';

export const wxShared = $state<{ current: GearWeather | null }>({ current: null });
