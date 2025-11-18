// ESLint configuration for web directory (SvelteKit)
// More permissive rules for API routes that integrate with external code
import tseslint from 'typescript-eslint';

export default tseslint.config({
  rules: {
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/require-await': 'off',
  },
});
