/**
 * Ember's settings: one table of values and defaults. Stored in Firefox Sync (only what differs
 * from the defaults) and mirrored to the page's localStorage, so the theme applies before the
 * page first paints.
 */
interface ChoiceDef<T extends string> {
    kind: 'choice';
    values: readonly T[];
    default: T;
}

interface BoolDef {
    kind: 'bool';
    default: boolean;
}

function choice<const T extends string>(values: readonly T[], fallback: NoInfer<T>): ChoiceDef<T> {
    return { kind: 'choice', values, default: fallback };
}

function bool(fallback: boolean): BoolDef {
    return { kind: 'bool', default: fallback };
}

export const SCHEMA = {
    theme: choice(['system', 'dusk', 'dark', 'dim', 'black', 'light'], 'system'),
    width: choice(['full', 'wide', 'narrow'], 'wide'),
    indent: choice(['compact', 'normal', 'wide'], 'normal'),
    /** Comments flat with a colored bar per reply level (off: old reddit's nested boxes). */
    coloredThreads: bool(true),
    /** Each author's name in their own color. */
    authorColors: bool(true),
    /** Highlight comments posted since your last visit. */
    newComments: bool(true),
    showSidebar: bool(false),
    /** Subreddits' own stylesheets (off: Ember's theme everywhere). */
    subredditStyles: bool(false),
} as const;

type ValueOf<D> = D extends ChoiceDef<infer T> ? T : D extends BoolDef ? boolean : never;

export type Settings = { -readonly [K in keyof typeof SCHEMA]: ValueOf<(typeof SCHEMA)[K]> };
export type SettingKey = keyof Settings;
export type Theme = Settings['theme'];

export const SETTING_KEYS = Object.keys(SCHEMA) as SettingKey[];

export const DEFAULTS: Settings = Object.fromEntries(SETTING_KEYS.map((key) => [key, SCHEMA[key].default])) as Settings;

function valid(key: SettingKey, value: unknown): boolean {
    const def = SCHEMA[key];
    return def.kind === 'bool' ? typeof value === 'boolean' : (def.values as readonly unknown[]).includes(value);
}

/** Settings from stored data: unknown keys are ignored, invalid or missing values fall back to defaults. */
export function decodeSettings(data: unknown): Settings {
    const stored = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const values: Record<string, unknown> = { ...DEFAULTS };
    for (const key of SETTING_KEYS) {
        if (valid(key, stored[key])) {
            values[key] = stored[key];
        }
    }
    return values as Settings;
}

/** Only the values that differ from the defaults, so better defaults reach everyone later. */
export function encodeSettings(values: Settings): Partial<Settings> {
    const changed: Record<string, unknown> = {};
    for (const key of SETTING_KEYS) {
        if (values[key] !== DEFAULTS[key]) {
            changed[key] = values[key];
        }
    }
    return changed;
}

/** The theme actually shown: "system" follows the OS between Dusk and Light. */
export function resolveTheme(theme: Theme, prefersLight: boolean): Exclude<Theme, 'system'> {
    if (theme === 'system') {
        return prefersLight ? 'light' : 'dusk';
    }
    return theme;
}
