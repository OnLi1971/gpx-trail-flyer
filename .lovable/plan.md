

## Oprava stability uploadu fotek

### Změny

**`src/utils/exifReader.ts`:**
- Přidat size check (>50MB → skip)
- `compressImage` nikdy nerejektuje — vždy `resolve(null)` při chybě
- Null check na `canvas.getContext('2d')`
- Uvolnění paměti po canvas (`canvas.width = 0`, `img.src = ''`)
- EXIF parse s explicitními options `{ gps: true, tiff: true }`

**`src/hooks/usePhotoMarkers.ts`:**
- Batch zpracování po 3 fotkách místo všech najednou
- `Promise.all` na batch, ne na celý array

Obě změny jsou přímočarý přepis — žádná změna API, žádný dopad na zbytek aplikace.

