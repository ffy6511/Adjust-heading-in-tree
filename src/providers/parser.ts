import { Position, Range } from "vscode";
import {
  HeadingKind as CoreHeadingKind,
  HeadingMatchCore,
} from "../core/types";
import { parseHeadings as parseHeadingsCore } from "../core/parser";

export type HeadingKind = CoreHeadingKind;

export interface HeadingMatch {
  kind: HeadingKind;
  level: number;
  text: string;
  displayText: string;
  line: number;
  range: Range;
  tags: string[];
  remark?: string;
}

export function parseHeadings(content: string): HeadingMatch[] {
  return parseHeadingsCore(content).map(convertMatch);
}

function convertMatch(match: HeadingMatchCore): HeadingMatch {
  return {
    ...match,
    range: new Range(
      new Position(match.range.start.line, match.range.start.character),
      new Position(match.range.end.line, match.range.end.character),
    ),
  };
}
