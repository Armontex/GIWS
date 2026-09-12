export interface LogSink {
    debug(message: string): void;
    error(message: string): void;
    info(message: string): void;
    warn(message: string): void;
}

export class Logger {
    readonly #component: string;
    readonly #sink: LogSink;
    readonly #isDebugEnabled: () => boolean;

    constructor(
        component: string,
        sink: LogSink = console,
        isDebugEnabled: () => boolean = () => false
    ) {
        this.#component = component;
        this.#sink = sink;
        this.#isDebugEnabled = isDebugEnabled;
    }

    debug(message: string): void {
        if (this.#isDebugEnabled()) {
            this.#sink.debug(this.#format(message));
        }
    }

    info(message: string): void {
        this.#sink.info(this.#format(message));
    }

    warn(message: string): void {
        this.#sink.warn(this.#format(message));
    }

    error(message: string, cause?: unknown): void {
        const suffix = cause === undefined ? '' : `: ${normalizeError(cause)}`;
        this.#sink.error(this.#format(`${message}${suffix}`));
    }

    #format(message: string): string {
        return `[GIWS:${this.#component}] ${message}`;
    }
}

function normalizeError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }

    return String(error);
}
