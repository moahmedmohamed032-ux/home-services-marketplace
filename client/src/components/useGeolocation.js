import { useState, useRef } from 'react';

// Wraps the browser geolocation API: returns [locate, loading, error].
export default function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const last = useRef(null);
  const locate = (onSuccess) => {
    last.current = onSuccess;
    if (!navigator.geolocation) { setError(true); return; }
    setLoading(true); setError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLoading(false); onSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { setLoading(false); setError(true); },
      { timeout: 10000 }
    );
  };
  const retry = () => { if (last.current) locate(last.current); };
  return [locate, loading, error, retry];
}
