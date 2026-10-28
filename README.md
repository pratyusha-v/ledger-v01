# ledger-v01

Mid-fidelity prototype of Ledger, the school records site for Sai Seva Sangh, built from the low-fi wireframes.

- `index.html` – screen directory; start here
- `*.html` – the 48 teacher and admin screens
- `assets/` – styles (`ledger.css`), app code (`app.js`, `lib.js`, `pages/*.js`), Supabase settings (`config.js`), logo
- `supabase/migrations/` – database schema, access rules and demo data
- `wireframes/` – source wireframe screens
- `tools/build.py` – regenerates the screens from `wireframes/`

## Rebuild after editing wireframes

```bash
python3 tools/build.py
```

The logo at `assets/logo.svg` is a placeholder; replace it with the Sai Seva Sangh logo under the same name.

## Data

Ledger reads and saves everything in Supabase (project `Ledger`). Sign-in decides the role: staff rows in the `staff` table link to sign-in accounts by email on first sign-in. Teachers edit only their own classes and homeroom attendance; admins edit everything. These rules are enforced by row-level security in `supabase/migrations/001_schema.sql`.

New staff: an admin adds them under Permissions › Staff Directory, then they choose "Set up your account" on the sign-in page with that email.
