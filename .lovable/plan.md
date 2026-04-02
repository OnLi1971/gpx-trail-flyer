

## Oprava: Bílá obrazovka při přidání fotek

### Příčina problému
V kódu je **nekonečná smyčka** (infinite loop):

1. `handleBulkPhotoUpload` nastaví `setPhotos(updatedPhotos)` a zavolá `onPhotosUpdate(updatedPhotos)`
2. `onPhotosUpdate` v `Index.tsx` zavolá `setGpxData({ ...gpxData, photos })` — vytvoří nový objekt gpxData
3. V `TrailMap.tsx` (řádek 197-201) je `useEffect` který sleduje `gpxData` a volá `setPhotos(gpxData.photos)` — nastaví fotky zpět
4. Změna `photos` spustí marker efekt, který vše opakuje → **crash / bílá obrazovka**

Navíc se při každé změně fotek znovu vykreslují trail vrstvy (řádek 114-194), protože závisí na `gpxData` — což je zbytečné a způsobuje blikání mapy.

### Řešení

**Soubor `src/components/TrailMap.tsx`:**

1. **Opravit `useEffect` na řádku 197-201** — přidat podmínku, aby se `setPhotos` volalo jen při prvním načtení gpxData (ne při každé změně fotek):
   ```typescript
   useEffect(() => {
     if (gpxData?.photos && photos.length === 0) {
       setPhotos(gpxData.photos);
     }
   }, [gpxData]);
   ```

2. **Odebrat `onPhotosUpdate` volání z `handleBulkPhotoUpload`** — nebo lépe, zavolat ho jen jednou na konci, mimo cyklus. Fotky se spravují lokálně v `TrailMap`, `onPhotosUpdate` slouží jen pro sync s Index.tsx (pro animaci). Problém je, že `onPhotosUpdate` mění `gpxData`, což znovu triggeruje bod 1.

**Čistší řešení:** Změnit efekt na řádku 197 tak, aby inicializoval fotky jen jednou (při prvním gpxData load), ne při každé změně gpxData reference. Tím se přeruší smyčka.

### Změny
- `src/components/TrailMap.tsx`: Opravit useEffect pro inicializaci fotek — přidat guard proti opakovanému nastavení + přidat `useRef` flag pro sledování, zda už byly fotky inicializovány

