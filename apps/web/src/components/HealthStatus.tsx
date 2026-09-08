import { useEffect, useState } from 'react';
import { API_ROUTES } from '@jarvis/shared';
import type { HealthCheckResponse } from '@jarvis/types';

export function HealthStatus() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_ROUTES.HEALTH)
      .then((res) => res.json())
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  return (
    <section>
      {error && <p>Backend unreachable: {error}</p>}
      {!error && !health && <p>Checking backend…</p>}
      {health && (
        <ul>
          <li>API status: {health.status}</li>
          <li>Database: {health.database}</li>
          <li>Uptime: {health.uptime.toFixed(1)}s</li>
        </ul>
      )}
    </section>
  );
}
