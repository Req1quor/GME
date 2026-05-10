    # Workflow de release — GME

## Vue d'ensemble

```
code → bump version → build → commit → push → gh release → (VPS)
```

---

## Étape 1 — Bump de version

Dans `package.json`, incrémenter le champ `"version"` :

```json
"version": "1.0.4"
```

> Convention : `MAJOR.MINOR.PATCH`  
> - **PATCH** → bugfix  
> - **MINOR** → nouvelle feature  
> - **MAJOR** → breaking change

---

## Étape 2 — Build

```powershell
npm run build:app
```

Génère dans `release/` :
- `GME Setup X.X.X.exe` — installeur Windows
- `GME Setup X.X.X.exe.blockmap` — diff pour l'auto-updater
- `latest.yml` — manifeste de version pour electron-updater

---

## Étape 3 — Commit & push

```powershell
git add .
git commit -m "chore: release vX.X.X"
git push
```

---

## Étape 4 — Créer la GitHub Release

```powershell
gh release create vX.X.X "release\GME Setup X.X.X.exe" `
  --title "GME vX.X.X" `
  --notes "Description des changements"
```

Le `.exe` est uploadé comme asset téléchargeable directement depuis la page de la release GitHub.

> Pour remplacer une release existante (ex : hotfix sur le même tag) :
> ```powershell
> gh release delete vX.X.X --yes
> gh release create vX.X.X "release\GME Setup X.X.X.exe" --title "GME vX.X.X" --notes "..."
> ```

---

## Étape 5 (optionnel) — Déployer l'auto-updater sur le VPS

Si tu utilises `electron-updater` avec ton VPS pour les mises à jour silencieuses :

```powershell
.\scripts\deploy-update.ps1 -SshHost root@grandemaisonzoo.com
```

Envoie vers `/var/www/updates/gme/` :
- `GME Setup X.X.X.exe`
- `GME Setup X.X.X.exe.blockmap`
- `latest.yml`

---

## Checklist complète

```
[ ] Bump "version" dans package.json
[ ] npm run build:app
[ ] git add . && git commit -m "chore: release vX.X.X" && git push
[ ] gh release create vX.X.X "release\GME Setup X.X.X.exe" --title "GME vX.X.X" --notes "..."
[ ] (opt) .\scripts\deploy-update.ps1 -SshHost user@vps.example.com
```

---

## Notes

- Les binaires (`.exe`, `win-unpacked/`) sont dans `.gitignore` — ils ne sont jamais commités dans le repo, uniquement uploadés en tant qu'assets de release GitHub.
- `latest.yml` et les `.blockmap` **ne sont pas** dans `.gitignore` — ils doivent rester commitables pour tracer les versions.
- Le repo GitHub sert de source de vérité pour le code ; la Release GitHub sert de point de téléchargement pour les utilisateurs.
