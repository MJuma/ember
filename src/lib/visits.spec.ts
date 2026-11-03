import { describe, expect, it } from 'vitest';

import { newCommentIds, newSinceVisit, nextVisit, pruneVisits, threadIdFromPath, VISIT_TTL_MS } from './visits';

const comments = [
    { id: 'a', created: 1000 },
    { id: 'b', created: 2000 },
    { id: 'c', created: 3000 },
];

describe('visits', () => {
    it('marks nothing new on a first visit', () => {
        expect(newCommentIds(comments, undefined).size).toBe(0);
    });

    it('marks comments posted since the last visit, plus ones left unseen then', () => {
        expect([...newCommentIds(comments, { at: 2500, unseen: ['a'] })].sort()).toEqual(['a', 'c']);
    });

    it('remembers the new comments you never scrolled to', () => {
        expect(nextVisit(5000, new Set(['b', 'c']), new Set(['c']))).toEqual({ at: 5000, unseen: ['b'] });
        expect(nextVisit(5000, new Set(), new Set(), 41)).toEqual({ at: 5000, unseen: [], count: 41 });
    });

    it('counts comments new to you for a post list: posted since, plus the ones you never reached', () => {
        expect(newSinceVisit({ at: 0, unseen: ['x', 'y'], count: 40 }, 45)).toBe(7);
        expect(newSinceVisit({ at: 0, unseen: [], count: 40 }, 38)).toBe(0);
        expect(newSinceVisit({ at: 0, unseen: [] }, 45)).toBeUndefined();
        expect(newSinceVisit(undefined, 45)).toBeUndefined();
    });

    it('forgets old visits', () => {
        const now = 10 * VISIT_TTL_MS;
        expect(Object.keys(pruneVisits({ old: { at: now - VISIT_TTL_MS - 1, unseen: [] }, recent: { at: now - 1000, unseen: [] } }, now))).toEqual(['recent']);
    });

    it('finds the thread id in a comments URL', () => {
        expect(threadIdFromPath('/r/AskReddit/comments/1xlxtoc/whats_the_fastest/')).toBe('1xlxtoc');
        expect(threadIdFromPath('/r/AskReddit/')).toBeUndefined();
    });
});
