function readOptionalNonEmpty(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    // Treat a defined-but-blank value (an env var left empty in the hosting
    // dashboard) as "not provided". Vite inlines these at build time, so
    // throwing here runs during module evaluation on every page load and
    // blanks the screen before React can mount.
    console.warn(`${name} is defined but empty; treating it as not set.`);
    return undefined;
  }

  return normalizedValue;
}

export const environment = Object.freeze({
  appName:
    readOptionalNonEmpty(import.meta.env.VITE_APP_NAME, "VITE_APP_NAME") ??
    "Hotech Globe Tracker",
});
