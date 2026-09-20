import { useState, useEffect, useCallback } from 'react';
import { appUpdateService, AppUpdateDetails } from '@/services/AppUpdateService';

export function useAppUpdate() {
  const [updateDetails, setUpdateDetails] = useState<AppUpdateDetails | null>(() =>
    appUpdateService.getPendingUpdate()
  );
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    return appUpdateService.subscribe((details) => {
      setUpdateDetails(details);
    });
  }, []);

  const applyUpdate = useCallback(async () => {
    setIsUpdating(true);
    await appUpdateService.applyUpdate();
  }, []);

  const dismissUpdate = useCallback(() => {
    appUpdateService.dismissUpdate();
  }, []);

  const checkForUpdates = useCallback(async () => {
    return await appUpdateService.checkForUpdates();
  }, []);

  const broadcastUpdate = useCallback(
    async (details: { version?: string; title?: string; description?: string; forced?: boolean }) => {
      return await appUpdateService.broadcastAppUpdate(details);
    },
    []
  );

  return {
    hasUpdate: Boolean(updateDetails),
    updateDetails,
    isUpdating,
    applyUpdate,
    dismissUpdate,
    checkForUpdates,
    broadcastUpdate,
  };
}
