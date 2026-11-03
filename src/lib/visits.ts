/**
 * Which comments are new since your last visit to a thread. A visit records when you were last
 * there and any new comments you hadn't scrolled to yet, so refreshing doesn't lose them.
 */
export interface Visit {
    /** When you last left the thread (epoch ms). */
    at: number;
    /** New comments from that visit you never saw. */
    unseen: string[];
    /** The thread's comment count then, so post lists can show how many are new since. */
    count?: number;
}

export interface CommentStamp {
    id: string;
    /** When the comment was posted (epoch ms). */
    created: number;
}

/** Visits older than this are forgotten. */
export const VISIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Comments new since `visit` (none on a first visit, when everything would be "new"). */
export function newCommentIds(comments: readonly CommentStamp[], visit: Visit | undefined): Set<string> {
    if (!visit) {
        return new Set();
    }
    const unseen = new Set(visit.unseen);
    return new Set(comments.filter((comment) => comment.created > visit.at || unseen.has(comment.id)).map((comment) => comment.id));
}

/** The visit to remember when leaving: now, plus the new comments still not seen. */
export function nextVisit(now: number, fresh: ReadonlySet<string>, seen: ReadonlySet<string>, count?: number): Visit {
    const visit: Visit = { at: now, unseen: [...fresh].filter((id) => !seen.has(id)) };
    if (count !== undefined) {
        visit.count = count;
    }
    return visit;
}

/**
 * How many of a thread's comments are new to you, for a post list: those posted since your last
 * visit plus the new ones you didn't reach then. Undefined if you haven't been (or not since
 * Ember started counting).
 */
export function newSinceVisit(visit: Visit | undefined, count: number): number | undefined {
    if (visit?.count === undefined) {
        return undefined;
    }
    // Deleted comments lower the count, so it can drop below the last visit's.
    return Math.max(0, count - visit.count) + visit.unseen.length;
}

/** Drops visits older than the TTL. */
export function pruneVisits(visits: Record<string, Visit>, now: number): Record<string, Visit> {
    return Object.fromEntries(Object.entries(visits).filter(([, visit]) => now - visit.at < VISIT_TTL_MS));
}

/** A thread's id from an old.reddit comments URL ("/r/x/comments/<id>/…"). */
export function threadIdFromPath(path: string): string | undefined {
    return /\/comments\/([a-z0-9]+)/i.exec(path)?.[1];
}
