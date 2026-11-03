/**
 * Picking where to jump, given the tops of candidate comments (in page order, relative to the
 * viewport) and the reading line near the top of the screen. Forward goes to the first comment
 * starting below the line; back goes to the last one starting above it, so pressing back while
 * reading a long comment returns to its start.
 */
const SLACK_PX = 2;

export function pickTarget(tops: readonly number[], line: number, direction: 1 | -1): number {
    if (direction === 1) {
        return tops.findIndex((top) => top > line + SLACK_PX);
    }
    for (let at = tops.length - 1; at >= 0; at--) {
        if ((tops[at] ?? Number.POSITIVE_INFINITY) < line - SLACK_PX) {
            return at;
        }
    }
    return -1;
}

/** The comment being read: the last one starting at or above the reading line (-1 before the first). */
export function indexAtLine(tops: readonly number[], line: number): number {
    let found = -1;
    tops.forEach((top, at) => {
        if (top <= line + SLACK_PX) {
            found = at;
        }
    });
    return found;
}
