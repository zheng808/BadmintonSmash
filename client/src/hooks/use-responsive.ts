import { Platform, useWindowDimensions } from 'react-native';

import { WideBreakpoint } from '@/constants/theme';

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= WideBreakpoint;
  return { width, isWide };
}
