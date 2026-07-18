type BrowserStorageName = "localStorage" | "sessionStorage";

export interface SafeBrowserStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => boolean;
  removeItem: (key: string) => boolean;
}

function createSafeBrowserStorage(
  storageName: BrowserStorageName,
): SafeBrowserStorage {
  const getStorage = (): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
      return window[storageName];
    } catch {
      return null;
    }
  };

  return {
    getItem(key) {
      try {
        return getStorage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        const storage = getStorage();
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    removeItem(key) {
      try {
        const storage = getStorage();
        if (!storage) return false;
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const safeLocalStorage = createSafeBrowserStorage("localStorage");
