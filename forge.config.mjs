import path from 'node:path';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

export default {
  packagerConfig: {
    name: 'Primeboard', executableName: 'Primeboard', appBundleId: 'com.jacksonwalters.primeboard',
    appCategoryType: 'public.app-category.music', asar: true,
    // Sign the finished bundle, after names, plists, fuses, and ASAR integrity change.
    // This local integrity signature is not a Developer ID / notarized release.
    osxSign: { identity: '-', identityValidation: false,
      preAutoEntitlements: false, preEmbedProvisioningProfile: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
    },
    icon: path.resolve('desktop/assets/icon'),
    // A small explicit allowlist prevents including sources, credentials, or model tooling.
    ignore: file => file !== '' && !/^\/(web|desktop|node_modules)(\/|$)/.test(file)
      && !/^\/(package\.json|LICENSE)$/.test(file),
    win32metadata: { CompanyName: 'Jackson Walters', FileDescription: 'Primeboard', ProductName: 'Primeboard' },
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['linux'] },
    { name: '@electron-forge/maker-deb', config: { options: {
      name: 'primeboard', productName: 'Primeboard', bin: 'Primeboard', genericName: 'Mathematical musical instrument',
      icon: path.resolve('desktop/assets/icon.png'), categories: ['AudioVideo', 'Music', 'Education'],
      maintainer: 'Jackson Walters', homepage: 'https://primeboard.jacksonwalters.com',
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
    generateAssets: async () => {
      await import('./scripts/app-version.mjs');
      await import('./scripts/desktop-icons.mjs');
    },
  },
};
