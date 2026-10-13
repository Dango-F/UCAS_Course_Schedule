export interface SyncOptions { snapshotJson: string; complete: (resultJson: string) => void }
export interface UpdateOptions { widgetId: number; optionsJson: string; complete: (resultJson: string) => void }
export function syncSnapshot(options: SyncOptions): void
export function getWidgetState(): string
export function updateWidgetOptions(options: UpdateOptions): void
export function refreshWidgets(): void
export function requestPinWidget(kind: string): string
export function consumePendingAction(): string | null
