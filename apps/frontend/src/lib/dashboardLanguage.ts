interface PersistDashboardLanguageOptions {
  restaurantId: string;
  nextLanguage: string;
  previousLanguage: string;
  changeLanguage: (language: string) => Promise<unknown>;
  update: (
    restaurantId: string,
    data: { dashboardLanguage: string },
  ) => Promise<unknown>;
  refresh?: () => Promise<unknown> | unknown;
}

export async function persistDashboardLanguage({
  restaurantId,
  nextLanguage,
  previousLanguage,
  changeLanguage,
  update,
  refresh,
}: PersistDashboardLanguageOptions): Promise<void> {
  await changeLanguage(nextLanguage);
  try {
    await update(restaurantId, { dashboardLanguage: nextLanguage });
  } catch (error) {
    await changeLanguage(previousLanguage);
    throw error;
  }

  try {
    await refresh?.();
  } catch {
    // Persistence succeeded. A later context refresh will reconcile the UI;
    // do not roll the language back and falsely report that the save failed.
  }
}
