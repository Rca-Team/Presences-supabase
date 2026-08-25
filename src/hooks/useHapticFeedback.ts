import { useCallback } from 'react';

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

interface HapticPatterns {
  [key: string]: number | number[];
}

const hapticPatterns: HapticPatterns = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [30, 50, 30],
  warning: [50, 30, 50, 30],
  error: [100, 50, 100],
  selection: 5,
};

export const useHapticFeedback = () => {
  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  const trigger = useCallback((pattern: HapticPattern = 'light') => {
    if (!isSupported) return false;
    
    try {
      const vibrationPattern = hapticPatterns[pattern] || hapticPatterns.light;
      navigator.vibrate(vibrationPattern);
      return true;
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
      return false;
    }
  }, [isSupported]);

  const triggerCustom = useCallback((pattern: number | number[]) => {
    if (!isSupported) return false;
    
    try {
      navigator.vibrate(pattern);
      return true;
    } catch (error) {
      console.warn('Custom haptic feedback failed:', error);
      return false;
    }
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    navigator.vibrate(0);
  }, [isSupported]);

  // Helper methods for common interactions
  const onButtonPress = useCallback(() => trigger('light'), [trigger]);
  const onSuccess = useCallback(() => trigger('success'), [trigger]);
  const onError = useCallback(() => trigger('error'), [trigger]);
  const onWarning = useCallback(() => trigger('warning'), [trigger]);
  const onSelection = useCallback(() => trigger('selection'), [trigger]);

  return {
    isSupported,
    trigger,
    triggerCustom,
    stop,
    onButtonPress,
    onSuccess,
    onError,
    onWarning,
    onSelection,
  };
};

export default useHapticFeedback;
