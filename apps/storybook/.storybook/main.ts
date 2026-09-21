import type { StorybookConfig } from '@storybook/nextjs-vite';
import { transformAsync } from '@babel/core';
import { normalizePath, type Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const storybookDir = dirname(fileURLToPath(import.meta.url));
const compatShim = (name: string) => resolve(storybookDir, 'shims', `es-toolkit-compat-${name}.ts`);
const timelineAppDir = resolve(storybookDir, '../../timeline-gstudio001');
const uiPackageDir = resolve(storybookDir, '../../../packages/ui');

/**
 * THE REACT COMPILER, for the source that is written to depend on it.
 *
 * `@storyboard/ui/film-strip` carries no `useMemo`/`useCallback`: media-monster
 * runs the compiler (`reactCompiler` in its next.config.ts) and it memoizes the
 * component instead. Rendered here WITHOUT it, every callback would be new on
 * every render and the effects keyed on them would re-run — one of them cancels
 * a fling in flight. So Storybook compiles the same directories the app relies
 * on the compiler for, and nothing else: the rest of the package was written
 * with manual memo and is left exactly as it builds today.
 */
const REACT_COMPILED_DIRS = [resolve(uiPackageDir, 'film-strip')].map(normalizePath);

function reactCompilerFor(dirs: readonly string[]): Plugin {
  return {
    name: 'storyboard:react-compiler-scoped',
    enforce: 'pre',
    async transform(code, id) {
      const file = normalizePath(id.split('?')[0] ?? '');
      if (!/\.[jt]sx?$/.test(file) || !dirs.some(dir => file.startsWith(`${dir}/`))) return null;
      // Syntax plugins only, so TypeScript and JSX come out as they went in and
      // the framework's own pipeline still strips types and compiles JSX.
      const result = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [['babel-plugin-react-compiler', {}]],
        sourceMaps: true,
      });
      if (result?.code == null) return null;
      // THE RUNTIME COMES FROM `react` ITSELF. Compiled code imports
      // `react/compiler-runtime`, and this framework points `react` at Next's
      // bundled copy without handling that subpath (in tests its prefix alias
      // rewrites it to a path inside `index.js`). React 19 exports the same
      // `c` as `__COMPILER_RUNTIME.c`, and `react` resolves to the right copy
      // in dev and in tests alike — so the cache hook can never run against a
      // second React.
      const compiled = result.code.replace(
        /import \{ c as (\w+) \} from "react\/compiler-runtime";/,
        (_, name: string) =>
          `import { __COMPILER_RUNTIME as __storyboardCompilerRuntime } from "react";\nconst ${name} = __storyboardCompilerRuntime.c;`,
      );
      return { code: compiled, map: result.map };
    },
  };
}

const config: StorybookConfig = {
  stories: [
    '../../../packages/ui/**/*.stories.@(ts|tsx)',
    '../../../packages/timeline-widget/src/**/*.stories.@(ts|tsx)',
    '../../timeline-gstudio001/components/**/*.stories.@(ts|tsx)',
    '../../../packages/nested-collections/react/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-mcp'],
  framework: {
    name: '@storybook/nextjs-vite',
  },
  viteFinal: async config => ({
    ...config,
    plugins: [reactCompilerFor(REACT_COMPILED_DIRS), ...(config.plugins ?? [])],
    resolve: {
      ...config.resolve,
      alias: [
        ...(Array.isArray(config.resolve?.alias) ? config.resolve.alias : []),
        {
          find: /^@\/components\/(assets|auth|core|timeline)\/(.*)$/,
          replacement: `${timelineAppDir}/components/$1/$2`,
        },
        {
          find: /^@\/lib\/(timeline-documents|timeline-media-client)$/,
          replacement: `${timelineAppDir}/lib/$1`,
        },
        {
          find: /^@\/core\/(.*)$/,
          replacement: `${uiPackageDir}/core/$1`,
        },
        {
          find: /^@\/lib\/utils$/,
          replacement: `${uiPackageDir}/lib/utils`,
        },
        { find: '@gstudio', replacement: resolve(storybookDir, '../../timeline-gstudio001') },
        { find: 'es-toolkit/compat/get', replacement: compatShim('get') },
        { find: 'es-toolkit/compat/isPlainObject', replacement: compatShim('isPlainObject') },
        { find: 'es-toolkit/compat/last', replacement: compatShim('last') },
        { find: 'es-toolkit/compat/maxBy', replacement: compatShim('maxBy') },
        { find: 'es-toolkit/compat/minBy', replacement: compatShim('minBy') },
        { find: 'es-toolkit/compat/omit', replacement: compatShim('omit') },
        { find: 'es-toolkit/compat/range', replacement: compatShim('range') },
        { find: 'es-toolkit/compat/sortBy', replacement: compatShim('sortBy') },
        { find: 'es-toolkit/compat/sumBy', replacement: compatShim('sumBy') },
        { find: 'es-toolkit/compat/throttle', replacement: compatShim('throttle') },
        { find: 'es-toolkit/compat/uniqBy', replacement: compatShim('uniqBy') },
        ...(config.resolve?.alias && !Array.isArray(config.resolve.alias)
          ? Object.entries(config.resolve.alias).map(([find, replacement]) => ({ find, replacement }))
          : []),
      ],
    },
    optimizeDeps: {
      ...config.optimizeDeps,
      include: Array.from(new Set([...(config.optimizeDeps?.include ?? []), 'recharts'])),
    },
  }),
};

export default config;
