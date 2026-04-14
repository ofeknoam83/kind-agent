import { useState, useEffect, useCallback } from 'react';
import type { ConnectionState } from '../../shared/types';
import { useApi } from './use-api';

/**
 * Manages WhatsApp connection state.
 * Subscribes to push events from main process.
 */
export function useConnection() {
  const api = useApi();
  const [state, setState] = useState<ConnectionState>({ status: 'disconnected' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch initial state
    api.whatsapp.getState().then(setState);

    // Subscribe to state changes
    const unsub = api.whatsapp.onStateChanged(setState);
    return unsub;
  }, [api]);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.whatsapp.connect();
      if (result.error) {
        setState({ status: 'error', message: result.error });
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  const disconnect = useCallback(async () => {
    await api.whatsapp.disconnect();
  }, [api]);

  const logout = useCallback(async () => {
    await api.whatsapp.logout();
  }, [api]);

  return { state, connect, disconnect, logout, loading };
}
