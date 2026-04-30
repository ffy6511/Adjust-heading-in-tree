# AHT CLI

`AHT CLI` is the terminal companion for `Adjust Heading in Tree`.

It lets you inspect and edit Markdown or Typst heading trees without opening the VS Code UI.

## Install

Install from npm:

```bash
npm install -g @jhzhuo/aht-cli
```

For local development inside this repository:

```bash
npm install
npm link --workspace packages/aht-cli
```

## Common commands

```bash
aht list --file note.md --json
aht normalize --file note.md
aht tags set --file note.md --selector 'text:Alpha' --tags Review --write
aht move --file note.md --selector 'text:Gamma' --before 'text:Alpha' --write
```

## Homebrew

Homebrew support is generated from the published npm tarball. After publishing a new version, run:

```bash
npm run brew:formula
```

The script writes a formula file to `packaging/homebrew/aht-cli.rb`.
