import React, { useEffect } from 'react';
import { useEngineStore } from '@/store/engine-store';

export function Layout({ children }: { children: React.ReactNode }) {
  const { playerId, setPlayerId } = useEngineStore();

  useEffect(() => {
    if (!playerId) {
      const newId = 'player-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      setPlayerId(newId);
    }
  }, []);

  return <>{children}</>;
}
