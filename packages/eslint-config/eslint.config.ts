/**
 * ESLint configuration for the eslint-config package itself
 */
import antfu from '@antfu/eslint-config';

export default antfu({
  ignores: ['node_modules/**'],
  stylistic: {
    semi: true,
  },
  typescript: true,
});
