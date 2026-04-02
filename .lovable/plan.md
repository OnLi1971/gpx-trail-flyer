

## Oprava: Fotky se nezobrazují na mapě

### Problém
V `exifReader.ts` je chyba v konfiguraci `exifr.parse()`. Volání `{ gps: true, pick: ['DateTimeOriginal', 'CreateDate'] }` — parametr `pick` omezuje parsování jen na vybrané tagy a může přebít `gps: true`, takže `latitude`/`longitude` nejsou v výsledku.

Navíc chybí jakékoliv logování do konzole, když fotky nemají GPS — uživatel nevidí, proč se nic nestalo.

### Řešení

**Soubor `src/utils/exifReader.ts`:**
1. Opravit `exifr.parse()` volání — místo `pick` použít správnou konfiguraci, která zachová GPS parsing:
   - `await exifr.parse(file, { gps: true, tiff: true, exif: true })` — bez `pick` filtru
   - Pak zvlášť přistupovat k `DateTimeOriginal` / `CreateDate`
2. Přidat `console.log` pro debugging — logovat co exifr vrátí

**Soubor `src/components/TrailMap.tsx`:**
3. V `handleBulkPhotoUpload` přidat loading indikátor (toast "Zpracovávám fotky...") aby uživatel věděl, že se něco děje
4. Přidat lepší chybové hlášky s názvy souborů bez GPS

### Technický detail
Problém je specificky na řádku 12 v `exifReader.ts`:
```typescript
// Špatně - pick přebíjí gps
exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate'] })

// Správně - nechat gps fungovat, bez pick filtru
exifr.parse(file, true) // parse all, including GPS
```

