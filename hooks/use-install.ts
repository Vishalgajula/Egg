import { useEffect, useState } from 'react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Chrome fires `beforeinstallprompt` once, and only when the page qualifies as
 * installable. The event has to be captured and kept, because it can only be
 * shown later from a real user gesture.
 */
export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => {
    try {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        // iOS reports installation on navigator, not through the media query.
        (navigator as { standalone?: boolean }).standalone === true
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    /** Only true once the browser has offered, so the button never misleads. */
    canInstall: Boolean(prompt) && !installed,
    installed,
    async install() {
      if (!prompt) return false;
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // The event is single-use, whatever the answer.
      setPrompt(null);
      return outcome === 'accepted';
    },
  };
}
