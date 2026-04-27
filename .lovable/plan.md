# Export animace jako video pro sdílení

Cíl: Po dokončení 3D průletu (nebo na vyžádání) získat MP4/WebM video, které jde stáhnout a nasdílet na Facebook, Instagram, atd.

## Jak to bude fungovat (UX)

1. V `AnimationControls` (vedle tlačítek 3D průletu) přibude tlačítko **„Nahrát průlet"** 🎥.
2. Po kliknutí:
   - Spustí se nahrávání obrazovky mapy (canvas MapLibre + překryvy fotek/POI markerů).
   - Automaticky se spustí 3D průlet od začátku.
   - Po doletění na konec trasy se nahrávání samo zastaví.
3. Otevře se dialog s náhledem videa + tlačítka:
   - **Stáhnout** (uloží `.webm` / `.mp4` lokálně)
   - **Sdílet** (Web Share API → na mobilu nabídne FB/IG/WhatsApp; na desktopu fallback na stažení + zkopírování textu)
4. Indikátor „REC ●" během nahrávání + progress bar.

## Technické řešení

**Knihovny:** žádné nové. Použijeme nativní browser API:
- `HTMLCanvasElement.captureStream(fps)` — získá MediaStream z MapLibre canvasu
- `MediaRecorder` — zakóduje stream do WebM (VP9/VP8) nebo MP4 (kde to Safari podporuje)
- `navigator.share()` — Web Share API pro sdílení souboru

**Nový hook `src/hooks/useFlythroughRecorder.ts`:**
```ts
- startRecording(canvas, mimeType): vytvoří MediaRecorder, sbírá chunky
- stopRecording(): vrací Blob + URL
- isRecording, recordedBlob, recordedUrl
- detekce podporovaného mimeType: video/mp4 → video/webm;codecs=vp9 → vp8
```

**Úprava `useFlythrough.ts`:**
- Přidáme callback `onFlythroughComplete` který se zavolá v `stopFlythrough` když průlet doběhl přirozeně (ne ručním stopem) → recorder pak zastaví nahrávání.

**Úprava `TrailMap.tsx`:**
- Vystavíme ref na `map.getCanvas()` ven (přes `onMapReady` prop nebo forwarded ref), aby ho recorder mohl použít.
- Při inicializaci mapy nastavíme `preserveDrawingBuffer: true` (nutné pro `captureStream` u některých GPU).

**Nová komponenta `src/components/RecordFlythroughButton.tsx`:**
- Tlačítko + stavový indikátor.
- Orchestruje: start nahrávání → spuštění průletu → po skončení otevře `VideoPreviewDialog`.

**Nová komponenta `src/components/VideoPreviewDialog.tsx`:**
- `<video controls src={url} />` náhled
- Tlačítka **Stáhnout** a **Sdílet**
- Sdílení: pokud `navigator.canShare({ files: [...] })` → použije Web Share API, jinak fallback na download + toast „Stáhni a nahraj na FB ručně".

**Integrace v `Index.tsx`:**
- Přidat `RecordFlythroughButton` do `AnimationControls` propsu nebo vedle něj.
- Předat ref na canvas a `startFlythrough` / callback na konec.

## Omezení (řekneme uživateli)

- **Nahrávání běží jen v záložce která je vidět** (browser pozastaví canvas pokud přepneš tab) → ukážeme upozornění „Nepřepínej záložku".
- **Safari/iOS** má omezenou podporu `MediaRecorder` pro canvas — pro iOS uděláme fallback hlášku „Pro nahrávání použij Chrome/Firefox/Edge na desktopu".
- Výstup bude **WebM** ve většině prohlížečů (FB ho přijímá, ale doporučíme uživateli „pokud chceš MP4, zkonvertuj online — třeba cloudconvert.com"). Volitelně později přidáme server-side konverzi přes edge function + ffmpeg.wasm.
- Zvuk: zatím **bez zvuku** (je to jen vizualizace mapy). Můžeme později přidat hudbu na pozadí.

## Soubory k vytvoření / úpravě

- **nový** `src/hooks/useFlythroughRecorder.ts`
- **nový** `src/components/RecordFlythroughButton.tsx`
- **nový** `src/components/VideoPreviewDialog.tsx`
- **úprava** `src/components/TrailMap.tsx` — `preserveDrawingBuffer: true`, vystavení canvas ref
- **úprava** `src/hooks/useFlythrough.ts` — `onFlythroughComplete` callback
- **úprava** `src/components/AnimationControls.tsx` — přidat tlačítko
- **úprava** `src/pages/Index.tsx` — propojení

## Otevřené otázky (volitelné, mohu rozhodnout sám)

- **Rozlišení videa**: necháme nativní velikost canvasu (cca 1500×500 px) nebo přidat preset 1080×1080 (čtverec pro IG)? Defaultně necháme nativní, později můžeme přidat presety.
- **FPS**: 30 fps default (kompromis mezi plynulostí a velikostí souboru).