# ledger-v01

Mid-fidelity prototype of Ledger, the school records site for Sai Seva Sangh, built from the low-fi wireframes.

- `index.html` – screen directory; start here
- `*.html` – the 48 teacher and admin screens
- `assets/` – palette and type layer (`ledger.css`), small runtime (`ledger.js`), logo
- `wireframes/` – source wireframe screens
- `tools/build.py` – regenerates the screens from `wireframes/`

## Rebuild after editing wireframes

```bash
python3 tools/build.py
```

The logo at `assets/logo.svg` is a placeholder; replace it with the Sai Seva Sangh logo under the same name.
