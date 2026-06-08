## Postupné odhalování POI během závěrečného orbitu

### Cíl
V závěrečné orbit fázi se POI neukážou všechny najednou, ale postupně — jak kamera kolem nich prolétá. Výsledek: čistší, dynamičtější, filmovější.

### Jak to bude fungovat
- Orbit trvá ~6 s (jedna otáčka 360°).
- Každý POI dostane „čas odhalení" podle své úhlové pozice vůči středu trasy.
- Když aktuální bearing kamery projde úhlem POI (mínus malý offset, aby se objevil těsně před tím, než ho kamera „mine"), POI se fade-in (opacity 0 → 1, scale 0.8 → 1, ~300 ms).
- Jakmile se POI objeví, zůstane viditelný do konce orbitu.
- Druhá otáčka už je má všechny zobrazené.

### Technické detaily

**`src/hooks/useFlythrough.ts`**
- V `stopFlythrough('finished')` spočítat střed trasy (`bounds.getCenter()`).
- Exponovat nový state `orbitBearing: number | null` (aktuální bearing v orbitu) — aktualizovat v `tick()` smyčce přes `setOrbitBearing`.
- Při startu nového průletu / `dismissSummary` → `setOrbitBearing(null)`.

**`src/components/TrailMap.tsx`**
- V `useEffect` pro orbit (`flythrough.showSummary`) místo „ukaž všechny" implementovat logiku:
  1. Spočítat pro každý POI marker jeho úhel vůči středu trasy (`atan2`).
  2. Při změně `orbitBearing` porovnat: pokud `angularDistance(bearing, poiAngle) < threshold` (např. 30°) NEBO POI už byl jednou odhalen, nastavit `opacity:1`, jinak `opacity:0`.
  3. Použít CSS transition `opacity 300ms, transform 300ms` na element markeru.
  4. Sadu odhalených POI držet v `useRef<Set<string>>`, resetovat při startu nového orbitu.

### Mimo rozsah
- Žádné změny v POI fetch logice, kategoriích, ani v hlavním průletu.
- Karta shrnutí už je odstraněná — neměníme.
- Nahrávání videa: orbit i fade běží přes DOM/CSS, captureStream je zachytí.
