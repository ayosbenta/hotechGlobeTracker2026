function readOptionalNonEmpty(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${name} must not be empty when it is defined.`);
  }

  return normalizedValue;
}

export const environment = Object.freeze({
  appName:
    readOptionalNonEmpty(import.meta.env.VITE_APP_NAME, "VITE_APP_NAME") ??
    "Hotech Globe Tracker",
  googleClientId: readOptionalNonEmpty(
    import.meta.env.VITE_GOOGLE_CLIENT_ID,
    "VITE_GOOGLE_CLIENT_ID",
  ),
});
