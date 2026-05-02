'use client';
import * as React from 'react';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';

export function Providers({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      {children}
    </FluentProvider>
  );
}
