import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { resolveTheme, themePreference } from './theme.ts';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const startupScript = html.match(/<script id="theme-init">([\s\S]*?)<\/script>/)[1];

test('first paint agrees with the app for saved, system, and invalid theme choices', () => {
  for (const saved of [null, 'light', 'dark', 'system', 'invalid']) {
    for (const systemDark of [false, true]) {
      const root = { dataset: {}, style: {} };
      const meta = {};
      vm.runInNewContext(startupScript, {
        localStorage: { getItem: () => saved },
        matchMedia: () => ({ matches: systemDark }),
        document: { documentElement: root, querySelector: () => ({ setAttribute: (name, value) => { meta[name] = value; } }) },
      });
      const expected = resolveTheme(themePreference(saved), systemDark);
      assert.equal(root.dataset.theme, expected);
      assert.equal(root.style.colorScheme, expected);
      assert.equal(meta.content, expected === 'dark' ? '#121b17' : '#f8f9f6');
    }
  }
});

test('blocked storage still paints the device theme without preventing app startup', () => {
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(startupScript, {
    get localStorage() { throw new Error('Storage blocked'); },
    matchMedia: () => ({ matches: true }),
    document: { documentElement: root, querySelector: () => ({ setAttribute() {} }) },
  });
  assert.equal(root.dataset.theme, 'dark');
});
