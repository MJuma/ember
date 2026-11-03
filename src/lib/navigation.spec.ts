import { describe, expect, it } from 'vitest';

import { indexAtLine, pickTarget } from './navigation';

describe('navigation', () => {
    const tops = [-500, -40, 12, 300, 900];

    it('goes forward to the first comment below the reading line', () => {
        expect(pickTarget(tops, 12, 1)).toBe(3);
        expect(pickTarget([-10, -5], 12, 1)).toBe(-1);
    });

    it('goes back to the start of the comment being read, then the one before', () => {
        expect(pickTarget(tops, 12, -1)).toBe(1);
        expect(pickTarget([12, 400], 12, -1)).toBe(-1);
    });

    it('knows which comment is being read', () => {
        expect(indexAtLine(tops, 12)).toBe(2);
        expect(indexAtLine([50, 80], 12)).toBe(-1);
    });
});
