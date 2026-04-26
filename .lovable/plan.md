## 🎯 Cíl

Umožnit uživateli:
1. **Uložit aktuální trasu** (GPX + fotky + popisky) do cloudu pod jménem ("Lovoš", "Sněžka"…)
2. **Vrátit se k uloženým trasám** ze seznamu "Moje trasy"
3. **Sdílet trasu odkazem** typu `/trail/<slug>` (read-only zobrazení pro kohokoliv)

---

## 🏗️ Architektura

### Backend: Lovable Cloud (Supabase)
- **Auth**: email + heslo, Google sign-in
- **Storage bucket** `trail-photos` (public read) — uložené fotky
- **DB tabulky**:
  - `trails` — id, user_id, name, slug, gpx_data (jsonb), is_public (bool), created_at
  - `trail_photos` — id, trail_id, photo_url, description, lat, lon, timestamp
- **RLS**:
  - `trails`: owner full CRUD; ostatní SELECT pouze když `is_public = true`
  - `trail_photos`: stejně, řízeno přes parent trail
- **User roles**: NEPOTŘEBA (jen vlastník vs. veřejné)
- **Profiles**: NEPOTŘEBA (zatím jen email, žádný profil/avatar)

### Frontend
- Nové stránky:
  - `/auth` — login/signup (email + Google)
  - `/trails` — seznam mých tras + tlačítko "Otevřít" / "Smazat" / "Kopírovat odkaz"
  - `/trail/:slug` — veřejné read-only zobrazení (mapa + fotky, bez uploadu)
- `/` zůstává stejná (uploader + editor)
- Header: pokud přihlášen → tlačítko "💾 Uložit trasu" + odkaz "Moje trasy" + email/odhlásit
- Pokud nepřihlášen → tlačítko "Přihlásit pro uložení"

---

## 📋 Kroky implementace

1. **Zapnout Lovable Cloud** — auto-provisioning Supabase
2. **Migrace DB** — vytvořit `trails`, `trail_photos`, RLS politiky, storage bucket
3. **Auth**:
   - Stránka `/auth` (email/password + Google tlačítko)
   - `useAuth` hook + `ProtectedRoute` wrapper
   - Header s login/logout
4. **Save trail flow** (z `/`):
   - Tlačítko "💾 Uložit trasu" → dialog (název, public on/off)
   - Upload fotek do Storage (base64 → blob → bucket)
   - Insert do `trails` + `trail_photos`
   - Toast s odkazem "Sdílet" pokud public
5. **Stránka `/trails`** — fetch vlastních tras, karty s náhledem, akce
6. **Stránka `/trail/:slug`** — fetch podle slug, načte GPX + fotky, zobrazí TrailMap v read-only módu (skryje upload UI)
7. **Sdílecí odkaz** — `navigator.clipboard.writeText` z `/trails` i hned po uložení

---

## ⚠️ Důležité poznámky

- **Velikost fotek**: base64 v DB by bylo neúnosné → fotky půjdou do Storage, v DB jen URL
- **GPX**: uložím jako jsonb (parsed `GPXData`) — rychlejší načtení než re-parse XML
- **Slug**: `slugify(name) + '-' + random(6)` aby byly URL hezké a unikátní
- **Read-only mód v TrailMap**: přidám prop `readOnly?: boolean`, který skryje upload tlačítka

---

## ❓ Otevřená otázka

Chceš, aby trasy byly **defaultně veřejné** (sdílení jedním kliknutím), nebo **defaultně soukromé** (musíš aktivně přepnout přepínač "Sdílet")?

Řekni a začneme.