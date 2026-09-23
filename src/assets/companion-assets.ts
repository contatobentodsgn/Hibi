const companionAssetUrl = (path: string) => `/companion-assets/${path}` as const;

export type CompanionAsset = { readonly kind: 'image'; readonly url: string; readonly id: string; readonly label: string };

const image = (path: string, id: string, label: string): CompanionAsset => ({
  kind: 'image', url: companionAssetUrl(path), id, label,
});

export const companionAssets = {
  icons: {
    icon: image('icons/icon.ico', 'icons.icon', 'Pixano Icon'),
    iconMac: image('icons/icon.icns', 'icons.iconMac', 'Pixano Mac Icon'),
    catFaviconFace: image('icons/pixano-cat-face.svg', 'icons.catFaviconFace', 'Cat Favicon'),
    catFaviconFull: image('icons/pixano-cat-full.svg', 'icons.catFaviconFull', 'Cat App Icon'),
    catMarkApp: image('icons/pixano-cat-mark.svg', 'icons.catMarkApp', 'Cat Mark'),
    trayIcon: image('icons/tray-icon.png', 'icons.trayIcon', 'Tray Icon'),
    trayTemplate: image('icons/tray-template.png', 'icons.trayTemplate', 'Tray Template'),
    trayTemplate22: image('icons/tray-template-22.png', 'icons.trayTemplate22', 'Tray Template 22'),
    trayTemplate2x: image('icons/tray-template@2x.png', 'icons.trayTemplate2x', 'Tray Template 2x'),
    trayTemplate3x: image('icons/tray-template@3x.png', 'icons.trayTemplate3x', 'Tray Template 3x'),
    trayTemplatePreview: image('icons/tray-template-preview.png', 'icons.trayTemplatePreview', 'Tray Template Preview'),
    trayTemplateSvg: image('icons/tray-template.svg', 'icons.trayTemplateSvg', 'Tray Template SVG'),
  },
  updates: {
    homeTintBlue: image('updates/0.1.7/home-tint-blue.png', 'updates.homeTintBlue', 'Home Tint Blue'),
    homeTintDefault: image('updates/0.1.7/home-tint-default.png', 'updates.homeTintDefault', 'Home Tint Default'),
    homeTintGrey: image('updates/0.1.7/home-tint-grey.png', 'updates.homeTintGrey', 'Home Tint Grey'),
    homeTintLavender: image('updates/0.1.7/home-tint-lavender.png', 'updates.homeTintLavender', 'Home Tint Lavender'),
    homeTintRose: image('updates/0.1.7/home-tint-rose.png', 'updates.homeTintRose', 'Home Tint Rose'),
    homeTintSage: image('updates/0.1.7/home-tint-sage.png', 'updates.homeTintSage', 'Home Tint Sage'),
    homeTintWarm: image('updates/0.1.7/home-tint-warm.png', 'updates.homeTintWarm', 'Home Tint Warm'),
    reportIssue: image('updates/0.2.1/report-issue.gif', 'updates.reportIssue', 'Report Issue'),
  },
} as const;

export const companionAssetList = [
  ...Object.values(companionAssets.icons),
  ...Object.values(companionAssets.updates),
] satisfies readonly CompanionAsset[];
