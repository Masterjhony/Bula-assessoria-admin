'use client';

import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@excalidraw/excalidraw/index.css';

const STORAGE_KEY = 'formula-boi-whiteboard-v1';

// Excalidraw must be loaded client-side only
const ExcalidrawWrapper = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw');
    const { Excalidraw } = mod;

    // eslint-disable-next-line react/display-name
    return function ExcalidrawComponent(props: {
      onChange: (elements: readonly any[], appState: any) => void;
      initialData: any;
    }) {
      return (
        <Excalidraw
          initialData={props.initialData}
          onChange={props.onChange}
          theme="dark"
          UIOptions={{
            canvasActions: {
              loadScene: false,
            },
          }}
        />
      );
    };
  },
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#f9fafb] dark:bg-[#0D0D0D]">
        <div className="w-12 h-12 border-4 border-[#A68B4B] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-gray-500 font-medium">Carregando Lousa...</div>
      </div>
    ),
  }
);

export const WhiteboardView = React.memo(function WhiteboardView() {
  const [initialData, setInitialData] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setInitialData({
          elements: parsed.elements || [],
          appState: {
            ...parsed.appState,
            collaborators: undefined, // Remove collaborators to avoid issues
          },
        });
      } else {
        setInitialData({ elements: [], appState: {} });
      }
    } catch {
      setInitialData({ elements: [], appState: {} });
    }
    setIsLoaded(true);
  }, []);

  // Debounced save to localStorage
  const handleChange = useCallback((elements: readonly any[], appState: any) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const dataToSave = {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            currentItemFontFamily: appState.currentItemFontFamily,
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
          },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      } catch {
        // localStorage full or unavailable, silently ignore
      }
    }, 500);
  }, []);

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#f9fafb] dark:bg-[#0D0D0D]">
        <div className="w-12 h-12 border-4 border-[#A68B4B] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-gray-500 font-medium">Carregando Lousa...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-[calc(100vh-200px)] min-h-[600px] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden relative">
      <div className="absolute inset-0 w-full h-full">
        <ExcalidrawWrapper
          initialData={initialData}
          onChange={handleChange}
        />
      </div>
    </div>
  );
});
