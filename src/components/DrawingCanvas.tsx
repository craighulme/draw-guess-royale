'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
}

interface DrawingCanvasProps {
  isDrawing: boolean;
  onStrokeComplete: (strokeData: Point[], color: string, width: number) => void;
  onStrokeUpdate?: (strokeData: Point[], color: string, width: number) => void;
  onUndo?: () => void;
  onClear?: () => void;
  onCanvasSave?: (imageBlob: Blob) => void;
  triggerSave?: boolean;
  strokes?: Array<{
    strokeData: Point[];
    color: string;
    width: number;
    isLive?: boolean;
  }>;
}

export default function DrawingCanvas({ isDrawing, onStrokeComplete, onStrokeUpdate, onUndo, onClear, onCanvasSave, triggerSave, strokes = [] }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [localStrokes, setLocalStrokes] = useState<Array<{
    strokeData: Point[];
    color: string;
    width: number;
    isLocal?: boolean;
  }>>([]);
  const lastUpdateTimeRef = useRef<number>(0);
  const updateThrottle = 50; // Update every 50ms for live streaming (more responsive)
  const batchedPointsRef = useRef<Point[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500'];

  const debouncedCanvasSave = useCallback(() => {
    if (!onCanvasSave || !isDrawing) return;
    
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set a new timeout to save the canvas
    saveTimeoutRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.toBlob((blob) => {
            if (blob) {
              onCanvasSave(blob);
            }
          }, 'image/png');
        }
      });
    }, 1000); // Wait 1 second after last stroke before saving
  }, [onCanvasSave, isDrawing]);

  // Clear local strokes when new strokes come from server
  useEffect(() => {
    setLocalStrokes([]);
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all server strokes first
    const allStrokes = [...strokes, ...localStrokes];
    
    allStrokes.forEach(stroke => {
      if (stroke.strokeData.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(stroke.strokeData[0].x, stroke.strokeData[0].y);
      for (let i = 1; i < stroke.strokeData.length; i++) {
        ctx.lineTo(stroke.strokeData[i].x, stroke.strokeData[i].y);
      }
      ctx.stroke();
    });

    // Draw current stroke being drawn
    if (isDrawingStroke && currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = tool === 'eraser' ? width * 2 : width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
    }

    // Don't auto-save canvas anymore - we'll save only on correct guess
  }, [strokes, localStrokes, currentStroke, isDrawingStroke, color, width, tool]);

  const getPointFromEvent = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    
    let x: number, y: number;
    
    if ('touches' in event) {
      const touch = event.touches[0] || event.changedTouches[0];
      x = touch.clientX - rect.left;
      y = touch.clientY - rect.top;
    } else {
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
    }

    return {
      x: x * (canvas.width / rect.width),
      y: y * (canvas.height / rect.height),
      timestamp: Date.now(),
    };
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    event.preventDefault();
    setIsDrawingStroke(true);
    const point = getPointFromEvent(event);
    setCurrentStroke([point]);
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingStroke || !isDrawing) return;
    
    event.preventDefault();
    const point = getPointFromEvent(event);
    const newStroke = [...currentStroke, point];
    setCurrentStroke(newStroke);

    // Batch points for live streaming (optimized)
    batchedPointsRef.current.push(point);
    
    // Send batched live updates at throttled intervals
    const now = Date.now();
    if (onStrokeUpdate && batchedPointsRef.current.length > 0 && now - lastUpdateTimeRef.current > updateThrottle) {
      lastUpdateTimeRef.current = now;
      const strokeColor = tool === 'eraser' ? '#ffffff' : color;
      
      // Send only the new points since last update (much smaller payload)
      onStrokeUpdate(batchedPointsRef.current, strokeColor, tool === 'eraser' ? width * 2 : width);
      batchedPointsRef.current = []; // Clear batch
    }
  };

  const stopDrawing = () => {
    if (!isDrawingStroke || !isDrawing) return;
    
    // Send any remaining batched points
    if (onStrokeUpdate && batchedPointsRef.current.length > 0) {
      const strokeColor = tool === 'eraser' ? '#ffffff' : color;
      onStrokeUpdate(batchedPointsRef.current, strokeColor, tool === 'eraser' ? width * 2 : width);
      batchedPointsRef.current = [];
    }
    
    setIsDrawingStroke(false);
    if (currentStroke.length > 1) {
      const strokeColor = tool === 'eraser' ? '#ffffff' : color;
      
      // Add to local strokes immediately for responsive UI
      const localStroke = {
        strokeData: currentStroke,
        color: strokeColor,
        width: tool === 'eraser' ? width * 2 : width,
        isLocal: true,
      };
      setLocalStrokes(prev => [...prev, localStroke]);
      
      onStrokeComplete(currentStroke, strokeColor, tool === 'eraser' ? width * 2 : width);
      
      // Save canvas after each stroke (debounced)
      debouncedCanvasSave();
    }
    setCurrentStroke([]);
  };

  const clearCanvas = () => {
    if (!isDrawing || !onClear) return;
    onClear();
  };

  // Cleanup timeout on unmount or when drawing stops
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save canvas when triggerSave changes to true
  useEffect(() => {
    if (triggerSave && onCanvasSave) {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.toBlob((blob) => {
            if (blob) {
              onCanvasSave(blob);
            }
          }, 'image/png');
        }
      });
    }
  }, [triggerSave, onCanvasSave]);

  return (
    <div className="flex flex-col items-center space-y-4">
      {isDrawing && (
        <div className="flex items-center flex-wrap gap-4 justify-center">
          {/* Tool Selection */}
          <div className="flex space-x-2">
            <button
              onClick={() => setTool('pen')}
              className={`px-3 py-2 rounded text-sm font-medium ${
                tool === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🖊️ Pen
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-3 py-2 rounded text-sm font-medium ${
                tool === 'eraser' ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🧹 Eraser
            </button>
          </div>

          {/* Color Palette - only show when pen is selected */}
          {tool === 'pen' && (
            <div className="flex space-x-2">
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    color === c ? 'border-gray-800' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}

          {/* Brush Size */}
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">
              {tool === 'pen' ? 'Pen Size:' : 'Eraser Size:'}
            </label>
            <input
              type="range"
              min="1"
              max="30"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm font-medium">{width}px</span>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            {onUndo && (
              <button
                onClick={onUndo}
                className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium"
              >
                ↶ Undo
              </button>
            )}

            {onClear && (
              <button
                onClick={clearCanvas}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium"
              >
                🗑️ Clear
              </button>
            )}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className={`border-2 border-gray-300 rounded-lg bg-white ${
          isDrawing ? 'cursor-crosshair' : 'cursor-not-allowed'
        }`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {!isDrawing && (
        <p className="text-gray-500">Wait for your turn to draw...</p>
      )}
    </div>
  );
}