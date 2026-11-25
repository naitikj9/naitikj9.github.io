# Naitik Jain — 3D Portfolio

Static site (HTML + CSS + Three.js from CDN). No build step, so it deploys free anywhere.

## Run locally
```
python serve.py 5173
```
(from the folder above `portfolio/`), then open http://localhost:5173

## Deploy free on GitHub Pages
1. Create a repo named `naitikj9.github.io` on GitHub (public).
2. From inside this `portfolio` folder:
```
git init
git add .
git commit -m "Portfolio"
git branch -M main
git remote add origin https://github.com/naitikj9/naitikj9.github.io.git
git push -u origin main
```
3. Repo → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. Live in ~1 minute at https://naitikj9.github.io

## Alternatives (also free)
- **Netlify:** app.netlify.com → "Add new site" → "Deploy manually" → drag the `portfolio` folder in.
- **Vercel:** vercel.com → New Project → import the repo → Framework "Other" → Deploy.

## Editing
- Text/content: `index.html`
- Colors (monochrome palette): CSS variables at the top of `style.css`, scene colors at the top of `initScene()` in `main.js`
- Resume: replace `Naitik_Jain_Resume.pdf` (note: it contains your phone number, and it will be public)
