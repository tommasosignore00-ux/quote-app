/**
 * Digital Signature Pad component.
 * Punto 9: Firma Digitale - client signs on smartphone screen for immediate approval.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  GestureResponderEvent,
} from 'react-native';

interface Point {
  x: number;
  y: number;
}

interface SignaturePadProps {
  onSignatureComplete: (signatureSvg: string) => void;
  onCancel?: () => void;
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
}

export default function SignaturePad({
  onSignatureComplete,
  onCancel,
  width = Dimensions.get('window').width - 48,
  height = 250,
  strokeColor = '#0f172a',
  strokeWidth = 2.5,
  backgroundColor = '#ffffff',
}: SignaturePadProps) {
  const [paths, setPaths] = useState<Point[][]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const containerRef = useRef<View>(null);
  const layoutRef = useRef({ x: 0, y: 0 });

  const onLayout = useCallback(() => {
    containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      layoutRef.current = { x: pageX, y: pageY };
    });
  }, []);

  const getPoint = (event: GestureResponderEvent): Point => {
    const { pageX, pageY } = event.nativeEvent;
    return {
      x: pageX - layoutRef.current.x,
      y: pageY - layoutRef.current.y,
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const point = getPoint(event);
        setCurrentPath([point]);
      },
      onPanResponderMove: (event) => {
        const point = getPoint(event);
        setCurrentPath((prev) => [...prev, point]);
      },
      onPanResponderRelease: () => {
        if (currentPath.length > 0) {
          setPaths((prev) => [...prev, currentPath]);
          setCurrentPath([]);
        }
      },
    })
  ).current;

  const clearSignature = () => {
    setPaths([]);
    setCurrentPath([]);
  };

  const pathToSvgD = (points: Point[]): string => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  const generateSvg = (): string => {
    const allPaths = [...paths, ...(currentPath.length > 0 ? [currentPath] : [])];
    let svgPaths = '';
    for (const path of allPaths) {
      svgPaths += `<path d="${pathToSvgD(path)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgPaths}</svg>`;
  };

  const handleConfirm = () => {
    if (paths.length === 0 && currentPath.length === 0) return;
    const svg = generateSvg();
    onSignatureComplete(svg);
  };

  const isEmpty = paths.length === 0 && currentPath.length === 0;

  // Render paths as simple View-based dots (no external SVG dependency)
  const renderPaths = () => {
    const allPaths = [...paths, ...(currentPath.length > 0 ? [currentPath] : [])];
    const dots: React.ReactElement[] = [];

    for (let pi = 0; pi < allPaths.length; pi++) {
      const path = allPaths[pi];
      for (let i = 0; i < path.length; i++) {
        dots.push(
          <View
            key={`${pi}-${i}`}
            style={{
              position: 'absolute',
              left: path[i].x - strokeWidth / 2,
              top: path[i].y - strokeWidth / 2,
              width: strokeWidth,
              height: strokeWidth,
              borderRadius: strokeWidth / 2,
              backgroundColor: strokeColor,
            }}
          />
        );
      }
    }

    return dots;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Firma qui sotto / Sign below</Text>
      <View
        ref={containerRef}
        onLayout={onLayout}
        style={[
          styles.canvas,
          { width, height, backgroundColor },
        ]}
        {...panResponder.panHandlers}
      >
        {renderPaths()}
        {isEmpty && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>✍️</Text>
          </View>
        )}
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearSignature}>
          <Text style={styles.clearBtnText}>🗑️ Cancella</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Annulla</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.confirmBtn, isEmpty && styles.disabledBtn]}
          onPress={handleConfirm}
          disabled={isEmpty}
        >
          <Text style={styles.confirmBtnText}>
            ✅ Conferma Firma
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textAlign: 'center',
  },
  canvas: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderStyle: 'dashed',
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.3,
  },
  placeholderText: { fontSize: 48 },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  clearBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  clearBtnText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  cancelBtnText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabledBtn: { opacity: 0.4 },
});
