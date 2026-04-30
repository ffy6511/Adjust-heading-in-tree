# AHT CLI quick reference

## Selectors

- `line:<n>`: exact heading line number
- `text:<exact heading text>`: exact heading text match
- `tag:<tag-name>`: headings carrying one tag
- `path:<breadcrumb1> > <breadcrumb2> > <heading>`: exact breadcrumb path
- `current`: reserved for future editor integrations; do not rely on it in CLI flows

## Preview-first commands

- `aht normalize --file <path>`
- `aht tags set --file <path> --selector '<selector>' --tags Review`
- `aht remark set --file <path> --selector '<selector>' --text 'note'`
- `aht shift --file <path> --selector '<selector>' --by 1`
- `aht move --file <path> --selector '<selector>' --before '<selector>'`
- `aht delete --file <path> --selector '<selector>'`

Add `--write` to apply changes.

## Export

- PDF:
  `aht export --file note.typ --selector 'text:Alpha' --format pdf --output alpha.pdf`
- PNG:
  `aht export --file note.typ --selector 'text:Alpha' --format png --output alpha.png --ppi 144`

`tinymist` must be available on `PATH`.
