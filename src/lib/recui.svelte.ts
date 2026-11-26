// Anzeige-Einstellungen rund um die Aufzeichnung (gehören nicht zu den gespeicherten Daten).
// mode: während der Aufzeichnung große Zahlen ('zahlen') oder Karte ('karte') zeigen
export const recUi = $state<{ follow: boolean; mode: 'zahlen' | 'karte' }>({ follow: true, mode: 'karte' });
