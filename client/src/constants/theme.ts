import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF1F4',
    border: '#D9DEE3',
    text: '#111827',
    textSecondary: '#5B6470',
    primary: '#1B5E3B',
    primaryText: '#FFFFFF',
    danger: '#B42318',
    dangerSoft: '#FEE4E2',
    success: '#027A48',
    successSoft: '#D1FADF',
    warning: '#B54708',
    warningSoft: '#FEF0C7',
    info: '#175CD3',
    infoSoft: '#D1E9FF',
    rail: '#FFFFFF',
  },
  dark: {
    background: '#0F1115',
    surface: '#181B21',
    surfaceAlt: '#232730',
    border: '#2F343D',
    text: '#F3F4F6',
    textSecondary: '#A3ABB6',
    primary: '#4CC38A',
    primaryText: '#06281A',
    danger: '#F97066',
    dangerSoft: '#3B1A18',
    success: '#6CE9A6',
    successSoft: '#123524',
    warning: '#FDB022',
    warningSoft: '#3D2A0A',
    info: '#84CAFF',
    infoSoft: '#102A43',
    rail: '#181B21',
  },
} as const;

export type Theme = (typeof Colors)['light'] | (typeof Colors)['dark'];
export type ThemeColor = keyof Theme;

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const Radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const MaxContentWidth = 840;
export const WideBreakpoint = 900;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', mono: 'ui-monospace' },
  web: { sans: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', mono: 'ui-monospace, Menlo, monospace' },
  default: { sans: 'normal', mono: 'monospace' },
});
