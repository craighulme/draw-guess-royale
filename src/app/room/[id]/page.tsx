'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Id } from '../../../../convex/_generated/dataModel';
import GameRoom from '@/components/GameRoom';

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const roomId = params.id as Id<'rooms'>;
  const userId = searchParams.get('user') || 'user-' + Math.random().toString(36).substring(7);
  const userName = searchParams.get('name') || 'Player';

  if (!roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Room not found</h1>
          <a href="/" className="text-blue-500 hover:underline">
            Return to home
          </a>
        </div>
      </div>
    );
  }

  return <GameRoom roomId={roomId} userId={userId} userName={userName} />;
}