import {describe, expect, test, vi, type Mock} from 'vitest';

import {Logger, type LogSink} from '../../../src/logging/logger.js';

type LogMethod = (message: string) => void;

function createSink(): {
    debug: Mock<LogMethod>;
    error: Mock<LogMethod>;
    info: Mock<LogMethod>;
    sink: LogSink;
} {
    const debug = vi.fn<LogMethod>();
    const error = vi.fn<LogMethod>();
    const info = vi.fn<LogMethod>();

    return {
        debug,
        error,
        info,
        sink: {debug, error, info, warn: vi.fn<LogMethod>()},
    };
}

describe('Logger', () => {
    test('suppresses debug records when debug logging is disabled', () => {
        const {debug, info, sink} = createSink();
        const logger = new Logger('settings', sink, () => false);

        logger.debug('loaded');
        logger.info('ready');

        expect(debug.mock.calls).toHaveLength(0);
        expect(info.mock.calls).toEqual([['[GIWS:settings] ready']]);
    });

    test('normalizes unknown errors into one contextual record', () => {
        const {error, sink} = createSink();
        const logger = new Logger('extension', sink, () => true);

        logger.error('enable failed', new Error('boom'));

        expect(error.mock.calls).toEqual([['[GIWS:extension] enable failed: Error: boom']]);
    });
});
