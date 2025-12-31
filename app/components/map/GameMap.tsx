'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabase';
import { useGeolocation } from '../../hooks/useGeolocation';
import { calculateDeductionMask, QuestionEvent } from '../../lib/deduction';
import { circle } from '@turf/turf';
import { createWorldMask, createBisectorLine, createBisectorPolygon } from '../../lib/geo_utils';

interface GameMapProps {
    viewMode: 'simple' | 'game';
    userRole?: 'seeker' | 'hider';
    userId?: string;
    gameId?: string;
    mapboxToken: string;
    gameConfig?: {
        size: 'small' | 'medium' | 'large';
        location: { center: [number, number] };
        debugMode?: boolean;
    };
    isOccluded?: boolean;
    hidingSpot?: { type: string, coordinates: number[] } | null;
}

export default function GameMap({ viewMode, userRole, userId, gameId, mapboxToken, gameConfig, isOccluded, hidingSpot }: GameMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [lng, setLng] = useState(gameConfig?.location.center[0] || -0.1278); // Default to London or Config
    const [lat, setLat] = useState(gameConfig?.location.center[1] || 51.5074);
    const [zoom, setZoom] = useState(viewMode === 'simple' ? 11 : 14);

    // Deduction State
    const [deductionHistory, setDeductionHistory] = useState<QuestionEvent[]>([]);
    const [deductionMask, setDeductionMask] = useState<GeoJSON.FeatureCollection | null>(null);
    // Manual Masks State
    const [manualMasks, setManualMasks] = useState<GeoJSON.FeatureCollection | null>(null);

    // Geolocation Hook
    // Optimization: Allow 10s old cached position for instant load, then refine
    const { location: userLocation, error: gpsError, loading: gpsLoading } = useGeolocation({
        enabled: true,
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000 // Accept positions up to 10s old for instant fix
    });

    // --- RENDER DEDUCTION MASK (Safe Refactor) ---
    // Includes Debug Lines
    // --- RENDER DEDUCTION MASK (Safe Refactor) ---
    // Includes Debug Lines
    const updateDeductionMask = () => {
        if (!map.current) return;
        // Relaxed check: Only return if style is definitely missing (unlikely if map exists)
        // We use try-catch to handle "layer not found" or "style not loaded" errors gracefully.

        try {
            if (deductionMask) {
                const source = map.current.getSource('deduction-mask') as mapboxgl.GeoJSONSource;
                if (source) {
                    source.setData(deductionMask);
                } else {
                    console.log("Initializing Deduction Source/Layer...");
                    if (!map.current.getLayer('deduction-fill')) {
                        // Double check style loaded to avoid "Style is not done loading" error
                        if (!map.current.isStyleLoaded()) {
                            console.warn("DeductionMask: Style not loaded yet, skipping init.");
                            return;
                        }

                        map.current.addSource('deduction-mask', { type: 'geojson', data: deductionMask });

                        map.current.addLayer({
                            id: 'deduction-fill',
                            type: 'fill',
                            source: 'deduction-mask',
                            paint: {
                                'fill-color': '#0f172a', // Match World Mask
                                'fill-opacity': 0.5 // REDUCED OPACITY FOR DEBUGGING
                            }
                        });

                        map.current.addLayer({
                            id: 'deduction-outline',
                            type: 'line',
                            source: 'deduction-mask',
                            paint: {
                                'line-color': '#06b6d4',
                                'line-width': 3,
                                'line-dasharray': [2, 1],
                                'line-opacity': 0.8
                            }
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Error updating deduction mask:", e);
        }
    };

    const updateDebugLines = () => {
        if (!map.current) return;

        try {
            // Generate features (even if empty)
            const thermos = deductionHistory.filter(e => e.type === 'THERMOMETER');
            console.log("DebugLines: Total Thermometers found:", thermos.length);

            const points: GeoJSON.Feature<GeoJSON.Point>[] = [];
            const lines = thermos
                .filter(e => {
                    const hasParams = e.params && e.params.start && e.params.end;
                    return hasParams;
                })
                .flatMap(e => {
                    let s = [Number(e.params.start[0]), Number(e.params.start[1])] as [number, number];
                    let end = [Number(e.params.end[0]), Number(e.params.end[1])] as [number, number];



                    // Add Debug Points
                    const mid = [(s[0] + end[0]) / 2, (s[1] + end[1]) / 2];
                    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: s }, properties: { type: 'START' } });
                    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: end }, properties: { type: 'END' } });
                    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: mid }, properties: { type: 'MID' } });

                    return [createBisectorLine(s, end)];
                });

            console.log("DebugLines: Generated Features:", lines.length + points.length);

            const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [...lines, ...points] };

            const source = map.current.getSource('debug-lines') as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(fc);
            } else {
                console.log("DebugLines: Creating Layer (Pink)");
                if (!map.current.isStyleLoaded()) {
                    console.warn("DebugLines: Style not loaded yet, skipping init.");
                    return;
                }

                if (!map.current.getLayer('debug-lines-layer')) {
                    map.current.addSource('debug-lines', { type: 'geojson', data: fc });

                    // LINE LAYER
                    map.current.addLayer({
                        id: 'debug-lines-layer',
                        type: 'line',
                        source: 'debug-lines',
                        filter: ['==', '$type', 'LineString'], // Only lines
                        paint: {
                            'line-color': '#ff00ff',
                            'line-width': 4,
                            'line-dasharray': [2, 2]
                        }
                    });

                    // POINTS LAYER
                    map.current.addLayer({
                        id: 'debug-points-layer',
                        type: 'circle',
                        source: 'debug-lines',
                        filter: ['==', '$type', 'Point'], // Only points
                        paint: {
                            'circle-radius': 6,
                            'circle-color': [
                                'match',
                                ['get', 'type'],
                                'START', '#00ff00', // Green
                                'END', '#ff0000',   // Red
                                'MID', '#ffffff',   // White
                                '#ffff00'           // Default Yellow
                            ],
                            'circle-stroke-width': 2,
                            'circle-stroke-color': '#000000'
                        }
                    });
                }
            }
        } catch (e) {
            console.error("Error updating debug lines:", e);
        }
    };

    // Debug Positive State
    const [debugShowPositive, setDebugShowPositive] = useState(false);
    const toggleDebugPositive = () => setDebugShowPositive(!debugShowPositive);

    const updateDebugPositive = () => {
        if (!map.current) return;
        if (!debugShowPositive) {
            if (map.current.getLayer('debug-positive-fill')) map.current.removeLayer('debug-positive-fill');
            if (map.current.getSource('debug-positive')) map.current.removeSource('debug-positive');
            return;
        }

        try {
            // Generate features (even if empty)
            const thermos = deductionHistory.filter(e => e.type === 'THERMOMETER');

            const polys = thermos.map(e => {
                const s = [Number(e.params.start[0]), Number(e.params.start[1])] as [number, number];
                const end = [Number(e.params.end[0]), Number(e.params.end[1])] as [number, number];

                // Recreate the logic from deduction.ts for "Positive" area
                // If Answer=YES (Hotter) -> Bisector(Start->End)
                // If Answer=NO (Colder) -> Bisector(End->Start)
                const isHotter = e.answer;

                // Note: The visual Sim always sets answer=false (Colder)
                if (isHotter) return createBisectorPolygon(s, end);
                else return createBisectorPolygon(end, s);
            });

            const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: polys };

            const source = map.current.getSource('debug-positive') as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(fc);
            } else {
                if (map.current.isStyleLoaded()) {
                    map.current.addSource('debug-positive', { type: 'geojson', data: fc });
                    map.current.addLayer({
                        id: 'debug-positive-fill',
                        type: 'fill',
                        source: 'debug-positive',
                        paint: {
                            'fill-color': '#00ffff', // Cyan
                            'fill-opacity': 0.3
                        }
                    });
                }
            }

        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        updateDebugPositive();
    }, [debugShowPositive, deductionHistory]);

    // --- RENDER REGION MASK (Safe Refactor) ---
    const updateRegionMask = () => {
        if (!map.current || !gameConfig) return;

        try {
            // Size to Radius Mapping
            // Size to Radius Mapping
            const radiusMap = {
                'small': 5,      // Increased from 3.2
                'medium': 15,    // Increased from 8
                'large': 40      // Increased from 20
            };
            const r = radiusMap[gameConfig.size] || 15;
            const maskGeoJSON = createWorldMask(gameConfig.location.center, r);

            const source = map.current.getSource('region-mask') as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(maskGeoJSON);
            } else {
                if (!map.current.isStyleLoaded()) {
                    console.warn("RegionMask: Style not loaded yet, skipping init.");
                    return;
                }
                if (!map.current.getLayer('region-mask-fill')) {
                    map.current.addSource('region-mask', { type: 'geojson', data: maskGeoJSON });
                    map.current.addLayer({
                        id: 'region-mask-fill',
                        type: 'fill',
                        source: 'region-mask',
                        paint: { 'fill-color': '#0f172a', 'fill-opacity': 0.85 }
                    });
                    map.current.addLayer({
                        id: 'region-mask-outline',
                        type: 'line',
                        source: 'region-mask',
                        paint: { 'line-color': '#06b6d4', 'line-width': 3, 'line-dasharray': [2, 1], 'line-opacity': 0.8 }
                    });
                }
            }
        } catch (e) {
            console.error("Error updating region mask:", e);
        }
    };

    // Effect: History/Mask Change
    // Effect: History/Mask Change
    useEffect(() => {
        console.log("Processing Deduction History:", deductionHistory.length, deductionHistory);
        if (deductionHistory.length > 0) {
            const mask = calculateDeductionMask(deductionHistory);
            console.log("Generated Mask Feature Count:", mask?.features.length);
            setDeductionMask(mask);
        } else {
            console.log("Clearing Deduction Mask");
            setDeductionMask(null);
            // Force clear the source data if it exists
            if (map.current) {
                const source = map.current.getSource('deduction-mask') as mapboxgl.GeoJSONSource;
                if (source) source.setData({ type: 'FeatureCollection', features: [] });
            }
        }
    }, [deductionHistory]);

    const [styleLoadCount, setStyleLoadCount] = useState(0);

    // Effect: Listen for Style Data changes
    useEffect(() => {
        if (!map.current) return;
        const onStyleData = () => {
            if (map.current?.isStyleLoaded()) {
                setStyleLoadCount(c => c + 1);
            }
        };
        map.current.on('styledata', onStyleData);
        return () => { map.current?.off('styledata', onStyleData); };
    }, []);

    const updateHiderJail = () => {
        if (!map.current) return;
        const JAIL_SOURCE_ID = 'hider-jail-source';
        const JAIL_LAYER_ID = 'hider-jail-layer';
        const JAIL_LINE_ID = 'hider-jail-line';

        if (hidingSpot && userRole === 'hider') {
            if (!hidingSpot.coordinates) {
                console.warn("HidingSpot missing coordinates (likely WKB):", hidingSpot);
                return;
            }
            const center = hidingSpot.coordinates;
            // 0.25 miles in km = ~0.402km
            const radiusKm = 0.402336;
            const jailCircle = circle(center, radiusKm, { steps: 64, units: 'kilometers' });

            const source = map.current.getSource(JAIL_SOURCE_ID) as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(jailCircle);
            } else {
                if (!map.current.isStyleLoaded()) return;

                map.current.addSource(JAIL_SOURCE_ID, { type: 'geojson', data: jailCircle });

                // Fill (faint)
                map.current.addLayer({
                    id: JAIL_LAYER_ID,
                    type: 'fill',
                    source: JAIL_SOURCE_ID,
                    paint: {
                        'fill-color': '#eab308', // Yellow
                        'fill-opacity': 0.1
                    }
                });

                // Dashed Border
                map.current.addLayer({
                    id: JAIL_LINE_ID,
                    type: 'line',
                    source: JAIL_SOURCE_ID,
                    paint: {
                        'line-color': '#eab308',
                        'line-width': 4,
                        'line-dasharray': [2, 2],
                        'line-opacity': 0.8
                    }
                });
            }
        } else {
            // Cleanup
            if (map.current.getLayer(JAIL_LAYER_ID)) map.current.removeLayer(JAIL_LAYER_ID);
            if (map.current.getLayer(JAIL_LINE_ID)) map.current.removeLayer(JAIL_LINE_ID);
            if (map.current.getSource(JAIL_SOURCE_ID)) map.current.removeSource(JAIL_SOURCE_ID);
        }
    };

    // Update Jail on render/change
    useEffect(() => {
        updateHiderJail();
    }, [hidingSpot, userRole]);

    // Effect: Update Layers when count changes (Style Reloaded) OR Data changes
    useEffect(() => {
        updateRegionMask();
        updateDeductionMask();
        updateDebugLines();
    }, [styleLoadCount, gameConfig, deductionMask, deductionHistory]);

    // Update items on map load/change
    useEffect(() => {
        if (!map.current) return;
        updateDeductionMask();
        updateDebugLines();
        updateHiderJail();
    }, [deductionMask, viewMode, hidingSpot]);

    // FALLBACK: Mobile browsers sometimes miss the styledata event or report ready too early.
    // Check periodically for the first few seconds.
    useEffect(() => {
        const interval = setInterval(() => {
            if (map.current && map.current.isStyleLoaded()) {
                // Force update if layers are missing
                if (!map.current.getLayer('region-mask-fill')) updateRegionMask();
                if (deductionMask && !map.current.getLayer('deduction-fill')) updateDeductionMask();
                if (manualMasks && !map.current.getLayer('manual-masks-fill')) updateManualMasks(); // New Check
                if (!map.current.getLayer('debug-lines-layer')) updateDebugLines();
            }
        }, 1000);

        // Clear after 10 seconds (should be stable by then)
        const timeout = setTimeout(() => clearInterval(interval), 10000);

        return () => { clearInterval(interval); clearTimeout(timeout); };
    }, [gameConfig, deductionMask, manualMasks]);


    // Render Manual Masks
    const updateManualMasks = () => {
        if (!map.current || !manualMasks) return;

        const SOURCE = 'manual-masks-source';
        const LAYER_FILL = 'manual-masks-fill';
        const LAYER_LINE = 'manual-masks-line';

        try {
            const source = map.current.getSource(SOURCE) as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(manualMasks);
            } else {
                if (!map.current.isStyleLoaded()) return;

                map.current.addSource(SOURCE, { type: 'geojson', data: manualMasks });

                map.current.addLayer({
                    id: LAYER_FILL,
                    type: 'fill',
                    source: SOURCE,
                    paint: {
                        'fill-color': '#3b82f6', // Bright Blue
                        'fill-opacity': 0.2
                    }
                });

                map.current.addLayer({
                    id: LAYER_LINE,
                    type: 'line',
                    source: SOURCE,
                    paint: {
                        'line-color': '#60a5fa',
                        'line-width': 2,
                        'line-dasharray': [4, 2],
                        'line-opacity': 0.8
                    }
                });
            }
        } catch (e) {
            console.error("Error updating manual masks:", e);
        }
    };

    useEffect(() => {
        updateManualMasks();
    }, [manualMasks]);

    // Live Deduction Subscription (+ Map Events)
    useEffect(() => {
        if (!gameId || viewMode !== 'game') return;

        console.log("Subscribing to questions for game:", gameId);

        const channel = supabase
            .channel(`deduction-questions-${gameId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `game_id=eq.${gameId}` }, (payload) => {
                console.log("Question update:", payload);
                fetchHistory();
            })
            // Subscribe to Manual Masks
            .on('postgres_changes', { event: '*', schema: 'public', table: 'map_events', filter: `game_id=eq.${gameId}` }, () => {
                fetchMapEvents();
            })
            .subscribe();

        const fetchHistory = async () => {
            const { data } = await supabase
                .from('questions')
                .select('*')
                .eq('game_id', gameId)
                .in('status', ['answered']); // Only answered questions affect mask? Or pending too? Usually only Answered.

            // Note: If we want to show "Pending" as well (maybe distinct color), we can.
            // For Deduction MASK, we need Answered.

            if (data) {
                const events: QuestionEvent[] = data.map((q: any) => {
                    const type = q.category.toUpperCase();
                    // Parse answer text: YES/HOTTER -> true, NO/COLDER -> false
                    const ansText = (q.answer_text || '').toUpperCase();
                    const answer = ansText.includes('YES') || ansText.includes('HOTTER');

                    return {
                        id: q.id,
                        type: type,
                        params: q.params,
                        answer: answer,
                        timestamp: new Date(q.created_at).getTime()
                    };
                }).filter(e => e.type === 'RADAR' || e.type === 'THERMOMETER' || e.type === 'TRAVEL_AGENT');


                setDeductionHistory(events);
            }
        };

        const fetchMapEvents = async () => {
            const { data } = await supabase
                .from('map_events')
                .select('*')
                .eq('game_id', gameId)
                .eq('type', 'manual_mask');

            if (data) {
                const features = data.map((e: any) => ({
                    type: 'Feature',
                    geometry: e.geometry,
                    properties: { id: e.id, label: e.label }
                }));
                setManualMasks({ type: 'FeatureCollection', features: features } as any);
            }
        };

        // Combine fetches
        const loadAll = async () => {
            await fetchHistory();
            await fetchMapEvents();
        }

        loadAll();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [gameId, viewMode]); // Deduction static history only

    // Debug: Simulate Questions
    const addMockDeduction = (type: 'YES' | 'NO') => {
        const newEvent: QuestionEvent = {
            id: Date.now().toString(),
            type: 'RADAR',
            params: { center: [lng, lat], radius: 1000 }, // 1km radius at current center
            answer: type === 'YES',
            timestamp: Date.now()
        };
        setDeductionHistory(prev => [...prev, newEvent]);
    };
    const [isTracking, setIsTracking] = useState(false);
    const [gpsErrorState, setGpsErrorState] = useState<string | null>(null); // Renamed to avoid conflict with geoError from hook

    const handleGeolocate = () => {
        if (!map.current) return;
        setIsTracking(true);
        setGpsErrorState(null);

        // 1. Instant FlyTo if we already have location
        if (userLocation) {
            map.current.flyTo({
                center: [userLocation.longitude, userLocation.latitude],
                zoom: 17,
                speed: 4, // Faster fly speed (default 1.2)
                curve: 1 // Linear curve for faster feel
            });
            setIsTracking(false);
            return;
        }

        // 2. Fallback to manual check
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                map.current?.flyTo({
                    center: [pos.coords.longitude, pos.coords.latitude],
                    zoom: 17
                });
                setIsTracking(false);
            },
            (err) => {
                console.warn("GPS Error", err);
                setIsTracking(false);
                setGpsErrorState('Check Permissions'); // Use gpsErrorState here
                setTimeout(() => setGpsErrorState(null), 4000); // Use gpsErrorState here
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    };

    // Track viewMode in a ref so the rotation loop can see the current value
    const viewModeRef = useRef(viewMode);
    useEffect(() => {
        viewModeRef.current = viewMode;
    }, [viewMode]);

    // Initialize Map
    useEffect(() => {
        if (map.current) return;
        if (!mapboxToken) return;

        mapboxgl.accessToken = mapboxToken;
        // Start with Simple 10, or Game 13
        const isSimple = viewMode === 'simple';

        map.current = new mapboxgl.Map({
            container: mapContainer.current!,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [lng, lat],
            zoom: isSimple ? 10 : 13,
            pitch: 45,
            interactive: !isSimple,
            attributionControl: false
        });

        if (!isSimple) {
            map.current.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right');
        }

        map.current.on('style.load', () => {
            // Add Fog
            map.current?.setFog({
                'range': [0.5, 10],
                'color': 'rgb(10, 10, 15)',
                'horizon-blend': 0.1
            });

            // Add Deduction Source & Layer (Initialize Empty)
            if (!map.current?.getSource('deduction-mask')) {
                map.current?.addSource('deduction-mask', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                map.current?.addLayer({
                    id: 'deduction-fill',
                    type: 'fill',
                    source: 'deduction-mask',
                    paint: {
                        'fill-color': '#0f172a', // Match World Mask
                        'fill-opacity': 0.85
                    }
                });

                map.current?.addLayer({
                    id: 'deduction-outline',
                    type: 'line',
                    source: 'deduction-mask',
                    paint: {
                        'line-color': '#06b6d4',
                        'line-width': 3,
                        'line-dasharray': [2, 1],
                        'line-opacity': 0.8
                    }
                });
            }
        });

        // Rotation Logic
        const rotate = () => {
            // Check the Ref, not the stale closure variable
            if (!map.current || viewModeRef.current !== 'simple') return;

            map.current.easeTo({
                bearing: map.current.getBearing() + 10,
                duration: 20000,
                easing: (t) => t
            });
        };

        // Only attach if initially simple, but the 'idle' event persists.
        // We rely on the check inside `rotate` to stop it.
        map.current.on('idle', rotate);

        map.current.on('move', () => {
            if (!map.current) return;
            setLng(Number(map.current.getCenter().lng.toFixed(4)));
            setLat(Number(map.current.getCenter().lat.toFixed(4)));
            setZoom(Number(map.current.getZoom().toFixed(2)));
        });

        // Debug: Teleport on Click
        map.current.on('click', (e) => {
            if (localStorage.getItem('mock_gps')) {
                const { lng, lat } = e.lngLat;
                localStorage.setItem('mock_gps', JSON.stringify({ latitude: lat, longitude: lng }));
                window.dispatchEvent(new Event('mock-gps-update'));

                // Visual feedback (optional ripple/dot, but useGeolocation handles the main dot)
                console.log("Teleported to:", lat, lng);
            }
        });
    }, [mapboxToken]); // Only run once on mount

    // React to ViewMode Changes (Fixing the "Cannot manipulate map" issue)
    useEffect(() => {
        if (!map.current) return;

        if (viewMode === 'game') {
            // STOP ROTATION explicitly
            map.current.stop();

            // Enable handlers
            map.current.boxZoom.enable();
            map.current.scrollZoom.enable();
            map.current.dragPan.enable();
            map.current.dragRotate.enable();
            map.current.keyboard.enable();
            map.current.doubleClickZoom.enable();
            map.current.touchZoomRotate.enable();

            // Fly to location if we have it and just started game
            if (userLocation) {
                // If it's the very first load, maybe jump? Or fast fly.
                map.current.flyTo({
                    center: [userLocation.longitude, userLocation.latitude],
                    zoom: 16,
                    speed: 5, // Very fast
                    essential: true
                });
            }
        } else {
            // Disable handlers for Simple mode
            map.current.boxZoom.disable();
            map.current.scrollZoom.disable();
            map.current.dragPan.disable();
            map.current.dragRotate.disable();
            map.current.keyboard.disable();
            map.current.doubleClickZoom.disable();
            map.current.touchZoomRotate.disable();
            // Zoom out
            map.current.flyTo({ zoom: 10 });

            // Re-trigger rotation?
            // Since the 'idle' listener is still there, it will check the Ref (now 'simple') and restart.
            // We just need to nudge it.
            map.current.fire('idle');
        }
    }, [viewMode, userLocation]); // Add userLocation so we fly there once when game starts

    // Sync My Location Dot
    const markerRef = useRef<mapboxgl.Marker | null>(null);
    useEffect(() => {
        if (!map.current || !userLocation) return;

        if (!markerRef.current) {
            const el = document.createElement('div');
            el.className = 'w-4 h-4 bg-primary rounded-full border-2 border-white shadow-lg pulse-ring';
            markerRef.current = new mapboxgl.Marker(el)
                .setLngLat([userLocation.longitude, userLocation.latitude])
                .addTo(map.current);
        } else {
            markerRef.current.setLngLat([userLocation.longitude, userLocation.latitude]);
        }
    }, [userLocation]);


    return (
        <div className="relative w-full h-full">
            <div ref={mapContainer} className="w-full h-full absolute inset-0 z-0" />

            {/* Debug Deduction Controls (Only in Game Mode AND Debug Mode) */}
            {viewMode === 'game' && gameConfig?.debugMode && !isOccluded && (
                <div className="absolute top-48 left-4 z-50 flex flex-col gap-2 pointer-events-auto">
                    <div className="text-[10px] font-bold text-white/50 uppercase bg-black/50 px-2 rounded">
                        DEBUG: {deductionHistory.length} Evts | {deductionHistory.filter(e => e.type === 'THERMOMETER').length} Thermo
                    </div>
                    {/* 
                     Show explicit connection status if needed 
                    */}
                    <button
                        onClick={() => addMockDeduction('YES')}
                        className="bg-green-600/80 text-white text-xs px-3 py-2 rounded-lg font-bold backdrop-blur hover:bg-green-600"
                    >
                        Sim: Radar (Yes)
                    </button>
                    {/* NEW: Sim Thermo */}
                    <button
                        onClick={() => {
                            const c = map.current?.getCenter();
                            if (!c) return;
                            const newEvent: QuestionEvent = {
                                id: Date.now().toString(),
                                type: 'THERMOMETER',
                                params: {
                                    start: [c.lng, c.lat],
                                    end: [c.lng + 0.01, c.lat + 0.01]
                                },
                                answer: false,
                                timestamp: Date.now()
                            };
                            setDeductionHistory(prev => [...prev, newEvent]);
                        }}
                        className="bg-orange-600/80 text-white text-xs px-3 py-2 rounded-lg font-bold backdrop-blur hover:bg-orange-600"
                    >
                        Sim: Thermo
                    </button>
                    <button
                        onClick={() => setDeductionHistory([])}
                        className="bg-slate-600/80 text-white text-xs px-3 py-2 rounded-lg font-bold backdrop-blur hover:bg-slate-600 border border-slate-400"
                    >
                        RESET DEDUCTIONS
                    </button>

                    {/* GPS SIMULATOR */}
                    <button
                        onClick={() => {
                            if (localStorage.getItem('mock_gps')) {
                                localStorage.removeItem('mock_gps');
                                window.dispatchEvent(new Event('mock-gps-update'));
                            } else {
                                alert("TELEDART ACTIVE: Tap map to teleport.");
                                if (map.current) {
                                    // Default center
                                    const c = map.current.getCenter();
                                    localStorage.setItem('mock_gps', JSON.stringify({ latitude: c.lat, longitude: c.lng }));
                                    window.dispatchEvent(new Event('mock-gps-update'));
                                }
                            }
                        }}
                        className={`text-xs px-3 py-2 rounded-lg font-bold backdrop-blur border-2
                            ${userLocation && localStorage.getItem('mock_gps') ? 'bg-purple-600/80 border-purple-400 text-white animate-pulse' : 'bg-slate-800/80 border-transparent text-slate-400'}
                        `}
                    >
                        {localStorage.getItem('mock_gps') ? 'DISABLE SIM' : 'ENABLE SIM'}
                    </button>

                    {/* Force Update Button */}
                    <button
                        onClick={() => { updateRegionMask(); updateDeductionMask(); updateDebugLines(); }}
                        className="bg-pink-600/80 text-white text-xs px-3 py-2 rounded-lg font-bold"
                    >
                        FORCE REDRAW
                    </button>

                    {/* TEST LINE */}
                    <button
                        onClick={() => {
                            if (!map.current) return;
                            const c = map.current.getCenter();
                            // Create a line crossing the center
                            const l1 = [c.lng - 0.01, c.lat - 0.01];
                            const l2 = [c.lng + 0.01, c.lat + 0.01];
                            const fc = {
                                type: 'FeatureCollection',
                                features: [{
                                    type: 'Feature',
                                    geometry: { type: 'LineString', coordinates: [l1, l2] },
                                    properties: {}
                                }]
                            } as any;

                            const source = map.current.getSource('debug-lines') as mapboxgl.GeoJSONSource;
                            if (source) {
                                source.setData(fc);
                                console.log("Test Line Injected");
                            } else {
                                alert("Layer missing!");
                            }
                        }}
                        className="bg-purple-600/80 text-white text-xs px-3 py-2 rounded-lg font-bold"
                    >
                        TEST LINE
                    </button>

                    {/* SHOW POSITIVE DEBUG */}
                    <button
                        onClick={() => toggleDebugPositive()}
                        className={`text-xs px-3 py-2 rounded-lg font-bold border-2 ${debugShowPositive ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-700 border-slate-500 text-slate-300'}`}
                    >
                        DEBUG POSITIVE: {debugShowPositive ? 'ON' : 'OFF'}
                    </button>
                </div>
            )}

            {/* Status Bar - RESTORED TO TOP LEFT (User Request) */}
            {viewMode === 'game' && !isOccluded && (
                <div
                    className="absolute top-safe left-4 z-50 flex items-center gap-2 pointer-events-none mt-2"
                >
                    {/* Detailed Mode View */}
                    <div className="glass-panel px-4 py-3 flex flex-col items-start gap-1 pointer-events-auto bg-white/95 shadow-xl border-l-4 border-l-primary w-40">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${userRole === 'hider' ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                            <span className="font-black text-sm text-slate-800 tracking-wide uppercase">{userRole}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                            {lat.toFixed(4)}, {lng.toFixed(4)}
                        </div>
                        {(gpsErrorState || gpsError) && (
                            <span className="text-red-500 text-[10px] font-bold animate-pulse mt-1">
                                {gpsError || 'Searching GPS...'}
                            </span>
                        )}
                    </div>

                    {/* GPS Button (Keep near controls) */}
                    <button
                        onClick={handleGeolocate}
                        className={`p-3 rounded-full shadow-lg transition-all pointer-events-auto ml-2 ${isTracking ? 'bg-primary text-white animate-spin' : 'bg-white text-slate-700'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};
