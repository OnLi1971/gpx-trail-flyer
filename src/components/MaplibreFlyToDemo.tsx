import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@/components/ui/button';

export const MaplibreFlyToDemo: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Výchozí pozice (střed Evropy)
  const defaultPosition = {
    center: [15.0, 50.0] as [number, number],
    zoom: 5
  };

  // Pozice "fotky" (Praha)
  const photoPosition = {
    center: [14.4378, 50.0755] as [number, number],
    zoom: 15
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    // Inicializace mapy
    map.current = new Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json', // Bezplatný styl
      center: defaultPosition.center,
      zoom: defaultPosition.zoom,
    });

    // Přidání ovládacích prvků
    map.current.addControl(new NavigationControl(), 'top-right');

    // Událost po načtení mapy
    map.current.on('load', () => {
      console.log('Mapa je načtená a připravená');
      setIsInitialized(true);
    });

    // Cleanup
    return () => {
      map.current?.remove();
    };
  }, []);

  const flyToPhoto = () => {
    if (!map.current || !isInitialized) {
      console.log('Mapa není připravená');
      return;
    }

    console.log('Zoomuji na fotku:', photoPosition.center, photoPosition.zoom);
    
    map.current.flyTo({
      center: photoPosition.center,
      zoom: photoPosition.zoom,
      duration: 2000, // 2 sekundy
      essential: true
    });
  };

  const flyToDefault = () => {
    if (!map.current || !isInitialized) {
      console.log('Mapa není připravená');
      return;
    }

    console.log('Odzoomuji zpět:', defaultPosition.center, defaultPosition.zoom);
    
    map.current.flyTo({
      center: defaultPosition.center,
      zoom: defaultPosition.zoom,
      duration: 2000, // 2 sekundy
      essential: true
    });
  };

  return (
    <div className="w-full h-screen relative">
      {/* Mapa */}
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Ovládací tlačítka */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <Button 
          onClick={flyToPhoto}
          disabled={!isInitialized}
          variant="default"
          className="bg-primary text-primary-foreground"
        >
          Zazoomuj na fotku
        </Button>
        <Button 
          onClick={flyToDefault}
          disabled={!isInitialized}
          variant="outline"
        >
          Odzoomuj zpět
        </Button>
        
        {/* Status indikátor */}
        <div className="text-xs bg-background/80 p-2 rounded">
          Status: {isInitialized ? 'Připraveno' : 'Načítá...'}
        </div>
      </div>
    </div>
  );
};