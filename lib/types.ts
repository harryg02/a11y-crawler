export interface ViolationNode {
  html: string;
  selector: string;
  failureSummary: string;
}

export interface Violation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  help: string;
  description: string;
  helpUrl: string;
  wcagTags: string[];
  nodes: ViolationNode[];
}

export interface PageRecord {
  id: string;
  url: string;
  violations: Violation[];
  highRiskElements: Record<string, number>;
}

export interface ScanRecord {
  id: string;
  url: string;
  scope: string;
  date: string;
  durationSeconds: number;
  pages: PageRecord[];
}

// Crawler-internal type used during the crawl before wrapping into ScanRecord
export interface PageResult {
  url: string;
  violations: Violation[];
  highRiskElements: Record<string, number>;
}
