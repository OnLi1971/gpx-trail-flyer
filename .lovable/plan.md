

## Cleanup: Odstranění nadbytečností

### Nalezené problémy

**1. `PhotoUploadModal.tsx` — mrtvý kód**
Soubor `src/components/PhotoUploadModal.tsx` (143 řádků) se nikde neimportuje ani nepoužívá. Byl nahrazen bulk EXIF upload tlačítkem přímo v TrailMap. Smazat celý soubor.

**2. `MaplibreFlyToDemo.tsx` + route — testovací kód v produkci**
Soubor `src/components/MaplibreFlyToDemo.tsx` (111 řádků) je testovací demo, které nemá v produkční aplikaci co dělat. Navíc v `Index.tsx` (řádky 270-283) je karta "Test flyTo animace" s tlačítkem na otevření této stránky. Smazat soubor, odebrat route z `App.tsx` a odebrat kartu z `Index.tsx`.

**3. `PhotoAnimationControls.tsx` — komponenta se nepoužívá, jen `defaultSettings` a typ**
Celá komponenta `PhotoAnimationControls` (slider UI, 150 řádků) se nikde nerenderuje. Z tohoto souboru se importuje pouze `AnimationSettings` typ a `defaultSettings` konstanta. Přesunout typ a konstantu do `src/types/gpx.ts` (nebo nového `src/types/animation.ts`) a smazat komponentu.

**4. `GPXData.photos?` — mrtvé pole v typu**
V `src/types/gpx.ts` je `photos?: PhotoPoint[]` na `GPXData` rozhraní. Fotky se nyní spravují jako samostatný state v `Index.tsx` a nikdy se nenastavují na `gpxData`. Odebrat toto pole.

**5. Duplicitní auto-photo logika v Index.tsx**
V `Index.tsx` je kompletní systém pro auto-zobrazení fotek (řádky 78-141: `photoPositions`, `shownPhotosInSession`, `autoPhotoView`, `isAutoPhotoOpen`, `PhotoViewModal`). Stejnou funkcionalitu ale řeší i `TrailMap.tsx` (řádky 401-462: `activePhotoId`, `handleArrivedPhoto`, vlastní `PhotoViewModal`). Jsou to dva nezávislé systémy, které dělají totéž — jeden v Indexu (pro slider animaci), druhý v TrailMap (pro slider i 3D průlet). Ponechat jen TrailMap verzi, která je robustnější (má flyTo zoom), a odebrat duplicitní logiku z Indexu.

**6. `animationDuration` jako useState — zbytečný state**
`const [animationDuration] = useState(10000)` — setter se nikdy nepoužívá. Nahradit konstantou `const ANIMATION_DURATION = 10000`.

**7. `animationSettings` jako useState — zbytečný state**
`const [animationSettings] = useState<AnimationSettings>(defaultSettings)` — setter se nikdy nepoužívá. Nahradit konstantou `const animationSettings = defaultSettings`.

### Změny po souborech

**Smazat soubory:**
- `src/components/PhotoUploadModal.tsx`
- `src/components/MaplibreFlyToDemo.tsx`

**`src/types/gpx.ts`:**
- Odebrat `photos?: PhotoPoint[]` z `GPXData`
- Přidat `AnimationSettings` interface a `defaultSettings` konstantu (přesun z PhotoAnimationControls)

**`src/components/PhotoAnimationControls.tsx`:**
- Smazat celý soubor (typ a konstanta přesunuty do types)

**`src/App.tsx`:**
- Odebrat import `MaplibreFlyToDemo`
- Odebrat route `/test-flyto`

**`src/pages/Index.tsx`:**
- Odebrat import `PhotoAnimationControls` → importovat z nového místa
- Odebrat: `photoPositions`, `shownPhotosInSession`, `autoPhotoView`, `isAutoPhotoOpen` state
- Odebrat: oba useEffect pro photo positions a auto-photo (řádky 80-141)
- Odebrat: `<PhotoViewModal>` na konci (řádky 287-295) — TrailMap má vlastní
- Odebrat: "Test flyTo" kartu (řádky 270-283)
- Změnit `useState(10000)` → `const ANIMATION_DURATION = 10000`
- Změnit `useState(defaultSettings)` → `const animationSettings = defaultSettings`
- Odebrat import `Button` (nepoužívá se po odebrání test karty)

**`src/components/TrailMap.tsx`:**
- Aktualizovat import `AnimationSettings` z nového místa

