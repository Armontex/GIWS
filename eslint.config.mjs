import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typeChecked = [
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
].map(config => ({
    ...config,
    files: ['**/*.ts'],
}));

export default tseslint.config(
    {
        ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
    },
    {
        ...js.configs.recommended,
        files: ['**/*.{js,mjs}'],
        languageOptions: {
            globals: globals.node,
        },
    },
    ...typeChecked,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': ['error', {prefer: 'type-imports'}],
            '@typescript-eslint/no-import-type-side-effects': 'error',
        },
    }
);
