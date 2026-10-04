import { panelStatusLabels } from './labels';
import type { PanelStatus } from '../application/types';

export const panelStatuses: Record<PanelStatus, { label: string; tone: string; loading: boolean }> =
  {
    preparing: { label: panelStatusLabels['preparing'], tone: 'info', loading: true },
    comparing: { label: panelStatusLabels['comparing'], tone: 'info', loading: true },
    'awaiting-write': { label: panelStatusLabels['awaiting-write'], tone: 'info', loading: false },
    'submission-wait': { label: panelStatusLabels['submission-wait'], tone: 'info', loading: true },
    executing: { label: panelStatusLabels['executing'], tone: 'info', loading: true },
    completed: { label: panelStatusLabels['completed'], tone: 'success', loading: false },
    attention: { label: panelStatusLabels['attention'], tone: 'warning', loading: false },
    error: { label: panelStatusLabels['error'], tone: 'danger', loading: false },
    interrupted: { label: panelStatusLabels['interrupted'], tone: 'warning', loading: false }
  };
