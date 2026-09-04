import { SignalItem, SignalRole } from './types';

const schoolSignalRoles = new Set<SignalRole>(['Head of Department', 'Teacher', 'Aspiring School Leader']);

export function signalObsidianDestinationPath(item: Pick<SignalItem, 'role' | 'kind'>): string {
  const root = item.role && schoolSignalRoles.has(item.role) ? 'Academic Year 2026/School Notes' : 'Fleeting Notes';
  return `${root}/${item.kind || 'Uncategorised'}.md`;
}
