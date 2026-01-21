/**
 * Canvas Component
 * Main collaborative canvas drawing component with real-time sync
 */

import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Text,
} from 'react-native';
import {Canvas as SkiaCanvas, Path, Skia} from '@shopify/react-native-skia';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {useSharedValue, runOnJS} from 'react-native-reanimated';
import {syncCanvasDrawing, subscribeToCanvasUpdates} from '@services/canvasSync';
import {recordCanvasActivity} from '@services/partnershipService';
import {DrawingTools, BrushWidth, BackgroundColor, DrawingTool} from './canvas/DrawingTools';
import {theme} from '@theme';

interface CanvasProps {
  partnershipId: string;
  userId: string;
  onSave?: (drawingData: string) => void;
  initialDrawingData?: string;
  initialBackgroundColor?: 'black' | 'white' | 'beige';
  editable?: boolean;
  size?: 'small' | 'medium' | 'large';
  height?: number;
}

interface PathData {
  color: string;
  strokeWidth: number;
  path: string;
}

const SIZE_MAP = {
  small: 300,
  medium: 400,
  large: 600,
};

export const Canvas: React.FC<CanvasProps> = ({
  partnershipId,
  userId,
  onSave,
  initialDrawingData,
  initialBackgroundColor,
  editable = true,
  size = 'medium',
  height,
}) => {
  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<PathData | null>(null);
  const [currentColor, setCurrentColor] = useState(theme.colors.primary);
  const [currentBrushWidth, setCurrentBrushWidth] = useState<BrushWidth>(5);
  const [currentTool, setCurrentTool] = useState<'brush' | 'eraser' | 'paintBucket'>('brush');
  const [backgroundColor, setBackgroundColor] = useState<BackgroundColor>(initialBackgroundColor || 'black');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [pathHistory, setPathHistory] = useState<PathData[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const maxHistorySize = 50;

  const canvasWidth = useMemo(() => {
    if (height) {
      return Dimensions.get('window').width - theme.spacing.base * 2;
    }
    return SIZE_MAP[size];
  }, [size, height]);

  const canvasHeight = useMemo(() => {
    if (height) return height;
    return SIZE_MAP[size];
  }, [size, height]);

  const skiaPath = useSharedValue<Path | null>(null);
  const isDrawing = useSharedValue(false);

  // Load initial drawing data
  useEffect(() => {
    if (initialDrawingData) {
      try {
        const parsedPaths = JSON.parse(initialDrawingData);
        setPaths(parsedPaths);
        // Initialize history with initial state
        setPathHistory([parsedPaths]);
        setHistoryIndex(0);
        setIsLoading(false);
      } catch (error) {
        console.error('Error parsing initial drawing data:', error);
        setIsLoading(false);
      }
    } else {
      // Initialize with empty state
      setPathHistory([[]]);
      setHistoryIndex(0);
      setIsLoading(false);
    }
  }, [initialDrawingData]);

  // Load background color from initial prop
  useEffect(() => {
    if (initialBackgroundColor) {
      setBackgroundColor(initialBackgroundColor);
    }
  }, [initialBackgroundColor]);

  // Subscribe to canvas updates
  useEffect(() => {
    if (!editable) {
      const unsubscribe = subscribeToCanvasUpdates(partnershipId, (drawing) => {
        if (drawing && drawing.drawingData) {
          try {
            const parsedPaths = JSON.parse(drawing.drawingData);
            setPaths(parsedPaths);
          } catch (error) {
            console.error('Error parsing canvas update:', error);
          }
        }
      });

      return () => unsubscribe();
    }
  }, [partnershipId, editable]);

  // Sync drawing to Firestore
  const syncDrawing = useCallback(
    async (drawingPaths: PathData[]) => {
      if (!editable) return;

      const drawingData = JSON.stringify(drawingPaths);
      setIsSyncing(true);

      try {
        await syncCanvasDrawing(
          partnershipId,
          drawingData,
          userId,
          backgroundColor,
          canvasWidth,
          canvasHeight,
        );
        onSave?.(drawingData);
      } catch (error) {
        console.error('Error syncing canvas:', error);
      } finally {
        setIsSyncing(false);
      }
    },
    [partnershipId, userId, editable, onSave, backgroundColor, canvasWidth, canvasHeight],
  );

  // Debounced sync
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSync = useCallback(
    (drawingPaths: PathData[]) => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        syncDrawing(drawingPaths);
      }, 500);
    },
    [syncDrawing],
  );

  // Tap gesture for paint bucket
  const tapGesture = Gesture.Tap()
    .onEnd((event) => {
      if (!editable || currentTool !== 'paintBucket') return;
      handlePaintBucket(event.x, event.y);
    });

  // Gesture handlers
  const panGesture = Gesture.Pan()
    .onStart((event) => {
      if (!editable || currentTool === 'paintBucket') return;

      isDrawing.value = true;
      const path = Skia.Path.Make();
      path.moveTo(event.x, event.y);

      const effectiveColor =
        currentTool === 'eraser'
          ? backgroundColor === 'black'
            ? '#000000'
            : backgroundColor === 'white'
            ? '#FFFFFF'
            : theme.colors.background
          : currentColor;

      const newPath: PathData = {
        color: effectiveColor,
        strokeWidth: currentBrushWidth,
        path: path.toSVGString(),
      };

      setCurrentPath(newPath);
      skiaPath.value = path;
    })
    .onUpdate((event) => {
      if (!editable || !isDrawing.value || currentTool === 'paintBucket') return;

      const path = skiaPath.value;
      if (path) {
        path.lineTo(event.x, event.y);
        skiaPath.value = path;

        if (currentPath) {
          const updatedPath: PathData = {
            ...currentPath,
            path: path.toSVGString(),
          };
          setCurrentPath(updatedPath);
        }
      }
    })
    .onEnd(() => {
      if (!editable || !isDrawing.value || currentTool === 'paintBucket') return;

      isDrawing.value = false;

      if (currentPath) {
        const newPaths = [...paths, currentPath];
        setPaths(newPaths);
        setCurrentPath(null);
        const newStrokeCount = strokeCount + 1;
        setStrokeCount(newStrokeCount);
        
        // Add to history
        setPathHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push(newPaths);
          // Limit history size
          if (newHistory.length > maxHistorySize) {
            return newHistory.slice(-maxHistorySize);
          }
          return newHistory;
        });
        setHistoryIndex(prev => {
          const newIndex = prev + 1;
          return newIndex >= maxHistorySize ? maxHistorySize - 1 : newIndex;
        });
        
        debouncedSync(newPaths);
        
        // Record canvas activity when user draws minimum 5 strokes
        if (editable && newStrokeCount >= 5 && newStrokeCount % 5 === 0) {
          recordCanvasActivity(partnershipId).catch(error => {
            console.error('Error recording canvas activity:', error);
          });
        }
      }

      skiaPath.value = null;
    });

  // Combined gesture
  const combinedGesture = Gesture.Race(panGesture, tapGesture);

  const handleClear = () => {
    const emptyPaths: PathData[] = [];
    setPaths(emptyPaths);
    setCurrentPath(null);
    setStrokeCount(0);
    
    // Add to history
    setPathHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(emptyPaths);
      if (newHistory.length > maxHistorySize) {
        return newHistory.slice(-maxHistorySize);
      }
      return newHistory;
    });
    setHistoryIndex(prev => {
      const newIndex = prev + 1;
      return newIndex >= maxHistorySize ? maxHistorySize - 1 : newIndex;
    });
    
    if (editable) {
      syncDrawing(emptyPaths);
    }
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousPaths = pathHistory[newIndex];
      setPaths(previousPaths);
      setHistoryIndex(newIndex);
      if (editable) {
        syncDrawing(previousPaths);
      }
    }
  }, [historyIndex, pathHistory, editable, syncDrawing]);

  const handleRedo = useCallback(() => {
    if (historyIndex < pathHistory.length - 1) {
      const newIndex = historyIndex + 1;
      const nextPaths = pathHistory[newIndex];
      setPaths(nextPaths);
      setHistoryIndex(newIndex);
      if (editable) {
        syncDrawing(nextPaths);
      }
    }
  }, [historyIndex, pathHistory, editable, syncDrawing]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < pathHistory.length - 1;

  const handlePaintBucket = useCallback((x: number, y: number) => {
    if (!editable) return;

    try {
      // Create a temporary surface to render current paths
      const surface = Skia.Surface.Make(canvasWidth, canvasHeight);
      if (!surface) {
        console.error('Failed to create surface for flood fill');
        return;
      }

      const canvas = surface.getCanvas();
      
      // Clear with background color
      let bgColor = '#000000';
      switch (backgroundColor) {
        case 'black':
          bgColor = '#000000';
          break;
        case 'white':
          bgColor = '#FFFFFF';
          break;
        case 'beige':
          bgColor = theme.colors.background;
          break;
      }
      canvas.clear(Skia.Color(bgColor));

      // Draw all existing paths
      paths.forEach((pathData) => {
        try {
          const path = Skia.Path.MakeFromSVGString(pathData.path);
          if (path) {
            const paint = Skia.Paint();
            paint.setColor(Skia.Color(pathData.color));
            paint.setStrokeWidth(pathData.strokeWidth);
            paint.setStyle(Skia.PaintStyle.Stroke);
            paint.setStrokeCap(Skia.StrokeCap.Round);
            paint.setStrokeJoin(Skia.StrokeJoin.Round);
            canvas.drawPath(path, paint);
          }
        } catch (error) {
          console.warn('Error drawing path for flood fill:', error);
        }
      });

      // Get image snapshot
      const image = surface.makeImageSnapshot();
      const pixels = image.readPixels();
      
      if (!pixels) {
        console.error('Failed to read pixels');
        surface.dispose();
        return;
      }

      // Get pixel at tap location
      const pixelIndex = Math.floor(y) * canvasWidth + Math.floor(x);
      const targetColor = {
        r: pixels[pixelIndex * 4],
        g: pixels[pixelIndex * 4 + 1],
        b: pixels[pixelIndex * 4 + 2],
        a: pixels[pixelIndex * 4 + 3],
      };

      // Parse fill color
      const fillColorHex = currentColor.replace('#', '');
      const fillColor = {
        r: parseInt(fillColorHex.substring(0, 2), 16),
        g: parseInt(fillColorHex.substring(2, 4), 16),
        b: parseInt(fillColorHex.substring(4, 6), 16),
        a: 255,
      };

      // Check if already filled with target color
      if (
        targetColor.r === fillColor.r &&
        targetColor.g === fillColor.g &&
        targetColor.b === fillColor.b
      ) {
        surface.dispose();
        return;
      }

      // Flood fill algorithm (iterative stack-based)
      const stack: Array<{x: number; y: number}> = [{x: Math.floor(x), y: Math.floor(y)}];
      const visited = new Set<string>();
      const pixelsToFill: Array<{x: number; y: number}> = [];

      while (stack.length > 0) {
        const {x: px, y: py} = stack.pop()!;
        const key = `${px},${py}`;

        if (visited.has(key)) continue;
        if (px < 0 || px >= canvasWidth || py < 0 || py >= canvasHeight) continue;

        const idx = Math.floor(py) * canvasWidth + Math.floor(px);
        if (idx * 4 + 3 >= pixels.length) continue;

        const pixelColor = {
          r: pixels[idx * 4],
          g: pixels[idx * 4 + 1],
          b: pixels[idx * 4 + 2],
        };

        // Check if pixel matches target color (with tolerance for anti-aliasing)
        const colorMatch =
          Math.abs(pixelColor.r - targetColor.r) < 10 &&
          Math.abs(pixelColor.g - targetColor.g) < 10 &&
          Math.abs(pixelColor.b - targetColor.b) < 10;

        if (!colorMatch) continue;

        visited.add(key);
        pixelsToFill.push({x: px, y: py});

        // Add neighbors to stack
        stack.push({x: px + 1, y: py});
        stack.push({x: px - 1, y: py});
        stack.push({x: px, y: py + 1});
        stack.push({x: px, y: py - 1});
      }

      // Create a filled rectangle path for the region
      if (pixelsToFill.length > 0) {
        // Find bounding box
        const minX = Math.min(...pixelsToFill.map(p => p.x));
        const maxX = Math.max(...pixelsToFill.map(p => p.x));
        const minY = Math.min(...pixelsToFill.map(p => p.y));
        const maxY = Math.max(...pixelsToFill.map(p => p.y));

        // Create a path that covers the filled region
        const fillPath = Skia.Path.Make();
        fillPath.addRect({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        });

        const fillPathData: PathData = {
          color: currentColor,
          strokeWidth: 1,
          path: fillPath.toSVGString(),
        };

        // Add filled region as a new path
        const newPaths = [...paths, fillPathData];
        setPaths(newPaths);
        
        // Add to history
        setPathHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push(newPaths);
          if (newHistory.length > maxHistorySize) {
            return newHistory.slice(-maxHistorySize);
          }
          return newHistory;
        });
        setHistoryIndex(prev => {
          const newIndex = prev + 1;
          return newIndex >= maxHistorySize ? maxHistorySize - 1 : newIndex;
        });
        
        debouncedSync(newPaths);
      }

      surface.dispose();
    } catch (error) {
      console.error('Error in flood fill:', error);
    }
  }, [editable, paths, currentColor, canvasWidth, canvasHeight, backgroundColor, debouncedSync, theme.colors.background]);

  const getBackgroundColorValue = (): string => {
    switch (backgroundColor) {
      case 'black':
        return '#000000';
      case 'white':
        return '#FFFFFF';
      case 'beige':
        return theme.colors.background;
      default:
        return '#000000';
    }
  };

  // Render paths with performance optimizations
  const renderPaths = useMemo(() => {
    const allPaths = currentPath ? [...paths, currentPath] : paths;
    return allPaths.map((pathData, index) => {
      try {
        const path = Skia.Path.MakeFromSVGString(pathData.path);
        if (!path) return null;

        // Use path as-is (simplification can be added later if needed)
        const simplifiedPath = path;

        return (
          <Path
            key={`path-${index}-${pathData.path.substring(0, 20)}`}
            path={simplifiedPath}
            color={pathData.color}
            style="stroke"
            strokeWidth={pathData.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        );
      } catch (error) {
        console.error('Error rendering path:', error);
        return null;
      }
    });
  }, [paths, currentPath]);

  if (isLoading) {
    return (
      <View style={[styles.container, {width: canvasWidth, height: canvasHeight}]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.canvasContainer,
          {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: getBackgroundColorValue(),
          },
        ]}>
        <GestureDetector gesture={combinedGesture}>
          <SkiaCanvas style={styles.canvas}>
            {renderPaths}
          </SkiaCanvas>
        </GestureDetector>
        {isSyncing && (
          <View style={styles.syncingIndicator}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
      </View>

      {editable && (
        <DrawingTools
          currentColor={currentColor}
          currentBrushWidth={currentBrushWidth}
          currentTool={currentTool}
          backgroundColor={backgroundColor}
          onColorChange={setCurrentColor}
          onBrushWidthChange={setCurrentBrushWidth}
          onToolChange={setCurrentTool}
          onBackgroundChange={setBackgroundColor}
          onClear={handleClear}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  canvasContainer: {
    borderRadius: theme.spacing.md,
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
  },
  syncingIndicator: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
});
