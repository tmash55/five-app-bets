import { useAuth } from '@five/shell';
import { useEffect, useState } from 'react';

import { fetchIsAdmin } from './api';

/** True when the signed-in user is in the admins table. False while loading. */
export function useIsAdmin(): boolean {
  const { client, session } = useAuth();
  const userId = session?.user.id;
  const [result, setResult] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    if (!client || !userId) return;
    let active = true;
    fetchIsAdmin(client)
      .catch(() => false)
      .then((isAdmin) => {
        if (active) setResult({ userId, isAdmin });
      });
    return () => {
      active = false;
    };
  }, [client, userId]);

  return Boolean(userId && result?.userId === userId && result.isAdmin);
}
