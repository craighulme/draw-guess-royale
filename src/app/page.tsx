'use client';

import HomePage from '@/components/HomePage';

export default function Home() {
  // In a real app, you'd get this from authentication
  const userId = 'user-' + Math.random().toString(36).substring(7);
  const userName = 'Player';

  return <HomePage userId={userId} userName={userName} />;
}
