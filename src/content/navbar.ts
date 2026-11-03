import { indexAtLine, pickTarget } from '../lib/navigation';
import { isCollapsed, setCollapsed } from './comments';

/** Jump targets land this far below the top of the screen. */
const LINE_PX = 12;
const FLASH_MS = 900;

const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

export type Command = 'next-top' | 'prev-top' | 'next' | 'prev' | 'next-new' | 'prev-new' | 'toggle';

function topLevel(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.commentarea > .sitetable > .thing.comment')];
}

/** Comments you can see: not inside a collapsed one. */
function visible(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.commentarea .thing.comment')]
        .filter((comment) => !comment.parentElement?.closest('.thing.comment.collapsed'));
}

function topOf(comment: HTMLElement): number {
    return (comment.querySelector(':scope > .entry') ?? comment).getBoundingClientRect().top;
}

function jump(comment: HTMLElement): void {
    window.scrollTo({ top: window.scrollY + topOf(comment) - LINE_PX });
    comment.classList.remove('ember-focus');
    // Restart the highlight animation on a repeat jump.
    void comment.offsetWidth;
    comment.classList.add('ember-focus');
    window.setTimeout(() => {
        comment.classList.remove('ember-focus');
    }, FLASH_MS);
}

function step(list: HTMLElement[], direction: 1 | -1): void {
    const at = pickTarget(list.map(topOf), LINE_PX, direction);
    const target = list[at];
    if (target) {
        jump(target);
    }
}

export function run(command: Command): void {
    switch (command) {
        case 'next-top':
        case 'prev-top':
            step(topLevel(), command === 'next-top' ? 1 : -1);
            break;
        case 'next':
        case 'prev':
            step(visible(), command === 'next' ? 1 : -1);
            break;
        case 'next-new':
        case 'prev-new':
            step(visible().filter((comment) => comment.classList.contains('ember-new')), command === 'next-new' ? 1 : -1);
            break;
        case 'toggle': {
            const list = visible();
            const current = list[indexAtLine(list.map(topOf), LINE_PX)];
            if (current) {
                setCollapsed(current, !isCollapsed(current));
                if (topOf(current) < 0) {
                    jump(current);
                }
            }
            break;
        }
    }
}

export interface NavBar {
    update: () => void;
}

/** The floating bar: previous/next top-level comment, where you are, and a jump to new comments. */
export function mountNavBar(): NavBar | undefined {
    if (topLevel().length === 0) {
        return undefined;
    }
    const bar = document.createElement('div');
    bar.id = 'ember-nav';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Thread navigation');
    bar.innerHTML = `
        <button type="button" data-command="prev-top" title="Previous top-level comment (p)" aria-label="Previous top-level comment">${UP}</button>
        <span class="ember-nav-pos"></span>
        <button type="button" class="ember-nav-new" data-command="next-new" title="Next new comment (N)" hidden></button>
        <button type="button" data-command="next-top" title="Next top-level comment (n)" aria-label="Next top-level comment">${DOWN}</button>`;
    document.body.append(bar);
    const position = bar.querySelector<HTMLElement>('.ember-nav-pos');
    const fresh = bar.querySelector<HTMLButtonElement>('.ember-nav-new');

    bar.addEventListener('click', (event) => {
        const command = (event.target instanceof Element ? event.target.closest<HTMLElement>('[data-command]') : null)?.dataset['command'];
        if (command) {
            run(command as Command);
        }
    });

    let frame = 0;
    const update = (): void => {
        frame = 0;
        const tops = topLevel();
        const at = indexAtLine(tops.map(topOf), LINE_PX);
        if (position) {
            position.textContent = at < 0 ? `${tops.length} threads` : `${at + 1} / ${tops.length}`;
        }
        const count = document.querySelectorAll('.commentarea .thing.comment.ember-new').length;
        if (fresh) {
            fresh.hidden = count === 0;
            fresh.textContent = `${count} new`;
        }
    };
    window.addEventListener('scroll', () => {
        frame ||= requestAnimationFrame(update);
    }, { passive: true });
    update();
    return { update };
}
