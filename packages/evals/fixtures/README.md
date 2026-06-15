# Golden set PDFs (gitignored, locally generated)

The 5 PDFs the golden set questions reference are **generated locally from markdown sources** in `sources/`. The PDFs are gitignored (root `.gitignore`); the markdown sources are committed and are the source of truth.

## Why this approach

1. **No copyright concerns.** Content is original to this project, not redistributed.
2. **Stable URLs not needed.** Anyone regenerates with `pnpm build:fixtures`.
3. **Repo stays light.** PDFs total ~30 KB; markdown sources total ~22 KB and live in git.
4. **Content tailored to the golden set.** Each Q&A in `../golden-set.json` references specific text I authored — no risk of golden set drifting from the source.

## Generate the PDFs

From the repo root:

```sh
pnpm build:fixtures
```

Or from `packages/evals/`:

```sh
pnpm build:fixtures
# or
node scripts/build-fixtures.mjs
```

Output: 5 PDFs in this directory, ~5-7 KB each, 2-4 pages each.

## The 5 documents

| File | Pages | Language | Type | Length (chars) |
|---|---|---|---|---|
| `paper-attention.pdf` | 2 | EN | Synthetic academic paper | ~3,400 |
| `manual-product.pdf` | 3 | EN | Product manual (fictional smart thermostat) | ~4,100 |
| `report-financial.pdf` | 4 | EN | Quarterly financial summary (fictional company) | ~3,300 |
| `doc-legal-tos.pdf` | 2 | EN | Terms of Service (fictional SaaS) | ~3,500 |
| `doc-spanish.pdf` | 3 | ES | Municipal memorandum (fictional Spanish-language plan) | ~4,200 |

## Naming convention

- Markdown sources: `sources/<name>.md`
- Generated PDFs: `./<name>.pdf` (sibling to this README)
- Both names match the `id`/`file` fields in `../golden-set.json`.

## Regenerating after content changes

If you edit `sources/<name>.md`, re-run `pnpm build:fixtures` to refresh the PDFs. **Also** update the matching items in `../golden-set.json` if the change affects any of the Q&A — there is no automated drift check (yet; landing in M5 with `pnpm eval:validate-golden-set`).
