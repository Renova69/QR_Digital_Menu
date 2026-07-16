type RegisterServiceWorker = (options: {
  immediate?: boolean;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}) => unknown;

type ServiceWorkerRegistrationLike = {
  unregister: () => boolean | Promise<boolean>;
};

type ServiceWorkerContainerLike = {
  getRegistrations?: () => Promise<readonly ServiceWorkerRegistrationLike[]>;
};

type CacheStorageLike = {
  keys?: () => Promise<string[]>;
  delete?: (cacheName: string) => boolean | Promise<boolean>;
};

const APP_CACHE_NAME_PATTERNS = [
  /^pos-public-menu/,
  /^workbox-/,
  /precache/i,
];

function isAppCacheName(cacheName: string) {
  return APP_CACHE_NAME_PATTERNS.some((pattern) => pattern.test(cacheName));
}

async function unregisterDevelopmentServiceWorkers(
  serviceWorker: ServiceWorkerContainerLike,
) {
  const registrations = await serviceWorker.getRegistrations?.();
  if (!registrations?.length) return;
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function clearDevelopmentAppCaches(caches: CacheStorageLike | undefined) {
  const cacheNames = await caches?.keys?.();
  if (!cacheNames?.length || !caches?.delete) return;
  await Promise.all(
    cacheNames
      .filter(isAppCacheName)
      .map((cacheName) => caches.delete!(cacheName)),
  );
}

export async function configureServiceWorker({
  serviceWorker,
  caches,
  isProduction,
  register,
  logger = console,
}: {
  serviceWorker?: ServiceWorkerContainerLike;
  caches?: CacheStorageLike;
  isProduction: boolean;
  register: RegisterServiceWorker;
  logger?: Pick<Console, "log" | "error">;
}) {
  if (!serviceWorker) return;

  if (isProduction) {
    register({
      immediate: true,
      onRegistered(registration) {
        logger.log("SW Registered:", registration);
      },
      onRegisterError(error) {
        logger.error("SW registration error", error);
      },
    });
    return;
  }

  try {
    await Promise.all([
      unregisterDevelopmentServiceWorkers(serviceWorker),
      clearDevelopmentAppCaches(caches),
    ]);
  } catch (error) {
    logger.error("SW development cleanup error", error);
  }
}
