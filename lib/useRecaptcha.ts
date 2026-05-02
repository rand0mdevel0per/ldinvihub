'use client';
import * as React from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SCRIPT_ID = 'recaptcha-v3-script';

function loadScript(siteKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.grecaptcha) return resolve();
    if (document.getElementById(SCRIPT_ID)) return resolve();

    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load reCAPTCHA'));
    document.head.appendChild(s);
  });
}

/**
 * 加载 reCAPTCHA v3 invisible，并暴露 execute(action) 方法。
 * 当 siteKey 为空时，execute 直接返回 null（前端跳过）。
 */
export function useRecaptcha(siteKey: string | null) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!siteKey) return;
    loadScript(siteKey)
      .then(() => {
        if (window.grecaptcha) {
          window.grecaptcha.ready(() => setReady(true));
        }
      })
      .catch(() => setReady(false));
  }, [siteKey]);

  const execute = React.useCallback(
    async (action: string): Promise<string | null> => {
      if (!siteKey) return null;
      if (!window.grecaptcha) return null;
      try {
        return await window.grecaptcha.execute(siteKey, { action });
      } catch {
        return null;
      }
    },
    [siteKey],
  );

  return { ready, execute };
}
