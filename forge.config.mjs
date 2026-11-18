import path from 'node:path';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { makeDmg } from './desktop/make-dmg.mjs';

export default {
  packagerConfig: {
    name: 'Primeboard', executableName: 'Primeboard', appBundleId: 'com.jacksonwalters.primeboard',
    appCategoryType: 'public.app-category.music', asar: true,
    icon: path.resolve('desktop/assets/icon'),
    // A small explicit allowlist prevents including sources, credentials, or model tooling.
    ignore: file => file !== '' && !/^\/(web|desktop|node_modules)(\/|$)/.test(file)
      && !/^\/(package\.json|LICENSE)$/.test(file),
    win32metadata: { CompanyName: 'Jackson Walters', FileDescription: 'Primeboard', ProductName: 'Primeboard' },
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32', 'linux'] },
    { name: '@electron-forge/maker-squirrel', config: { name: 'primeboard', authors: 'Jackson Walters',
      setupIcon: path.resolve('desktop/assets/icon.ico'), noMsi: true } },
    { name: '@electron-forge/maker-deb', config: { options: {
      name: 'primeboard', productName: 'Primeboard', genericName: 'Mathematical musical instrument',
      icon: path.resolve('desktop/assets/icon.png'), categories: ['AudioVideo', 'Music', 'Education'],
      maintainer: 'Jackson Walters', homepage: 'https://primeboard.jacksonwalters.com',
    } } },
    { name: '@electron-forge/maker-rpm', config: { options: {
      name: 'primeboard', productName: 'Primeboard', icon: path.resolve('desktop/assets/icon.png'),
      categories: ['AudioVideo', 'Music', 'Education'], homepage: 'https://primeboard.jacksonwalters.com',
    } } },
  ],
  plugins: [new FusesPlugin({ version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  })],
  hooks: {
    generateAssets: async () => { await import('./scripts/desktop-icons.mjs'); },
    postMake: async (_config, results) => {
      for (const result of results) if (result.platform === 'darwin') result.artifacts.push(await makeDmg(result));
      return results;
    },
  },
};
