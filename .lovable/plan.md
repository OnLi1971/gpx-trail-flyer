## Přidání fotky klikem na mapu

Vrátím funkcionalitu, kdy uživatel klikne na libovolné místo na mapě a otevře se dialog pro výběr fotky + popisu. Fotka se umístí na zvolené souřadnice (nezávisle na EXIF GPS).

### UX flow

1. Vedle tlačítka **„Přidat fotky"** přidám tlačítko **„Přidat klikem"** (toggle).
2. Když je toggle aktivní:
   - Kurzor nad mapou se změní na `crosshair`.
   - Nahoře nad mapou se zobrazí pruh: *„Klikni na mapu pro umístění fotky"* + tlačítko Zrušit.
3. Po kliknutí na mapu se zachytí `lng/lat` a otevře se dialog `ManualPhotoDialog`:
   - File input (jediná fotka)
   - Textarea pro popis (volitelný)
   - Tlačítka „Přidat" / „Zrušit"
4. Po potvrzení se fotka zkomprimuje (stejný `compressImage` jako u bulk uploadu) a přidá do `photos` přes `onAddPhotos`.
5. Toggle se vypne, kurzor se vrátí na default.

### Změny

**`src/components/ManualPhotoDialog.tsx`** (nový, ~80 řádků)
- Props: `isOpen`, `onClose`, `coords: {lat, lon} | null`, `onConfirm: (photo: PhotoPoint) => void`
- File input + textarea + preview thumbnail
- Komprese fotky před vrácením (volá `compressImage` z `exifReader.ts`)

**`src/utils/exifReader.ts`**
- Exportovat `compressImage` (teď je jen lokální)

**`src/components/TrailMap.tsx`**
- Nový state `addPhotoMode: boolean` a `pendingCoords: {lat,lon} | null`
- Nový useEffect: když je `addPhotoMode` aktivní, navěsit `map.on('click', ...)` který zachytí souřadnice a otevře dialog. Cleanup odebere listener a vrátí kurzor.
- Změna kurzoru přes `map.getCanvas().style.cursor = 'crosshair'`.
- Tlačítko „Přidat klikem" vedle „Přidat fotky".
- Render `<ManualPhotoDialog>` na konci.
- Banner nad mapou když je mód aktivní.

### Žádný dopad na

- Bulk EXIF upload (`handleBulkPhotoUpload`) — funguje dál stejně
- Auto-open fotek při animaci — používá stejný `photos` array
- POI markery, flythrough, elevation chart

### Pořadí implementace

1. Export `compressImage` z `exifReader.ts`
2. Vytvořit `ManualPhotoDialog.tsx`
3. Doplnit logiku do `TrailMap.tsx` (state, click handler, tlačítko, banner, dialog render)
