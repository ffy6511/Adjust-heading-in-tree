import { HeadingDocument, HeadingMatchCore, HeadingNodeCore } from "./types";

export function buildHeadingTree(matches: HeadingMatchCore[]): HeadingDocument {
  const nodes: HeadingNodeCore[] = [];
  const stack: HeadingNodeCore[] = [];
  const orderedNodes: HeadingNodeCore[] = [];
  const nodeById = new Map<string, HeadingNodeCore>();
  const nodeByLine = new Map<number, HeadingNodeCore>();

  for (const match of matches) {
    while (stack.length > 0 && stack[stack.length - 1].level >= match.level) {
      stack.pop();
    }

    const breadcrumb =
      stack.length > 0
        ? [...stack[stack.length - 1].breadcrumb, match.displayText]
        : [match.displayText];
    const node: HeadingNodeCore = {
      ...match,
      id: `${match.line}:${match.kind}:${match.text}`,
      children: [],
      breadcrumb,
    };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      nodes.push(node);
    }

    stack.push(node);
    orderedNodes.push(node);
    nodeById.set(node.id, node);
    nodeByLine.set(node.line, node);
  }

  return { nodes, orderedNodes, nodeById, nodeByLine };
}
