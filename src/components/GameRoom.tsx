'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useState, useEffect } from 'react';
import DrawingCanvas from './DrawingCanvas';
import { toast } from 'sonner';

interface GameRoomProps {
  roomId: Id<'rooms'>;
  userId: string;
  userName: string;
}

export default function GameRoom({ roomId, userId, userName }: GameRoomProps) {
  const roomState = useQuery(api.rooms.getRoomState, { roomId });
  const strokes = useQuery(api.game.getStrokes, { roomId });
  const invites = useQuery(api.rooms.getRoomInvites, { roomId });
  const newRoomQuery = useQuery(api.rooms.findNewRoomForPlayer, 
    roomState?.room?.status === 'restarted' && roomState?.room?.hostId !== userId ? 
    { userId, oldHostId: roomState.room.hostId } : 
    "skip"
  );
  const submitStroke = useMutation(api.game.submitStroke);
  const undoLastStroke = useMutation(api.game.undoLastStroke);
  const clearCanvas = useMutation(api.game.clearCanvas);
  const submitGuess = useMutation(api.game.submitGuess);
  const nextRound = useMutation(api.game.nextRound);
  const startGame = useMutation(api.rooms.startGame);
  const hostRestartGame = useMutation(api.game.hostRestartGame);
  const hostEndGame = useMutation(api.game.hostEndGame);
  const sendInvite = useMutation(api.rooms.sendGameInvite);
  const removePlayer = useMutation(api.rooms.removePlayer);
  const leaveRoom = useMutation(api.rooms.leaveRoom);
  const saveCanvasImage = useMutation(api.game.saveCanvasImage);
  const finalizeCanvasImage = useMutation(api.game.finalizeCanvasImage);
  const triggerCanvasSaveForArtist = useMutation(api.game.triggerCanvasSaveForArtist);
  
  const [guess, setGuess] = useState('');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [shouldSaveCanvas, setShouldSaveCanvas] = useState(false);
  const [previousRound, setPreviousRound] = useState<number>(0);

  const isArtist = roomState?.room.currentArtist === userId;
  const isHost = roomState?.room.hostId === userId;
  const hasCorrectGuess = roomState?.currentRoundGuesses?.some((g: any) => g.isCorrect) || false;

  useEffect(() => {
    if (roomState?.currentRoundGuesses) {
      setGuesses(roomState.currentRoundGuesses.map((g: any) => 
        `${g.playerName}: ${g.guess} ${g.isCorrect ? '✓' : ''}`
      ));
    }
  }, [roomState?.currentRoundGuesses]);

  // Disabled auto-save - now relying on server-side image generation from stroke data
  // useEffect(() => {
  //   if (isArtist && roomState?.room.status === 'playing') {
  //     // Save canvas every 10 seconds while drawing (reduced frequency to prevent lag)
  //     const interval = setInterval(() => {
  //       setShouldSaveCanvas(true);
  //       setTimeout(() => setShouldSaveCanvas(false), 100);
  //     }, 10000);
      
  //     return () => clearInterval(interval);
  //   }
  // }, [isArtist, roomState?.room.status]);

  // Disabled canvas saving - now using server-side generation
  // useEffect(() => {
  //   if (roomState?.room.status === 'finished' && isArtist) {
  //     // Game finished, force save final canvas immediately
  //     forceCanvasSave();
  //   }
  // }, [roomState?.room.status, isArtist]);

  // Disabled round change canvas saving - using server-side generation
  // useEffect(() => {
  //   const currentRoundNum = roomState?.room.currentRound || 0;
  //   if (previousRound > 0 && currentRoundNum > previousRound && previousRound > 0) {
  //     // Round changed, save the canvas for the previous round
  //     setShouldSaveCanvas(true);
  //     setTimeout(() => setShouldSaveCanvas(false), 100);
  //   }
  //   setPreviousRound(currentRoundNum);
  // }, [roomState?.room.currentRound, previousRound]);

  const handleStrokeComplete = async (strokeData: any[], color: string, width: number) => {
    if (!isArtist) return;
    
    try {
      await submitStroke({
        roomId,
        strokeData,
        color,
        width,
        userId,
        isLive: false,
      });
    } catch (error) {
      console.error('Error submitting stroke:', error);
    }
  };

  const handleStrokeUpdate = async (strokeData: any[], color: string, width: number) => {
    if (!isArtist) return;
    
    try {
      await submitStroke({
        roomId,
        strokeData,
        color,
        width,
        userId,
        isLive: true,
      });
    } catch (error) {
      console.error('Error submitting live stroke:', error);
    }
  };

  const handleUndo = async () => {
    if (!isArtist) return;
    
    try {
      await undoLastStroke({
        roomId,
        userId,
      });
    } catch (error) {
      console.error('Error undoing stroke:', error);
    }
  };

  const handleClear = async () => {
    if (!isArtist) return;
    
    try {
      await clearCanvas({
        roomId,
        userId,
      });
      toast.success('🗑️ Canvas cleared!');
    } catch (error: any) {
      console.error('Error clearing canvas:', error);
      toast.error('❌ Failed to clear canvas', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleGuessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guess.trim() || isArtist) return;

    try {
      const result = await submitGuess({
        roomId,
        guess: guess.trim(),
        userId,
        playerName: userName,
      });

      setGuess('');
      
      if (result?.isCorrect) {
        // Save canvas immediately when someone guesses correctly
        if (isArtist) {
          setTimeout(() => {
            forceCanvasSave();
          }, 500); // Wait 500ms to ensure all rendering is complete
        }

        if (result.gameFinished) {
          toast.success(`🎉 Correct guess! +${result.points} points! Game finished!`, {
            description: "Check the final leaderboard to see who won!"
          });
        } else if (result.roundAdvanced) {
          toast.success(`✅ Correct guess! +${result.points} points!`, {
            description: "Next round starting automatically..."
          });
        } else {
          toast.success(`🎯 Correct guess! +${result.points} points!`);
        }
      }
    } catch (error: any) {
      console.error('Error submitting guess:', error);
      toast.error('❌ Failed to submit guess', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleStartGame = async () => {
    if (!isHost) return;
    
    try {
      await startGame({
        roomId,
        hostId: userId,
      });
    } catch (error) {
      console.error('Error starting game:', error);
      toast.error('❌ Failed to start game', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleNextRound = async () => {
    if (!isHost) return;
    
    try {
      const result = await nextRound({
        roomId,
        hostId: userId,
      });
      
      if (result?.gameFinished) {
        toast.success('🏆 Game finished!', {
          description: 'Check the final scores and see who won!'
        });
      }
    } catch (error: any) {
      console.error('Error advancing round:', error);
      toast.error('❌ Failed to advance round', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleRestartGame = async () => {
    if (!isHost) return;
    
    try {
      const result = await hostRestartGame({
        roomId,
        hostId: userId,
      });
      
      if (result?.newRoomId) {
        // Redirect to new room
        window.location.href = `/room/${result.newRoomId}?user=${userId}&name=${encodeURIComponent(userName)}`;
      }
    } catch (error: any) {
      console.error('Error restarting game:', error);
      toast.error('❌ Failed to restart game', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleEndGame = async () => {
    if (!isHost) return;
    
    try {
      const result = await hostEndGame({
        roomId,
        hostId: userId,
      });
      
      if (result?.redirectToHome) {
        window.location.href = '/';
      }
    } catch (error: any) {
      console.error('Error ending game:', error);
      toast.error('❌ Failed to end game', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !isHost) return;
    
    try {
      await sendInvite({
        roomId,
        hostId: userId,
        inviteEmails: [inviteEmail.trim()],
      });
      
      setInviteEmail('');
      setShowInviteForm(false);
      toast.success('📧 Invite sent successfully!', {
        description: `Invitation sent to ${inviteEmail}`
      });
    } catch (error) {
      console.error('Error sending invite:', error);
      toast.error('❌ Failed to send invite', {
        description: error?.message || 'Please check the email address and try again'
      });
    }
  };

  const handleRemovePlayer = async (playerUserId: string, playerName: string) => {
    if (!isHost) return;
    
    try {
      const result = await removePlayer({
        roomId,
        hostId: userId,
        playerUserId,
      });
      
      if (result?.success) {
        toast.success(`🚪 ${playerName} removed from game`);
      }
    } catch (error: any) {
      console.error('Error removing player:', error);
      toast.error('❌ Failed to remove player', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleLeaveRoom = async () => {
    try {
      const result = await leaveRoom({
        roomId,
        userId,
      });
      
      if (result?.success) {
        window.location.href = '/';
      }
    } catch (error: any) {
      console.error('Error leaving room:', error);
      toast.error('❌ Failed to leave room', {
        description: error?.message || 'Please try again'
      });
    }
  };

  const handleCanvasSave = async (imageBlob: Blob) => {
    if (!isArtist) return;
    
    // Make this completely non-blocking and fire-and-forget
    setTimeout(async () => {
      try {
        // Get upload URL
        const uploadUrl = await saveCanvasImage({
          roomId,
          artistId: userId,
        });
        
        if (!uploadUrl) return; // Not authorized or game not active
        
        // Upload the image
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: imageBlob,
          headers: {
            'Content-Type': 'image/png',
          },
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload canvas image');
        }
        
        const result = await uploadResponse.json();
        const imageStorageId = result.storageId;
        
        // Finalize the image storage
        await finalizeCanvasImage({
          roomId,
          artistId: userId,
          artistName: userName,
          imageStorageId,
        });
        
        console.log('Canvas image saved successfully');
      } catch (error) {
        console.error('Error saving canvas image:', error);
        // Don't show error to user as this is a background operation
      }
    }, 0);
  };

  // Function to force immediate canvas save for current artist
  const forceCanvasSave = async () => {
    if (!isArtist) return;
    
    try {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      if (!canvas) return;
      
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        try {
          const uploadUrl = await saveCanvasImage({
            roomId,
            artistId: userId,
          });
          
          if (!uploadUrl) return;
          
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: blob,
            headers: {
              'Content-Type': 'image/png',
            },
          });
          
          if (uploadResponse.ok) {
            const result = await uploadResponse.json();
            await finalizeCanvasImage({
              roomId,
              artistId: userId,
              artistName: userName,
              imageStorageId: result.storageId,
            });
            console.log('Force canvas save successful');
          }
        } catch (error) {
          console.error('Error in force canvas save:', error);
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error accessing canvas for force save:', error);
    }
  };

  // Handle page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Fire and forget - user is leaving anyway
      leaveRoom({ roomId, userId }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also leave when component unmounts
      leaveRoom({ roomId, userId }).catch(() => {});
    };
  }, [roomId, userId, leaveRoom]);

  if (!roomState) return <div>Loading...</div>;

  const { room, players } = roomState;
  
  // Redirect if room is archived or restarted
  if (room.status === 'archived') {
    toast.info('🏠 Game ended by host');
    window.location.href = '/';
    return <div>Game ended, redirecting...</div>;
  }
  
  if (room.status === 'restarted') {
    if (!isHost) {
      // Check if we found a new room for this player
      if (newRoomQuery?.newRoomId) {
        toast.info('🔄 Host started a new game!');
        window.location.href = `/room/${newRoomQuery.newRoomId}?user=${userId}&name=${encodeURIComponent(userName)}`;
        return <div>New game started, redirecting...</div>;
      } else {
        // Fallback: redirect to home if we can't find the new room
        toast.info('🔄 Host started a new game! Please rejoin from the home page.');
        window.location.href = '/';
        return <div>New game started, redirecting...</div>;
      }
    }
  }
  const currentArtist = players.find((p: any) => p.userId === room.currentArtist);
  const timeLeft = room.roundEndTime ? Math.max(0, room.roundEndTime - Date.now()) : 0;

  return (
    <div className="container mx-auto p-4">
      {/* Header with Leave Button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-gray-900">🎨 Draw & Guess Royale</h1>
        <button
          onClick={handleLeaveRoom}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
        >
          🚪 Leave Room
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Game Info */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{room.name}</h1>
                <div className="mt-1 p-2 bg-gray-100 rounded-lg inline-block">
                  <p className="text-sm text-gray-600">Room Code: 
                    <span className="font-mono font-bold text-blue-600 ml-1">{room.inviteCode}</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900">Round {room.currentRound}/{room.maxRounds}</p>
                <p className="text-sm text-gray-600">
                  Time: {Math.floor(timeLeft / 1000)}s
                </p>
              </div>
            </div>

            {room.status === 'waiting' && (
              <div className="mb-4">
                <div className="bg-yellow-100 p-4 rounded-lg">
                  <p className="text-lg font-semibold text-yellow-900">Waiting for players...</p>
                  <p className="text-sm text-yellow-700">
                    {players.length} player{players.length !== 1 ? 's' : ''} joined. 
                    {isHost ? ' Click "Start Game" when ready!' : ' Waiting for host to start the game.'}
                  </p>
                </div>
              </div>
            )}

            {room.status === 'playing' && (
              <div className="mb-4">
                {isArtist ? (
                  <div className="bg-blue-100 p-4 rounded-lg">
                    <p className="text-lg font-semibold text-blue-900">Your word: {room.currentWord}</p>
                    <p className="text-sm text-blue-700">Draw this word for others to guess!</p>
                  </div>
                ) : (
                  <div className="bg-green-100 p-4 rounded-lg">
                    <p className="text-lg font-semibold text-green-900">
                      {currentArtist?.name} is drawing...
                    </p>
                    <p className="text-sm text-green-700">Guess what they're drawing!</p>
                  </div>
                )}
              </div>
            )}

            {room.status === 'finished' && (
              <div className="mb-4">
                <div className="bg-purple-100 p-6 rounded-lg">
                  <h3 className="text-2xl font-bold text-purple-900 mb-4">🏆 Game Complete!</h3>
                  <div className="mb-4">
                    <h4 className="text-lg font-semibold text-purple-800 mb-2">Final Leaderboard:</h4>
                    <div className="space-y-2">
                      {players.slice(0, 3).map((player: any, index) => (
                        <div key={player._id} className="flex justify-between items-center bg-white p-2 rounded">
                          <span className="font-semibold text-gray-900">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} {player.name}
                          </span>
                          <span className="font-bold text-purple-600">{player.score} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {isHost ? (
                    <div>
                      <p className="text-purple-700 mb-4">What would you like to do next?</p>
                      <div className="flex space-x-4">
                        <button
                          onClick={handleRestartGame}
                          className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold"
                        >
                          🔄 Start New Game
                        </button>
                        <button
                          onClick={handleEndGame}
                          className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold"
                        >
                          🏠 End & Return Home
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-purple-700">Waiting for host to decide what to do next...</p>
                  )}
                </div>
              </div>
            )}

            {/* Drawing Canvas */}
            <DrawingCanvas
              isDrawing={isArtist && room.status === 'playing'}
              onStrokeComplete={handleStrokeComplete}
              onStrokeUpdate={handleStrokeUpdate}
              onUndo={handleUndo}
              onClear={handleClear}
              onCanvasSave={handleCanvasSave}
              triggerSave={shouldSaveCanvas}
              strokes={strokes}
            />

            {/* Guess Input */}
            {!isArtist && room.status === 'playing' && (
              <div className="mt-4">
                {hasCorrectGuess ? (
                  <div className="bg-green-100 p-4 rounded-lg">
                    <p className="text-green-800 font-semibold">Word guessed correctly! Next round starting...</p>
                  </div>
                ) : (
                  <form onSubmit={handleGuessSubmit}>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        placeholder="Enter your guess..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        maxLength={50}
                      />
                      <button
                        type="submit"
                        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                        disabled={!guess.trim()}
                      >
                        Guess
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Host Controls */}
            {isHost && room.status === 'waiting' && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleStartGame}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    Start Game
                  </button>
                  
                  <button
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    📧 Invite Players
                  </button>
                </div>

                {showInviteForm && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <form onSubmit={handleSendInvite} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-blue-900 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="friend@example.com"
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                          disabled={!inviteEmail.trim()}
                        >
                          Send Invite
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowInviteForm(false)}
                          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Invite Status (Host only) */}
          {isHost && invites && invites.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-4">
              <h3 className="font-semibold mb-3 text-gray-900">Invite Status ({invites.length})</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {invites.map((invite: any) => (
                  <div key={invite._id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-sm text-gray-700 truncate mr-2">
                      {invite.email}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      invite.status === 'joined' ? 'bg-green-100 text-green-800' :
                      invite.status === 'clicked' ? 'bg-blue-100 text-blue-800' :
                      invite.status === 'opened' ? 'bg-yellow-100 text-yellow-800' :
                      invite.status === 'delivered' ? 'bg-purple-100 text-purple-800' :
                      invite.status === 'sent' ? 'bg-indigo-100 text-indigo-800' :
                      invite.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {invite.status === 'joined' ? 
                        `✅ Joined${invite.joinedPlayerName ? ` (${invite.joinedPlayerName})` : ''}` :
                       invite.status === 'clicked' ? '🔗 Joining...' :
                       invite.status === 'opened' ? '👀 Invite Seen' :
                       invite.status === 'delivered' ? '📥 Delivered' :
                       invite.status === 'sent' ? '📤 Sent' :
                       invite.status === 'failed' ? '❌ Failed' :
                       '⏳ Sending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Players & Scores */}
          <div className="bg-white rounded-lg shadow-lg p-4">
            <h3 className="font-semibold mb-3 text-gray-900">Players ({players.length})</h3>
            <div className="space-y-2">
              {players.map((player: any) => (
                <div
                  key={player._id}
                  className={`flex justify-between items-center p-2 rounded ${
                    player.userId === room.currentArtist ? 'bg-blue-100' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="font-medium text-gray-900">
                      {player.name}
                      {player.userId === room.currentArtist && ' 🎨'}
                      {player.userId === userId && ' (You)'}
                      {player.userId === room.hostId && ' 👑'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-900">{player.score}</span>
                    
                    {/* Host can remove other players (not themselves) */}
                    {isHost && player.userId !== userId && room.status === 'waiting' && (
                      <button
                        onClick={() => handleRemovePlayer(player.userId, player.name)}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        title={`Remove ${player.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Guesses */}
          <div className="bg-white rounded-lg shadow-lg p-4">
            <h3 className="font-semibold mb-3 text-gray-900">Recent Guesses</h3>
            <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
              {guesses.slice(-10).map((guess, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded text-gray-900">
                  {guess}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}