'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { toast } from 'sonner';

export default function JoinPage() {
  const params = useParams();
  const joinRoom = useMutation(api.rooms.joinRoom);
  
  const inviteCode = (params.code as string)?.toUpperCase() || '';
  const [playerName, setPlayerName] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    setIsJoining(true);
    try {
      const userId = 'user-' + Math.random().toString(36).substring(7);
      
      const result = await joinRoom({
        inviteCode,
        userId,
        name: playerName.trim(),
        email: playerEmail.trim() || undefined,
      });

      // Redirect to room
      window.location.href = `/room/${result.roomId}?user=${userId}&name=${encodeURIComponent(playerName)}`;
    } catch (error: any) {
      console.error('Error joining room:', error);
      toast.error('❌ Failed to join room', {
        description: error?.message || 'Please check the room code and try again'
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎨 Join the Battle!</h1>
          <p className="text-gray-600">You're invited to join room:</p>
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <span className="text-2xl font-mono font-bold text-blue-600">{inviteCode}</span>
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your artist name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={30}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email (optional)
            </label>
            <input
              type="email"
              value={playerEmail}
              onChange={(e) => setPlayerEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Get round results and victory emails! 📧
            </p>
          </div>

          <button
            type="submit"
            disabled={isJoining || !playerName.trim()}
            className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-green-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isJoining ? 'Joining...' : '🚀 Join the Battle!'}
          </button>
        </form>

        <div className="text-center mt-6">
          <a href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}