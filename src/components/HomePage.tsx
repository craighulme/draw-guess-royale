'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';

interface HomePageProps {
  userId: string;
  userName: string;
}

export default function HomePage({ userId, userName }: HomePageProps) {
  const createRoom = useMutation(api.rooms.createRoom);
  const joinRoom = useMutation(api.rooms.joinRoom);
  
  const [roomName, setRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [playerName, setPlayerName] = useState(userName);
  const [playerEmail, setPlayerEmail] = useState('');
  const [maxRounds, setMaxRounds] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    setIsCreating(true);
    try {
      const result = await createRoom({
        name: roomName.trim(),
        hostId: userId,
        maxPlayers: maxPlayers,
        maxRounds: maxRounds,
        hostName: playerName.trim(),
        hostEmail: playerEmail.trim() || undefined,
      });

      // Redirect to room
      window.location.href = `/room/${result.roomId}?user=${userId}&name=${encodeURIComponent(playerName)}`;
    } catch (error: any) {
      console.error('Error creating room:', error);
      toast.error('❌ Failed to create room', {
        description: error?.message || 'Please check your details and try again'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !playerName.trim()) return;

    setIsJoining(true);
    try {
      const result = await joinRoom({
        inviteCode: inviteCode.trim().toUpperCase(),
        userId,
        name: playerName.trim(),
        email: playerEmail.trim() || undefined,
      });

      // Redirect to room
      window.location.href = `/room/${result.roomId}?user=${userId}&name=${encodeURIComponent(playerName)}`;
    } catch (error: any) {
      console.error('Error joining room:', error);
      toast.error('❌ Failed to join room', {
        description: error?.message || 'Please check the invite code and try again'
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            🎨 Draw & Guess Royale
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            The ultimate multiplayer drawing battle! Create epic sketches, guess lightning-fast, 
            and dominate the leaderboard in this real-time Pictionary experience.
          </p>
        </div>

        {/* Main Actions */}
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          
          {/* Create Room Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-shadow">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🚀</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Create a Battle</h2>
              <p className="text-gray-600">Host your own drawing tournament and invite friends!</p>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Room Name
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Epic Art Battle ⚔️"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={50}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Artist Supreme"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={30}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={playerEmail}
                  onChange={(e) => setPlayerEmail(e.target.value)}
                  placeholder="artist@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get round results and victory emails! 📧
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Rounds
                  </label>
                  <select
                    value={maxRounds}
                    onChange={(e) => setMaxRounds(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={3}>3 Rounds</option>
                    <option value={5}>5 Rounds</option>
                    <option value={7}>7 Rounds</option>
                    <option value={10}>10 Rounds</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Players
                  </label>
                  <select
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={4}>4 Players</option>
                    <option value={6}>6 Players</option>
                    <option value={8}>8 Players</option>
                    <option value={10}>10 Players</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating || !roomName.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isCreating ? 'Creating Battle...' : '🎨 Create Battle Room'}
              </button>
            </form>
          </div>

          {/* Join Room Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-shadow">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚔️</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Join a Battle</h2>
              <p className="text-gray-600">Enter a room code and join the artistic warfare!</p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Room Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-center text-lg font-mono"
                  maxLength={6}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Sketch Master"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  maxLength={30}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={playerEmail}
                  onChange={(e) => setPlayerEmail(e.target.value)}
                  placeholder="artist@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get round results and victory emails! 📧
                </p>
              </div>

              <button
                type="submit"
                disabled={isJoining || !inviteCode.trim() || !playerName.trim()}
                className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-green-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isJoining ? 'Joining Battle...' : '⚔️ Join the Battle'}
              </button>
            </form>
          </div>
        </div>

        {/* Features */}

        {/* Footer */}
        <div className="text-center mt-16 pb-8">
          <p className="text-gray-500 text-sm">
            🤖 Built with <a href="https://convex.dev" className="text-blue-500 hover:underline">Convex</a> & 
            <a href="https://resend.com" className="text-purple-500 hover:underline ml-1">Resend</a> for the July Hackathon
          </p>
          <p className="text-gray-400 text-xs mt-2">
          Ready, set, sketch! 🎨
          </p>
        </div>
      </div>
    </div>
  );
}