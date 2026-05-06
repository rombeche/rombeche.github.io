# Edvard Munch Timeline

This timeline reads painting data from `edvard_munch.csv` and displays the works as vertical cards positioned against a horizontal year axis.

## File setup

- `index.html` - page structure and modal
- `styles.css` - timeline + modal layout
- `main.js` - CSV parser, rendering logic, modal behavior, performance optimizations
- `munch_paintings/` - local painting files already used by `main.js`

## Run locally

Because browsers block `fetch()` from local `file://` pages, run a local web server:

- Python: `python -m http.server 8000`
- Node: `npx serve .`

Then open:

- `http://localhost:8000`

## Performance notes

- Initial render is batched for fast first paint.
- Thumbnail images use native lazy loading.
- Cards use `content-visibility` to reduce rendering cost.
