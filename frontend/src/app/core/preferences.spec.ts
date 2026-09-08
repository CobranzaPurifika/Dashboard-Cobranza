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
  it('usa Dashboard y valores seguros cuando no hay configuración', () => {
    expect(loadPreferences(storage())).toEqual(DEFAULT_PREFERENCES);
  });

  it('recupera la configuración guardada y migra el tema anterior', () => {
    const legacy = storage({ 'cobranza-purifika.theme': 'light' });
    expect(loadPreferences(legacy).theme).toBe('light');

    const current = storage({
      [PREFERENCES_KEY]: JSON.stringify({
        initialView: 'management', theme: 'dark', defaultFranchise: 'cancun', density: 'compact',
      }),
    });
    expect(loadPreferences(current)).toMatchObject({
      initialView: 'management', theme: 'dark', defaultFranchise: 'cancun', density: 'compact',
    });
  });

  it('guarda también la llave de tema compatible', () => {
    const target = storage();
    savePreferences(target, { ...DEFAULT_PREFERENCES, theme: 'light' });
    expect(target.values.get('cobranza-purifika.theme')).toBe('light');
    expect(JSON.parse(target.values.get(PREFERENCES_KEY)!)).toMatchObject({ theme: 'light' });
  });
});
