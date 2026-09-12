export type Dispose = () => void;

export class DisposableStack {
    readonly #disposers: Dispose[] = [];
    #disposed = false;

    defer(dispose: Dispose): void {
        if (this.#disposed) {
            throw new Error('Cannot register a resource on a disposed stack');
        }

        this.#disposers.push(dispose);
    }

    dispose(): void {
        if (this.#disposed) {
            return;
        }

        this.#disposed = true;
        const errors: unknown[] = [];

        for (const dispose of this.#disposers.reverse()) {
            try {
                dispose();
            } catch (error) {
                errors.push(error);
            }
        }

        this.#disposers.length = 0;

        if (errors.length > 0) {
            throw new AggregateError(errors, 'Failed to dispose one or more resources');
        }
    }
}
