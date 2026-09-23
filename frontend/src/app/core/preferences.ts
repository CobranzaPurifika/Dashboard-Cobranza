export type PriorityDensity = 'comfortable' | 'compact';

export interface PresentationPreferences {
  durationSeconds: number;
  franchiseIds: string[] | null; // null = todas las franquicias del usuario
  autoStart: boolean;
  hideControls: boolean;
}

export interface AppPreferences {
  defaultFranchise: string;
  priorityDensity: PriorityDensity;
  presentation: PresentationPreferences;
}

export const PREFERENCES_KEY = 'cobranza-purifika.preferences';

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultFranchise: 'todas',
  priorityDensity: 'comfortable',
  presentation: {
    durationSeconds: 18,
    franchiseIds: null,
    autoStart: true,
    hideControls: false,
  },
};

export function loadPreferences(storage: Pick<Storage, 'getItem'>): AppPreferences {
  let saved: Partial<AppPreferences> = {};
  try {
    saved = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  const presentation = saved.presentation ?? ({} as Partial<PresentationPreferences>);

  return {
    defaultFranchise: typeof saved.defaultFranchise === 'string' && saved.defaultFranchise
      ? saved.defaultFranchise
      : DEFAULT_PREFERENCES.defaultFranchise,
    priorityDensity: saved.priorityDensity === 'compact' ? 'compact' : 'comfortable',
    presentation: {
      durationSeconds: Number.isFinite(presentation.durationSeconds) && presentation.durationSeconds! >= 5
        ? presentation.durationSeconds!
        : DEFAULT_PREFERENCES.presentation.durationSeconds,
      franchiseIds: Array.isArray(presentation.franchiseIds) && presentation.franchiseIds.length
        ? presentation.franchiseIds
        : null,
      autoStart: presentation.autoStart !== false,
      hideControls: presentation.hideControls === true,
    },
  };
}

export function savePreferences(storage: Pick<Storage, 'setItem'>, preferences: AppPreferences): void {
  storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
