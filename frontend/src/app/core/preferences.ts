export type AppView = 'dashboard' | 'management';
export type AppTheme = 'dark' | 'light';
export type AppDensity = 'comfortable' | 'compact';

export interface AppPreferences {
  initialView: AppView;
  theme: AppTheme;
  defaultFranchise: string;
  density: AppDensity;
}

export const PREFERENCES_KEY = 'cobranza-purifika.preferences';

export const DEFAULT_PREFERENCES: AppPreferences = {
  initialView: 'dashboard',
  theme: 'dark',
  defaultFranchise: 'todas',
  density: 'comfortable',
};

export function loadPreferences(storage: Pick<Storage, 'getItem'>): AppPreferences {
  let saved: Partial<AppPreferences> = {};
  try {
    saved = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }

  const legacyTheme = storage.getItem('cobranza-purifika.theme');
  return {
    initialView: saved.initialView === 'management' ? 'management' : 'dashboard',
    theme: saved.theme === 'light' || (!saved.theme && legacyTheme === 'light') ? 'light' : 'dark',
    defaultFranchise: typeof saved.defaultFranchise === 'string' && saved.defaultFranchise
      ? saved.defaultFranchise
      : 'todas',
    density: saved.density === 'compact' ? 'compact' : 'comfortable',
  };
}

export function savePreferences(storage: Pick<Storage, 'setItem'>, preferences: AppPreferences): void {
  storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  // Se conserva la llave anterior para instalaciones que todavía cargan una versión previa.
  storage.setItem('cobranza-purifika.theme', preferences.theme);
}
