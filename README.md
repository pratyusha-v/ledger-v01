# ledger-v01
Mid-fidelity prototype of Ledger, the school records site for Sai Seva Sangh, built from the low-fi wireframes.

- `site/` – the static site (48 teacher and admin screens plus `index.html`, a screen directory)
- `site/assets/ledger.css` – palette, type and shape layer
- `wireframes/` – source wireframe screens
- `tools/build.py` – rebuilds `site/` from `wireframes/`

## Run locally

```bash
python3 -m http.server 8765 --directory site
```

Then open http://localhost:8765.

## Rebuild after editing wireframes

```bash
python3 tools/build.py
```

The logo at `site/assets/logo.svg` is a placeholder; replace it with the Sai Seva Sangh logo under the same name.
