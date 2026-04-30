---
name: aht-cli
description: Use when you need to batch inspect or edit Markdown or Typst headings, tags, remarks, subtree order, or exports through the local `aht` CLI instead of the VS Code UI. Trigger on requests to normalize heading comments, set tags or remarks, move headings, delete heading blocks, shift heading levels, or export Typst subtrees.
---

# AHT CLI

Use the local `aht` CLI as the primary interface for non-UI heading operations.

## Workflow

1. Confirm the target file path first. Always pass `--file`.
2. For discovery, run `aht list --file <path> --json`.
3. For edits, prefer a preview run first. Add `--write` only after checking the result.
4. For ambiguous targets, use `line:`, `text:`, `tag:`, or `path:` selectors. Use `--interactive` when a human is driving.
5. For delete and move, operate on one file at a time.

## Command patterns

- List headings:
  `aht list --file note.md --json`
- Normalize inline comments to next-line comments:
  `aht normalize --file note.md`
  `aht normalize --file note.md --write`
- Set tags:
  `aht tags set --file note.md --selector 'text:Alpha' --tags Review,Spark`
- Set or clear a remark:
  `aht remark set --file note.md --selector 'line:12' --text 'follow up'`
  `aht remark set --file note.md --selector 'line:12' --text '' --write`
- Shift a subtree:
  `aht shift --file note.md --selector 'path:Alpha > Beta' --by 1 --write`
- Move a subtree:
  `aht move --file note.md --selector 'text:Gamma' --before 'text:Alpha' --write`
- Delete a subtree:
  `aht delete --file note.md --selector 'tag:Todo'`
- Export a Typst subtree:
  `aht export --file note.typ --selector 'text:Alpha' --format pdf --output alpha.pdf`

Read [references/commands.md](references/commands.md) when you need a compact selector and safety reference.

## Safety rules

- Never batch-edit without a concrete `--file`.
- Default to preview mode. Only use `--write` when the requested mutation is clear.
- `tag:` selectors can match multiple headings. If a mutation selector is ambiguous, narrow it with `line:` or `path:`.
- Export supports Typst only. If `tinymist` is missing, stop and report the install requirement instead of guessing.
