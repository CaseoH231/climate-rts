# Bio Study Notes

A biology revision app: topics of clickable note cards, coloured labelled diagrams, a cell explorer, flashcards.
Plain HTML/CSS/JS, no build step. Its own Cloudflare Worker: **bio-study**.

## Run it on your computer
Right-click `index.html` → **Open with Live Server**.

## Cloudflare
It's the Worker **bio-study** → **https://bio-study.adrian11jonker.workers.dev**.
It is **not** connected to GitHub, so pushing doesn't update it. To publish changes (or ask Claude to):

```bash
python3 tools/build_bio_worker.py /tmp/bioworker
cd /tmp/bioworker && npx wrangler deploy
```

`tools/build_bio_worker.py` packs every file in this folder into one Worker script, so no separate file upload is needed.
(`wrangler.jsonc` here is only used if you ever connect the folder to Cloudflare through GitHub, with root directory `biology`.)
