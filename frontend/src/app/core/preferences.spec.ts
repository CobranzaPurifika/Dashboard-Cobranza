import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, loadPreferences, PREFERENCES_KEY, savePreferences } from './preferences';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe('preferencias de la aplicación', () => {
  it('usa los valores por defecto cuando no hay configuración guardada', () => {
    expect(loadPreferences(storage())).toEqual(DEFAULT_PREFERENCES);
  });

  it('recupera la configuración guardada', () => {
    const target = storage({
      [PREFERENCES_KEY]: JSON.stringify({
        defaultFranchise: 'cancun',
        priorityDensity: 'compact',
        startView: 'management',
        presentation: { durationSeconds: 30, franchiseIds: ['cancun', 'merida'], autoStart: false, hideControls: true },
      }),
    });
    expect(loadPreferences(target)).toEqual({
      defaultFranchise: 'cancun',
      priorityDensity: 'compact',
      startView: 'management',
      presentation: { durationSeconds: 30, franchiseIds: ['cancun', 'merida'], autoStart: false, hideControls: true },
    });
  });

  it('ignora valores inválidos y cae a los valores por defecto', () => {
    const target = storage({
      [PREFERENCES_KEY]: JSON.stringify({
        defaultFranchise: '',
        priorityDensity: 'gigante',
        startView: 'gigante',
        presentation: { durationSeconds: 2, franchiseIds: [], autoStart: 'sí' },
      }),
    });
    expect(loadPreferences(target)).toEqual(DEFAULT_PREFERENCES);
  });

  it('tolera JSON corrupto', () => {
    const target = storage({ [PREFERENCES_KEY]: '{not-json' });
    expect(loadPreferences(target)).toEqual(DEFAULT_PREFERENCES);
  });

  it('guarda y recupera un ciclo completo', () => {
    const target = storage();
    const custom = {
      defaultFranchise: 'merida',
      priorityDensity: 'compact' as const,
      startView: 'management' as const,
      presentation: { durationSeconds: 12, franchiseIds: ['merida'], autoStart: true, hideControls: false },
    };
    savePreferences(target, custom);
    expect(loadPreferences(target)).toEqual(custom);
  });
});
