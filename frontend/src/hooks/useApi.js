import { useState, useCallback, useEffect, useRef } from 'react';

export function useApi(apiFn, options = {}) {
  const { immediate = false, args = [], onSuccess, onError } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (...callArgs) => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiFn(...callArgs);
      if (mountedRef.current) {
        setData(result);
        onSuccess?.(result);
      }
      return result;
    } catch (err) {
      const message = err.message || 'An error occurred';
      if (mountedRef.current) {
        setError(message);
        onError?.(message);
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [apiFn, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (immediate && args.length > 0) {
      execute(...args).catch(() => {});
    }
  }, [immediate]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    error,
    execute,
    reset,
    setData,
  };
}

export function usePolling(apiFn, interval = 5000, args = [], enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const result = await apiFn(...args);
        if (!cancelled) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchData();
    const id = setInterval(fetchData, interval);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiFn, interval, enabled, ...args]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}

export default useApi;
