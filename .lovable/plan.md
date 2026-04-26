## Přidat viditelný debug panel pro POI

### Cíl
Na mobilu nelze otevřít konzoli, takže informace o načítání POI (vrcholy + obce) zobrazíme přímo v UI.

### Změny v `src/components/TrailMap.tsx`

**1. Stav pro debug info**
Přidat `useState` pro:
- `poiStatus`: `'idle' | 'loading' | 'success' | 'error'`
- `poiCounts`: `{ peaks: number; places: number; raw: number; filtered: number }`
- `poiError`: `string | null`

**2. Aktualizace v `loadPOIs`**
- Před `fetch` → `setPoiStatus('loading')`
- Po úspěchu → uložit počty (raw z API, filtered po 2km filtru, peaks, places) a `setPoiStatus('success')`
- Při chybě → `setPoiError(err.message)` a `setPoiStatus('error')`

**3. Debug panel v UI**
Malý badge v rohu mapy (např. `top-2 right-12`, vedle navigation control) zobrazující:
- 🔄 Načítám POI… (loading)
- ⛰️ X vrcholů, 🏘️ Y obcí (success) — kliknutím zobrazí detail (raw vs filtered)
- ⚠️ Chyba: {message} (error)
- Skrýt, když není GPX nahráno

Styling: malý, polotransparentní, neruší. Použít `Badge` nebo jednoduchý div s tailwind.

### Co se tím dozvíme
- Jestli se Overpass dotaz vůbec spustil
- Kolik POI vrátilo API
- Kolik prošlo 2km filtrem
- Pokud filtered = 0 → problém v datech/filtru
- Pokud filtered > 0 ale nevidíš tyčky → problém v renderingu (pravděpodobně 3D occlusion nebo z-index)

### Bez změny
- Logika `overpassApi.ts`
- Vykreslování markerů
- Console.log zůstávají (pro debugging na desktopu)
