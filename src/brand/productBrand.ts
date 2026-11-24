export interface ReportBrand {
  name: string;
  title: string;
  footer: string;
  exportPrefix: string;
  mobileAlbum: string;
  mobileHeaderTitle: string;
  diagnosticsTitle: string;
}

export interface ProductBrand {
  id: 'stronghold' | 'telemetry';
  mode: 'full' | 'telemetry';
  name: string;
  shortName: string;
  codename: string;
  windowTitle: string;
  faviconFile: string;
  defaultAlwaysOnTop: boolean;
  reportBrand: ReportBrand;
}

declare const __PRODUCT_BRAND__: ProductBrand | undefined;

export const STRONGHOLD_REPORT_BRAND: ReportBrand = {
  name: 'PRTS',
  title: 'PRTS 局内战报',
  footer: 'PRTS Stronghold · 卫戍协议战术终端',
  exportPrefix: 'PRTS战报',
  mobileAlbum: 'PRTS',
  mobileHeaderTitle: '战报终端',
  diagnosticsTitle: 'PRTS · 战报诊断',
};

export const TELEMETRY_REPORT_BRAND: ReportBrand = {
  name: '卫戍战报仪',
  title: '卫戍战报仪 · Stronghold Telemetry',
  footer: '卫戍战报仪 · Stronghold Telemetry',
  exportPrefix: '卫戍战报仪',
  mobileAlbum: '卫戍战报仪',
  mobileHeaderTitle: '卫戍战报仪 · Stronghold Telemetry',
  diagnosticsTitle: '卫戍战报仪 · 战报诊断',
};

const DEFAULT_PRODUCT_BRAND: ProductBrand = {
  id: 'stronghold',
  mode: 'full',
  name: 'PRTS Stronghold',
  shortName: 'PRTS',
  codename: 'PRTS Stronghold',
  windowTitle: '卫戍协议战术终端 · PRTS Stronghold',
  faviconFile: 'app-icon.svg',
  defaultAlwaysOnTop: false,
  reportBrand: STRONGHOLD_REPORT_BRAND,
};

export const PRODUCT_BRAND: ProductBrand =
  typeof __PRODUCT_BRAND__ !== 'undefined' ? __PRODUCT_BRAND__ : DEFAULT_PRODUCT_BRAND;

export const REPORT_BRAND: ReportBrand = PRODUCT_BRAND.reportBrand;
