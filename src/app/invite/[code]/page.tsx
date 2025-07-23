'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';

export default function InvitePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const joinRoom = useMutation(api.rooms.joinRoom);
  const markInviteAsJoined = useMutation(api.rooms.markInviteAsJoined);
  
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const inviteCode = params.code as string;
  const email = searchParams.get('email') || '';

  const generateUserId = () => `user-${Math.random().toString(36).substring(2)}`;

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    setIsJoining(true);
    setError('');
    
    try {
      const userId = generateUserId();
      const result = await joinRoom({
        inviteCode: inviteCode.toUpperCase(),
        userId,
        name: playerName.trim(),
        email: email || undefined,
      });

      // Mark invite as joined if email was provided
      if (email) {
        await markInviteAsJoined({
          email: email,
          inviteCode: inviteCode.toUpperCase(),
          playerName: playerName.trim(),
        });
      }

      // Redirect to room
      window.location.href = `/room/${result.roomId}?user=${userId}&name=${encodeURIComponent(playerName.trim())}`;
    } catch (error: any) {
      console.error('Error joining room:', error);
      setError(error.message || 'Failed to join room. Please check the invite link.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            🎨 Join the Battle!
          </h1>
          <p className="text-gray-600">You've been invited to join a Draw & Guess Royale game!</p>
        </div>

        <div className="bg-gradient-to-r from-purple-100 to-blue-100 p-4 rounded-lg mb-6">
          <div className="text-center">
            <p className="text-sm text-gray-700 mb-2">Room Code</p>
            <p className="text-2xl font-bold text-purple-800 font-mono">{inviteCode}</p>
          </div>
          {email && (
            <div className="text-center mt-3 pt-3 border-t border-purple-200">
              <p className="text-sm text-gray-700 mb-1">Invited Email</p>
              <p className="text-sm text-purple-700 font-medium">{email}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleJoinRoom} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your artistic name..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
              maxLength={30}
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isJoining || !playerName.trim()}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
          >
            {isJoining ? 'Joining Battle...' : '🎨 Join the Art Battle!'}
          </button>
        </form>

        <div className="text-center mt-6">
          <a 
            href="/"
            className="text-purple-600 hover:text-purple-800 text-sm font-medium"
          >
            ← Back to Home
          </a>
        </div>

        <div className="text-center mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            🎨 Ready to showcase your artistic skills? Let's see what you can create!
          </p>
        </div>
      </div>
    </div>
  );
}