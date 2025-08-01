import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import { GPXData, PhotoPoint } from '@/types/gpx';

interface Trail3DProps {
  gpxData: GPXData | null;
  currentPosition: number;
  onPhotosUpdate?: (photos: PhotoPoint[]) => void;
}

interface Trail3DSceneProps {
  gpxData: GPXData;
  currentPosition: number;
}

const Trail3DScene: React.FC<Trail3DSceneProps> = ({ gpxData, currentPosition }) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const { camera } = useThree();
  
  // Prepare trail data
  const trailData = useMemo(() => {
    if (!gpxData?.tracks?.[0]?.points) return null;
    
    const track = gpxData.tracks[0];
    const points = track.points;
    
    // Find bounds for normalization
    const bounds = {
      minLat: Math.min(...points.map(p => p.lat)),
      maxLat: Math.max(...points.map(p => p.lat)),
      minLon: Math.min(...points.map(p => p.lon)),
      maxLon: Math.max(...points.map(p => p.lon)),
      minEle: Math.min(...points.filter(p => p.ele).map(p => p.ele!)),
      maxEle: Math.max(...points.filter(p => p.ele).map(p => p.ele!))
    };
    
    // Normalize coordinates to a reasonable 3D space
    const scale = 100; // Scale factor for the 3D world
    const elevationScale = 0.1; // Scale down elevation changes
    
    const normalizedPoints = points.map(point => {
      const x = ((point.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) - 0.5) * scale;
      const z = ((point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat) - 0.5) * scale;
      const y = point.ele ? (point.ele - bounds.minEle) * elevationScale : 0;
      
      return new THREE.Vector3(x, y, z);
    });
    
    return {
      points: normalizedPoints,
      originalPoints: points,
      bounds,
      scale,
      elevationScale
    };
  }, [gpxData]);
  
  // Current position marker
  const currentPoint = useMemo(() => {
    if (!trailData) return null;
    
    const index = Math.floor((currentPosition / 100) * (trailData.points.length - 1));
    return trailData.points[index] || trailData.points[0];
  }, [trailData, currentPosition]);
  
  // Camera animation following the trail (slowed down 10x)
  useFrame(() => {
    if (!trailData || !currentPoint || !cameraRef.current) return;
    
    const index = Math.floor((currentPosition / 100) * (trailData.points.length - 1));
    const point = trailData.points[index];
    const nextIndex = Math.min(index + 5, trailData.points.length - 1);
    const nextPoint = trailData.points[nextIndex];
    
    if (point && nextPoint) {
      // Position camera slightly behind and above the current position
      const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
      const cameraPosition = point.clone()
        .add(direction.clone().multiplyScalar(-15)) // Behind the point
        .add(new THREE.Vector3(0, 8, 0)); // Above the point
      
      // Look at a point ahead on the trail
      const lookAtPoint = point.clone().add(direction.clone().multiplyScalar(10));
      
      // Slowed down interpolation (0.01 instead of 0.1)
      camera.position.lerp(cameraPosition, 0.01);
      camera.lookAt(lookAtPoint);
    }
  });
  
  if (!trailData) return null;
  
  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 20, 30]} />
      
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      
      {/* Trail line */}
      <Line
        points={trailData.points}
        color="#059669"
        lineWidth={3}
      />
      
      {/* Terrain with grid pattern */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[trailData.scale * 1.5, trailData.scale * 1.5, 32, 32]} />
        <meshLambertMaterial 
          color="#2d5016" 
          wireframe={false}
        />
      </mesh>
      
      {/* Grid lines for map feel */}
      <mesh position={[0, -4.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[trailData.scale * 1.5, trailData.scale * 1.5, 20, 20]} />
        <meshBasicMaterial 
          color="#4ade80" 
          wireframe={true}
          opacity={0.2}
          transparent
        />
      </mesh>
      
      {/* Current position marker */}
      {currentPoint && (
        <mesh position={currentPoint} castShadow>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
        </mesh>
      )}
      
      {/* Photo markers */}
      {gpxData.photos?.map((photo, index) => {
        if (!trailData) return null;
        
        // Find closest point on trail to photo
        let closestPoint = trailData.points[0];
        let minDistance = Infinity;
        
        trailData.originalPoints.forEach((point, i) => {
          const distance = Math.sqrt(
            Math.pow(point.lat - photo.lat, 2) + Math.pow(point.lon - photo.lon, 2)
          );
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = trailData.points[i];
          }
        });
        
        return (
          <group key={photo.id} position={closestPoint}>
            <mesh position={[0, 3, 0]} castShadow>
              <boxGeometry args={[2, 2, 2]} />
              <meshStandardMaterial color="#3b82f6" />
            </mesh>
            <Text
              position={[0, 6, 0]}
              fontSize={1.5}
              color="#3b82f6"
              anchorX="center"
              anchorY="middle"
            >
              📸
            </Text>
          </group>
        );
      })}
      
      {/* Trail markers every 10% */}
      {Array.from({ length: 11 }, (_, i) => {
        const progress = i * 10;
        const index = Math.floor((progress / 100) * (trailData.points.length - 1));
        const point = trailData.points[index];
        
        return (
          <group key={i} position={point}>
            <mesh position={[0, 1, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 2]} />
              <meshStandardMaterial color="#666666" />
            </mesh>
            <Text
              position={[0, 3, 0]}
              fontSize={1}
              color="#666666"
              anchorX="center"
              anchorY="middle"
            >
              {progress}%
            </Text>
          </group>
        );
      })}
      
      {/* Controls for manual navigation */}
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
};

export const Trail3D: React.FC<Trail3DProps> = ({ 
  gpxData, 
  currentPosition,
  onPhotosUpdate 
}) => {
  if (!gpxData || !gpxData.tracks.length) {
    return (
      <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">Nahrajte GPX soubor pro zobrazení 3D průletu</p>
      </div>
    );
  }
  
  return (
    <div className="w-full h-96 bg-black rounded-lg overflow-hidden">
      <Canvas shadows>
        <Trail3DScene gpxData={gpxData} currentPosition={currentPosition} />
      </Canvas>
    </div>
  );
};