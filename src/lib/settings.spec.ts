import { describe, expect, it } from 'vitest';

import { decodeSettings, DEFAULTS, encodeSettings, resolveTheme } from './settings';

describe('settings', () => {
    it('falls back to defaults for missing, unknown or invalid values', () => {
        expect(decodeSettings({ theme: 'dim', width: 'huge', showSidebar: 'yes', other: 1 })).toEqual({ ...DEFAULTS, theme: 'dim' });
        expect(decodeSettings(undefined)).toEqual(DEFAULTS);
    });

    it('stores only what differs from the defaults, and reads it back', () => {
        const changed = { ...DEFAULTS, theme: 'black' as const, authorColors: false };
        expect(encodeSettings(changed)).toEqual({ theme: 'black', authorColors: false });
        expect(decodeSettings(encodeSettings(changed))).toEqual(changed);
    });

    it('follows the system between Midnight and Paper', () => {
        expect(resolveTheme('system', true)).toBe('light');
        expect(resolveTheme('system', false)).toBe('dusk');
        expect(resolveTheme('dim', true)).toBe('dim');
    });
});
