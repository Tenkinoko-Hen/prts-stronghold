export type ReportStatus = 'starting' | 'waiting' | 'connecting' | 'listening' | 'permission' | 'paused' | 'unavailable' | 'incompatible' | 'failed';
export interface ReportFeed {
  status: ReportStatus;
  report: unknown;
  reportRun: number;
}
export interface BattleReportsBridge {
  getState(): Promise<ReportFeed>;
  showDiagnostics(): Promise<void>;
  setEnabled(enabled: boolean): Promise<ReportFeed>;
  onState(callback: (state: ReportFeed) => void): () => void;
}
