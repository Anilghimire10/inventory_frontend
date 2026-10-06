/** Colour an activity-log action badge by intent. */
export function actionTone(action: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' {
  if (action.endsWith('.delete')) return 'destructive';
  if (action.endsWith('.create')) return 'success';
  if (action.includes('login')) return 'muted';
  if (action.endsWith('.update')) return 'warning';
  return 'default';
}
