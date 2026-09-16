import {describe, expect, test, vi} from 'vitest';

import {DisposableStack} from '../../../src/lifecycle/disposables.js';

describe('DisposableStack', () => {
    test('disposes resources once in reverse registration order', () => {
        const calls: string[] = [];
        const stack = new DisposableStack();

        stack.defer(() => {
            calls.push('first');
        });
        stack.defer(() => {
            calls.push('second');
        });

        stack.dispose();
        stack.dispose();

        expect(calls).toEqual(['second', 'first']);
    });

    test('continues disposing after a cleanup fails', () => {
        const cleanup = vi.fn();
        const stack = new DisposableStack();

        stack.defer(() => {
            cleanup();
        });
        stack.defer(() => {
            throw new Error('cleanup failed');
        });

        expect(() => {
            stack.dispose();
        }).toThrow(AggregateError);
        expect(cleanup).toHaveBeenCalledOnce();
    });
});
