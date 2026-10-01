import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts', 'examples/*/tests/**/*.test.ts'] } });
