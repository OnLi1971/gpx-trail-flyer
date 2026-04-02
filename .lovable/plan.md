

## Čistá architektura pro správu fotek — jeden zdroj pravdy

### Problém
Fotky existují na dvou místech: `photos` state v TrailMap + `gpxData.photos` v Index. Synchronizace přes `onPhotosUpdate` → `setGpxData` → `useEffect` → `setPhotos` vytváří cyklickou závislost. Aktuální fix (`photosInitializedRef`) je křehký hack — rozbije se při nahrání nového GPX souboru.

### Řešení

Fotky se stanou samostatným stavem v `Index.tsx`. TrailMap je dostane jako prop a nebude mít vlastní `photos` state.

```text
Index.tsx (vlastník photos state)
  ├── photos: PhotoPoint[]
  ├── setPhotos / onAddPhotos callback
  └── TrailMap
        ├── photos (read-only prop)
        ├── onAddPhotos (callback pro přidání nových)
        └── žádný vlastní photos state
```

### Změny

**`src/pages/Index.tsx`:**
- Přidat `const [photos, setPhotos] = useState<PhotoPoint[]>([])`
- Resetovat `setPhotos([])` v `handleFileUpload` při nahrání nového GPX
- `photoPositions` výpočet závisí na `photos` state (ne `gpxData.photos`)
- Předat TrailMap props: `photos={photos}` a `onAddPhotos={(newPhotos) => setPhotos(prev => [...prev, ...newPhotos])}`
- Odebrat `onPhotosUpdate` callback (ten co měnil gpxData)

**`src/components/TrailMap.tsx`:**
- Přidat do props: `photos: PhotoPoint[]` a `onAddPhotos: (photos: PhotoPoint[]) => void`
- Odebrat z props: `onPhotosUpdate`
- Odebrat: `const [photos, setPhotos]` (lokální state)
- Odebrat: `photosInitializedRef` + jeho useEffect (řádky 197-203)
- V `handleBulkPhotoUpload`: místo `setPhotos(updated)` + `onPhotosUpdate(updated)` zavolat jen `onAddPhotos(newPhotos)` — parent přidá fotky do svého state
- Všechny existující efekty a renderování fotek (`photos.forEach`, `photos.length`) budou číst z prop místo lokálního state — žádná změna v logice, jen zdroj dat

### Výsledek
- Žádná cyklická závislost, žádný `useRef` hack
- Změna fotek neovlivní `gpxData` → nemá vliv na trail/POI vrstvy
- Při nahrání nového GPX se fotky korektně resetují
- Čistý základ pro další práci na projektu

