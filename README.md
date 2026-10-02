# My Lil Guys for Suno

A local composition notebook built from the Little Guy Machine archives. It keeps the project’s core idea intact: give musical dimensions separate jurisdictions, make their interaction operational, and let an anchor survive the transformation.

## Run it

Requires Python 3.10 or newer. No packages or build step are required.

```sh
python3 -m little_guy
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). On first launch the app imports run records from Markdown files in the repository root. Original archives are read-only; the SQLite library is stored outside the repository at `~/.local/share/my-lil-guys-for-suno/library.sqlite3`.

Options:

```sh
python3 -m little_guy --port 8080
python3 -m little_guy --source-dir /path/to/markdown-exports
python3 -m little_guy --database /path/to/library.sqlite3
```

The server binds to `127.0.0.1` by default. Keep that setting unless you intentionally want to expose the app to other machines.

## Public reading room

The `netlify` branch adds a static site in [`site/`](site/) — the same ledger, with no Python and no build step. In Netlify, choose that branch. [`netlify.toml`](netlify.toml) publishes `site/`.

## What it does

- Imports archived runs and their seeds, engine stacks, musical fingerprints, metrics, and STYLE / LYRICS / CAPTION sections.
- Searches the imported library and lets you star experiments and save mechanism-focused feedback.
- Organizes runs into sessions so you can revisit a creative thread and continue it with another variation.
- Builds a structured composition blueprint from a seed, energy, separate musical-jurisdiction assignments, an anchor, operators, cast, arrangement, and constraints.
- Saves new blueprints into local sessions and exports each run as Markdown.

This is a prompt and experiment notebook, not an audio generator or Suno API client. Copy a blueprint into the music-generation workflow you choose; generated audio and model credentials are not sent to or stored by this app.

## Tests

```sh
python3 -m unittest discover -s tests -v
```
