export class ViewStateService {
  private static instance: ViewStateService;
  private expandedNodes: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): ViewStateService {
    if (!ViewStateService.instance) {
      ViewStateService.instance = new ViewStateService();
    }
    return ViewStateService.instance;
  }

  public setExpanded(nodeId: string, expanded: boolean): void {
    if (expanded) {
      this.expandedNodes.add(nodeId);
    } else {
      this.expandedNodes.delete(nodeId);
    }
  }

  public isExpanded(nodeId: string): boolean {
    return this.expandedNodes.has(nodeId);
  }

  public getExpandedNodes(): string[] {
    return Array.from(this.expandedNodes);
  }
}
