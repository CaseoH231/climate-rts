# Bio Study Notes

A biology revision app: topics of clickable note cards, coloured labelled diagrams, a cell explorer, flashcards.
Plain HTML/CSS/JS, no build step. Its own Cloudflare Worker: **bio-study**.

## Run it on your computer
Right-click `index.html` → **Open with Live Server**.

## Cloudflare (one-time set-up)
1. Cloudflare → **Workers & Pages → Create → Workers → Import a repository**.
2. Pick the **climate-rts** repository.
3. Project name: **bio-study** (must match `name` in `wrangler.jsonc`).
4. Open **Advanced settings** → **Root directory / Path**: `biology`
5. Build command: leave empty. Deploy command: `npx wrangler deploy`. Branch: `main`.
6. **Deploy**. It's then at **https://bio-study.adrian11jonker.workers.dev**, and every push to `main` updates it.

Optional: in **bio-study → Settings → Builds → Build watch paths**, include only `biology/*` so game changes don't redeploy it
(and in **climate-rts**, exclude `biology/*`).

`wrangler.jsonc` says "serve this folder as a website". `_headers` stops browsers holding on to old versions,
and `.assetsignore` keeps the settings files off the site.
