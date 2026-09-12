/** Map the incoming learning topics onto the accepted linked-workspace controls. */
export const TOUR_TARGETS: Record<string, string> = {
  brand: '.wave-brand', status: '.wave-header [role="status"]', presets: '.device-menu',
  export: '.layout-results-toolbar', 'reset-params': '.device-menu',
  'parts-panel': '.components-menu', 'part-junction': '.layout-editor h1',
  'part-capacitor': '.layout-editor h1', 'part-gate': '.layout-editor h1',
  'part-ground': '.layout-editor h1', 'part-substrate': '.layout-editor h1',
  'hide-junction': '.view-options', 'view-3d': '.wave-view-switch', 'view-schematic': '.wave-view-switch',
  'view-split': '.split-toggle', 'reset-view': '.hardware-reset', assembly: '.hardware-toolbar',
  legend: '.layout-editor', 'tab-edit': '.wave-modes', 'tab-goal': '.wave-modes',
  'tab-materials': '.material-sensitivity', 'field-ej': '.layout-primary-field',
  'field-ec': '.layout-primary-field', 'field-ng': '.layout-primary-field',
  'tech-detail': '.layout-editor-footer', ncut: '.layout-solver', 'goal-freq': '.goal-primary',
  'goal-rules': '.goal-rules', 'goal-tol': '.goal-rules', 'goal-alpha': '.goal-rules',
  'goal-disp': '.goal-rules', 'mat-priority': '.material-goal', 'mat-base': '.material-goal',
  'search-run': '.full-button.lab-button', stress: '.experiment-card', 'stress-var': '.experiment-card',
  tunable: '.experiment-card:last-of-type', flux: '.experiment-card:last-of-type', asymmetry: '.experiment-card:last-of-type',
  verdict: '.verdict', 'metric-disp': '[data-tour="metric-dispersion"]', baseline: '.layout-results-toolbar',
};
