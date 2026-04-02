

## Automatické umístění fotek podle GPS souřadnic z EXIF dat

Místo ručního klikání na mapu přidám tlačítko "Přidat fotky", které umožní vybrat více fotek najednou. Z každé fotky se automaticky přečtou GPS souřadnice z EXIF metadat a fotka se umístí na správné místo na mapě.

### Jak to bude fungovat

1. Uživatel klikne na tlačítko "📷 Přidat fotky" (místo klikání na mapu)
2. Vybere jednu nebo více fotek z disku
3. Z každé fotky se přečtou EXIF GPS souřadnice
4. Fotky se automaticky umístí na mapě na správné pozice
5. Fotky bez GPS dat se přeskočí s upozorněním

### Technické změny

**Nová závislost:**
- `exifr` — lightweight knihovna pro čtení EXIF dat z obrázků (GPS, datum, orientace)

**Nový soubor `src/utils/exifReader.ts`:**
- Funkce `extractPhotoGPS(file: File)` → vrací `{ lat, lon, timestamp?, description? }` nebo `null` pokud fotka nemá GPS
- Použije `exifr` k parsování GPS souřadnic z EXIF dat
- Komprese obrázku na thumbnail (max 800px, kvalita 70%) — stejně jako v současném `PhotoUploadModal`

**Úprava `src/components/TrailMap.tsx`:**
- Přidat tlačítko "📷 Přidat fotky" do UI (vedle ovládacích prvků mapy)
- Skrytý `<input type="file" multiple accept="image/*">` pro výběr více fotek
- Po výběru fotek: pro každou zavolat `extractPhotoGPS`, vytvořit `PhotoPoint` a přidat na mapu
- Odebrat click listener na mapě pro ruční přidávání fotek (řádky 108-120)
- Odebrat `PhotoUploadModal` — už nebude potřeba

**Co zůstane stejné:**
- Vizuální styl foto markerů (kulaté thumbnaily s tyčkou) — beze změny
- `PhotoViewModal` pro zobrazení detailu — beze změny
- Logika v `Index.tsx` pro animaci a auto-zobrazení fotek — beze změny

### Upozornění pro uživatele
- Pokud některé fotky nemají GPS data, zobrazí se toast "3 z 5 fotek nemají GPS souřadnice a byly přeskočeny"
- Pokud žádná fotka nemá GPS, zobrazí se chybová hláška

