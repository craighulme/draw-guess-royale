'use client';

import { useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useState, useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  timestamp: number;
}

interface Stroke {
  strokeData: Point[];
  color: string;
  width: number;
  round: number;
  artistId: string;
  timestamp: number;
}

export default function ReplayPage() {
  const params = useParams();
  const roomId = params.roomId as Id<'rooms'>;
  
  const [currentRound, setCurrentRound] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [replayProgress, setReplayProgress] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const animationRunningRef = useRef<boolean>(false);
  
  const roomState = useQuery(api.rooms.getRoomState, { roomId });
  const allStrokes = useQuery(api.game.getAllStrokesForRoom, { roomId });
  const allGuesses = useQuery(api.game.getAllGuessesForRoomPublic, { roomId });

  // Filter strokes for current round
  const roundStrokes = allStrokes?.filter(stroke => 
    stroke.round === currentRound && !stroke.isLive
  ) || [];

  // Get round info
  const roundGuesses = allGuesses?.filter(guess => guess.round === currentRound) || [];
  const correctGuesses = roundGuesses.filter(guess => guess.isCorrect);
  const firstCorrect = correctGuesses[0];

  const maxRounds = roomState?.room.maxRounds || 1;

  // Sort strokes by timestamp for proper playback order
  const sortedStrokes = [...roundStrokes].sort((a, b) => a.timestamp - b.timestamp);

  // Debug logging
  useEffect(() => {
    console.log('Room State:', roomState);
    console.log('All Strokes:', allStrokes);
    console.log('Round Strokes for round', currentRound, ':', roundStrokes);
    console.log('Sorted Strokes:', sortedStrokes);
    console.log('All Guesses:', allGuesses);
  }, [roomState, allStrokes, roundStrokes, sortedStrokes, allGuesses, currentRound]);

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, progress: number = 1) => {
    if (stroke.strokeData.length < 2) return;

    const pointsToRender = Math.floor(stroke.strokeData.length * progress);
    if (pointsToRender < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(stroke.strokeData[0].x, stroke.strokeData[0].y);
    for (let i = 1; i < pointsToRender; i++) {
      ctx.lineTo(stroke.strokeData[i].x, stroke.strokeData[i].y);
    }
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) {
      console.log('Canvas or context not available');
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const drawFrame = (progress: number) => {
    clearCanvas();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || sortedStrokes.length === 0) {
      console.log('Cannot draw frame - no context or strokes');
      return;
    }

    // If progress is 0, show empty canvas
    if (progress === 0) {
      return;
    }

    // Calculate progress based on stroke sequence instead of timestamps
    const totalStrokes = sortedStrokes.length;
    const strokesToShow = Math.floor(progress * totalStrokes * 2); // Multiply by 2 for smoother animation
    
    for (let i = 0; i < totalStrokes; i++) {
      const stroke = sortedStrokes[i];
      const strokeStartProgress = i / totalStrokes;
      const strokeEndProgress = (i + 1) / totalStrokes;
      
      if (progress >= strokeStartProgress) {
        let strokeProgress = 1; // Default to complete stroke
        
        if (progress < strokeEndProgress) {
          // Calculate partial stroke progress
          const progressThroughStroke = (progress - strokeStartProgress) / (strokeEndProgress - strokeStartProgress);
          strokeProgress = Math.max(0, Math.min(1, progressThroughStroke));
        }
        
        if (strokeProgress > 0) {
          drawStroke(ctx, stroke, strokeProgress);
        }
      }
    }
  };

  const startPlayback = () => {
    if (sortedStrokes.length === 0) {
      console.log('No strokes available for playback');
      return;
    }
    
    console.log(`Starting playback with ${sortedStrokes.length} strokes for round ${currentRound}`);
    
    const startTime = Date.now();
    const startProgress = replayProgress;
    
    setIsPlaying(true);
    animationRunningRef.current = true;

    const animate = () => {
      if (!animationRunningRef.current) {
        console.log('Animation stopped');
        return;
      }
      
      const elapsed = Date.now() - startTime;
      const duration = 10000 / playbackSpeed; // Get current speed
      const progressIncrement = elapsed / duration;
      const remainingDuration = 1 - startProgress;
      const newProgress = Math.min(startProgress + (progressIncrement * remainingDuration), 1);
      
      setReplayProgress(newProgress);
      drawFrame(newProgress);
      
      if (newProgress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        console.log('Animation completed');
        animationRunningRef.current = false;
        setIsPlaying(false);
        drawFrame(1);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  };

  const stopPlayback = () => {
    console.log('Stopping playback');
    animationRunningRef.current = false;
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
  };

  const resetPlayback = () => {
    stopPlayback();
    setReplayProgress(0);
    clearCanvas();
  };

  const handleProgressBarClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
    
    setReplayProgress(newProgress);
    drawFrame(newProgress);
    
    // Stop any current playback
    stopPlayback();
  };

  // Initialize canvas
  useEffect(() => {
    clearCanvas();
  }, []);

  // Draw final result when not playing, or clear canvas when switching rounds
  useEffect(() => {
    if (!isPlaying && sortedStrokes.length > 0 && replayProgress > 0) {
      // Only draw final result if we've actually played something
      drawFrame(replayProgress);
    } else if (!isPlaying) {
      clearCanvas();
    }
  }, [currentRound, sortedStrokes, isPlaying, replayProgress]);

  // Handle speed changes during playback
  useEffect(() => {
    if (isPlaying && animationRunningRef.current) {
      // Restart animation with new speed
      stopPlayback();
      setTimeout(() => startPlayback(), 10);
    }
  }, [playbackSpeed]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!roomState) return <div>Loading replay...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            🎬 Game Replay
          </h1>
          <h2 className="text-2xl font-semibold text-gray-800">{roomState.room.name}</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Round Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Round {currentRound} of {maxRounds}</h3>
              <div className="flex space-x-2">
                {Array.from({ length: maxRounds }, (_, i) => i + 1).map(round => (
                  <button
                    key={round}
                    onClick={() => {
                      setCurrentRound(round);
                      resetPlayback();
                    }}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      currentRound === round
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Round {round}
                  </button>
                ))}
              </div>
            </div>

            {/* Round Info */}
            <div className="mb-4">
              {firstCorrect ? (
                <div className="bg-green-100 p-4 rounded-lg">
                  <p className="text-green-800">
                    <strong>Word:</strong> "{firstCorrect.guess}" | 
                    <strong> First correct:</strong> {firstCorrect.playerName} | 
                    <strong> Total guesses:</strong> {roundGuesses.length}
                  </p>
                </div>
              ) : (
                <div className="bg-gray-100 p-4 rounded-lg">
                  <p className="text-gray-800">
                    <strong>Round {currentRound}:</strong> Word not guessed correctly | 
                    <strong> Total guesses:</strong> {roundGuesses.length}
                  </p>
                </div>
              )}
              
              {sortedStrokes.length === 0 && (
                <div className="bg-yellow-100 p-4 rounded-lg mt-2">
                  <p className="text-yellow-800">
                    ⚠️ No drawing data available for this round
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex justify-center mb-6">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="border-2 border-gray-300 rounded-lg bg-white shadow-lg"
            />
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="w-full">
              <div 
                className="bg-gray-200 rounded-full h-4 cursor-pointer hover:bg-gray-300 relative"
                onClick={handleProgressBarClick}
                title="Click to seek"
              >
                <div
                  className="bg-blue-500 h-4 rounded-full pointer-events-none"
                  style={{ width: `${replayProgress * 100}%` }}
                />
                {/* Progress indicator */}
                <div
                  className="absolute top-1/2 w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg transform -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                  style={{ left: `${replayProgress * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0:00</span>
                <span>0:{Math.floor(10000 / playbackSpeed / 1000).toString().padStart(2, '0')}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={() => {
                  if (isPlaying) {
                    stopPlayback();
                  } else if (replayProgress >= 1) {
                    // Simple: reset to 0 and start playing
                    setReplayProgress(0);
                    clearCanvas();
                    setIsPlaying(true);
                    animationRunningRef.current = true;
                    
                    const startTime = Date.now();
                    const duration = 10000 / playbackSpeed;
                    
                    const animate = () => {
                      if (!animationRunningRef.current) return;
                      
                      const elapsed = Date.now() - startTime;
                      const newProgress = Math.min(elapsed / duration, 1);
                      
                      setReplayProgress(newProgress);
                      drawFrame(newProgress);
                      
                      if (newProgress < 1) {
                        animationRef.current = requestAnimationFrame(animate);
                      } else {
                        animationRunningRef.current = false;
                        setIsPlaying(false);
                        drawFrame(1);
                      }
                    };
                    
                    animationRef.current = requestAnimationFrame(animate);
                  } else {
                    startPlayback();
                  }
                }}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  isPlaying
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isPlaying ? '⏸️ Pause' : (replayProgress >= 1 ? '🔄 Replay' : '▶️ Play')}
              </button>
              
              <button
                onClick={resetPlayback}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold"
              >
                🔄 Reset
              </button>

              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Speed:</label>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <div className="text-center mt-8">
            <a
              href="/"
              className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"
            >
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}