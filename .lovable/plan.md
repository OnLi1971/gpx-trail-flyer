## Co se změní

Tvůj návrh dává velký smysl — **kilometry trasy** jsou intuitivnější než sekundy průletu (sekundy se mění s rychlostí animace, km jsou pevné). A modré tečky ve výškovém profilu jsou ideální místo, kde s fotkami pohybovat **přímo myší**.

### 1. Nový model: `triggerKm` místo `triggerSec`

V `src/types/gpx.ts` přejmenovat:
- `triggerSec?: number` → `triggerKm?: number` (vzdálenost od startu trasy v km)

Trigger se počítá z **ujeté vzdálenosti**, ne z času. Funguje stejně při jakékoliv rychlosti průletu i při ručním tažení slideru.

### 2. Logika v `usePhotoMarkers.ts`

- Místo `(elapsedSec >= photo.triggerSec)` porovnávat `currentKm >= photo.triggerKm`.
- `currentKm` = pozice na trase odvozená z `flyingIndex` nebo `currentPosition` (procentuálně × `track.totalDistance`).
- Značky fotek na mapě umístit na bod trasy odpovídající `triggerKm` (najít nejbližší bod podle kumulované vzdálenosti).
- Odstranit závislost na `flyDurationSec` a `flyStartTimestamp` u triggeru (zůstanou jen pro autozavírání modalu).

### 3. Drag & drop ve výškovém profilu (`ElevationChart.tsx`)

Modré tečky (`ReferenceDot` pro fotky) udělat **interaktivní**:
- Po `mousedown` na tečce začne drag, sleduje se pohyb myši nad chart oblastí.
- Z X souřadnice myši dopočítat km (přes scale Recharts) a volat nový callback `onPhotoKmChange(id, km)`.
- Hover nad tečkou: tooltip s názvem fotky + miniaturou.
- Klik (bez tažení) otevře modal s fotkou.
- Vizuál: tečky o něco větší (r=6), `cursor: grab` / `grabbing`.

### 4. Zjednodušený `PhotoTimeEditor` → `PhotoListEditor`

Místo slideru sekund:
- U každé fotky pole **„km"** (number input, 0 – `totalDistanceKm`, krok 0.1).
- Tlačítko „Rozprostřít rovnoměrně" (přepočítá všechny fotky).
- Tlačítko smazat.
- Slider odstranit — pohyb se dělá přímo v grafu, tady je jen přesné doladění čísla.

Toto vyřeší tvůj první problém („nevidím, jak nastavit čas") — bude to jednoduchý seznam s číslem v km.

### 5. Auto-rozprostření při uploadu

V `Index.tsx` při přidání fotek bez `triggerKm`:
```
photo.triggerKm = ((i + 1) / (N + 1)) * totalDistanceKm
```

### 6. Kompatibilita

- `flyDurationSec` zůstává jen pro autozavírání modalu (sekundy zobrazení).
- Stará data s `triggerSec` se při načtení převedou: `triggerKm = (triggerSec / flyDurationSec) * totalKm` (jednorázová migrace v Indexu).

## Soubory k úpravě

- `src/types/gpx.ts` — `triggerSec` → `triggerKm`
- `src/hooks/usePhotoMarkers.ts` — trigger podle km, pozice značek podle km
- `src/components/ElevationChart.tsx` — draggable tečky + hover tooltip + onClick
- `src/components/PhotoTimeEditor.tsx` → přejmenovat/přepracovat na seznam s km
- `src/hooks/useElevationData.ts` — `chartDistance` použít přímo `triggerKm` (ne hledat nejbližší GPS bod)
- `src/pages/Index.tsx` — propsy, handler `handleChangePhotoKm`, propojení do TrailMap kvůli draggu
- `src/components/TrailMap.tsx` — předat `onPhotoKmChange` do ElevationChart
- `src/pages/SharedTrail.tsx` — stejné drobné úpravy

## Výsledek

- V grafu výšky chytíš modrou tečku a **přesuneš ji**, kam chceš → fotka se tam spustí.
- Pod mapou seznam fotek s polem „km" pro přesné nastavení.
- Trigger je nezávislý na rychlosti animace — stejná pozice na trase = stejná fotka.