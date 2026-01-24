import path from 'node:path';

import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind';

// Remotion runs from apps/web, so paths are relative to that
const webRoot = process.cwd();
const remotionDir = path.join(webRoot, 'src', 'remotion');
const srcDir = path.join(webRoot, 'src');

Config.setEntryPoint(path.join(remotionDir, 'index.ts'));

Config.overrideWebpackConfig((config) => {
  return enableTailwind({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@': srcDir,
      },
    },
  });
});
