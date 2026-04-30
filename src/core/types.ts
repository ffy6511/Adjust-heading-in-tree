export interface PositionCore {
  line: number;
  character: number;
}

export interface RangeCore {
  start: PositionCore;
  end: PositionCore;
}

export type HeadingKind = "markdown" | "typst";

export interface HeadingMatchCore {
  kind: HeadingKind;
  level: number;
  text: string;
  displayText: string;
  line: number;
  range: RangeCore;
  tags: string[];
  remark?: string;
}

export interface HeadingNodeCore extends HeadingMatchCore {
  id: string;
  children: HeadingNodeCore[];
  breadcrumb: string[];
}

export interface HeadingDocument {
  nodes: HeadingNodeCore[];
  orderedNodes: HeadingNodeCore[];
  nodeById: Map<string, HeadingNodeCore>;
  nodeByLine: Map<number, HeadingNodeCore>;
}
