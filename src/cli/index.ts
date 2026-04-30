#!/usr/bin/env node
import { Command } from "commander";
import { loadDocument } from "./io/document";
import { runListCommand } from "./commands/list";
import { runNormalizeCommand } from "./commands/normalize";
import { runTagsSetCommand } from "./commands/tags";
import { runRemarkSetCommand } from "./commands/remark";
import { runShiftCommand } from "./commands/shift";
import { runMoveCommand } from "./commands/move";
import { runDeleteCommand } from "./commands/delete";
import { runExportCommand } from "./commands/export";

const program = new Command();

program
  .name("aht")
  .description("CLI for Adjust Heading in Tree")
  .showHelpAfterError();

program
  .command("list")
  .requiredOption("--file <path>")
  .option("--json")
  .option("--interactive")
  .option("--show-position")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runListCommand({
      json: options.json,
      interactive: options.interactive,
      showPosition: options.showPosition,
      loadedDocument,
    });
  });

program
  .command("normalize")
  .requiredOption("--file <path>")
  .option("--kind <kind>")
  .option("--write")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runNormalizeCommand({
      kind: options.kind,
      write: options.write,
      loadedDocument,
    });
  });

const tagsCommand = program.command("tags");
tagsCommand
  .command("set")
  .requiredOption("--file <path>")
  .requiredOption("--tags <csv>")
  .option("--selector <expr>")
  .option("--write")
  .option("--interactive")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runTagsSetCommand({
      selector: options.selector,
      tags: options.tags,
      write: options.write,
      interactive: options.interactive,
      loadedDocument,
    });
  });

const remarkCommand = program.command("remark");
remarkCommand
  .command("set")
  .requiredOption("--file <path>")
  .requiredOption("--text <remark>")
  .option("--selector <expr>")
  .option("--write")
  .option("--interactive")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runRemarkSetCommand({
      selector: options.selector,
      text: options.text,
      write: options.write,
      interactive: options.interactive,
      loadedDocument,
    });
  });

program
  .command("shift")
  .requiredOption("--file <path>")
  .requiredOption("--by <offset>")
  .option("--selector <expr>")
  .option("--write")
  .option("--interactive")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runShiftCommand({
      selector: options.selector,
      by: Number.parseInt(options.by, 10),
      write: options.write,
      interactive: options.interactive,
      loadedDocument,
    });
  });

program
  .command("move")
  .requiredOption("--file <path>")
  .option("--selector <expr>")
  .option("--before <expr>")
  .option("--after <expr>")
  .option("--write")
  .option("--interactive")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runMoveCommand({
      selector: options.selector,
      before: options.before,
      after: options.after,
      write: options.write,
      interactive: options.interactive,
      loadedDocument,
    });
  });

program
  .command("delete")
  .requiredOption("--file <path>")
  .option("--selector <expr>")
  .option("--write")
  .option("--interactive")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runDeleteCommand({
      selector: options.selector,
      write: options.write,
      interactive: options.interactive,
      loadedDocument,
    });
  });

program
  .command("export")
  .requiredOption("--file <path>")
  .requiredOption("--format <format>")
  .requiredOption("--output <path>")
  .option("--selector <expr>")
  .option("--ppi <ppi>")
  .option("--extra-imports <path>")
  .option("--interactive")
  .action(async (options) => {
    const loadedDocument = await loadDocument(options.file);
    await runExportCommand({
      selector: options.selector,
      format: options.format,
      output: options.output,
      ppi: options.ppi ? Number.parseInt(options.ppi, 10) : undefined,
      extraImports: options["extraImports"],
      interactive: options.interactive,
      loadedDocument,
    });
  });

void program.parseAsync(process.argv).catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
