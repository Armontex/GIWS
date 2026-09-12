import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['**/.git/**', '**/.worktrees/**', '**/node_modules/**'],
    },
});
