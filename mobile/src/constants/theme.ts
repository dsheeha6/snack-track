/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Brand tokens from PRODUCT.md / ../calorie-tracker/index.html. Full hand-drawn
// treatment (wobble borders, offset shadows) is deferred — see PRODUCT.md's
// porting note — this is just the color/type swap so the app isn't template-blue.
export const Brand = {
  cream: '#FFF3D6',
  paper: '#FFFCF2',
  ink: '#1E1B16',
  green: '#12A150',
  lime: '#C9E870',
  yellow: '#FFC53D',
  coral: '#FF6B4A',
  pink: '#FF9EC4',
  teal: '#2BB5AF',
  blue: '#4C7DFF',
  purple: '#9B6BFF',
  clay: '#E8663C',
} as const;

export const Colors = {
  light: {
    text: Brand.ink,
    background: Brand.cream,
    backgroundElement: Brand.paper,
    backgroundSelected: '#F5EFD9',
    textSecondary: '#6B6558',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
