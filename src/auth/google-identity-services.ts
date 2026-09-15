const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdConfiguration {
  client_id: string;
  nonce: string;
  callback: (response: { credential: string }) => void;
  ux_mode?: "popup";
}

interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; width?: number; text?: string },
  ): void;
  prompt(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let loadPromise: Promise<GoogleAccountsId> | null = null;

/**
 * Loads the Google Identity Services script at most once per page load and
 * resolves with its `accounts.id` API. Never loaded on any page but the
 * login screen.
 */
export function loadGoogleIdentityServices(): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id)
    return Promise.resolve(window.google.accounts.id);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error("Google Identity Services did not initialize."));
    };
    script.onerror = () =>
      reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export type { GoogleAccountsId };
