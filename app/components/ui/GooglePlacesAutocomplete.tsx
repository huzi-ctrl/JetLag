'use client';

import { useState, useEffect, useRef } from 'react';
import { useGeolocation } from '../../hooks/useGeolocation';

interface SearchResult {
    id: string;
    text: string;
    place_name: string;
    center: [number, number]; // [lng, lat]
    context?: any[];
}

interface GooglePlacesAutocompleteProps {
    placeholder?: string;
    onSelect: (result: SearchResult) => void;
    autoFocus?: boolean;
    defaultValue?: string;
    biasLocation?: { latitude: number, longitude: number } | null;
}

declare global {
    interface Window {
        google: any;
        initGooglePlaces?: () => void;
    }
}

export default function GooglePlacesAutocomplete({ placeholder = "Search with Google...", onSelect, autoFocus = false, defaultValue = "", biasLocation }: GooglePlacesAutocompleteProps) {
    const [query, setQuery] = useState(defaultValue);
    const [predictions, setPredictions] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [scriptLoaded, setScriptLoaded] = useState(false);

    // Get User Location (fallback for Proximity Bias)
    const { location: gpsLocation } = useGeolocation();

    // Effective Location: Explicit Bias > GPS > Null
    const effectiveLocation = biasLocation || gpsLocation;

    // Services
    const autocompleteService = useRef<any>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isSelecting = useRef(false);

    // Load Script
    useEffect(() => {
        if (window.google?.maps?.places) {
            setScriptLoaded(true);
            return;
        }

        if (!document.getElementById('google-maps-script')) {
            const script = document.createElement('script');
            script.id = 'google-maps-script';
            // Added v=weekly to ensure 'Place' class is available. removed loading=async to be safe with standard loading
            script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places&v=weekly`;
            script.async = true;
            script.defer = true;
            script.onload = () => setScriptLoaded(true);
            document.head.appendChild(script);
        } else {
            // Poll for google object
            const interval = setInterval(() => {
                if (window.google?.maps?.places) {
                    setScriptLoaded(true);
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, []);

    // Init Services
    useEffect(() => {
        if (!scriptLoaded || !window.google?.maps?.places) return;

        if (!autocompleteService.current) {
            // Direct access - no importLibrary needed if script loaded with &libraries=places
            autocompleteService.current = new window.google.maps.places.AutocompleteService();
        }
    }, [scriptLoaded]);

    useEffect(() => {
        if (isSelecting.current) {
            isSelecting.current = false;
            return;
        }

        if (!query || query.length < 3 || !autocompleteService.current) {
            setPredictions([]);
            return;
        }

        const timer = setTimeout(() => {
            if (query === defaultValue && !isOpen) return;

            // Prepare Request
            const request: any = { input: query };

            // Add Location Bias if available
            if (effectiveLocation) {
                // Bias results to 5km radius of user (or biased target)
                request.locationBias = {
                    radius: 5000, // 5km
                    center: { lat: effectiveLocation.latitude, lng: effectiveLocation.longitude }
                };
            }

            // AutocompleteService call
            autocompleteService.current.getPlacePredictions(request, (predictions: any, status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                    setPredictions(predictions);
                    setIsOpen(true);
                } else {
                    setPredictions([]);
                }
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [query, scriptLoaded, defaultValue, isOpen, effectiveLocation]);


    const handleSelect = async (placeId: string, description: string) => {
        // Prevent useEffect from re-opening the menu
        isSelecting.current = true;
        try {
            // Use modern Place class directly from global namespace
            // This avoids the 'PlacesService' deprecation warning assuming we are on v=weekly
            const PlaceClass = window.google.maps.places.Place;

            if (PlaceClass) {
                const place = new PlaceClass({ id: placeId });
                // fetchFields is the new API
                await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });

                const loc = place.location;
                const lat = loc.lat();
                const lng = loc.lng();

                const result: SearchResult = {
                    id: placeId,
                    text: place.displayName || description,
                    place_name: place.formattedAddress || description,
                    center: [lng, lat]
                };

                setQuery(place.displayName || description);
                setIsOpen(false);
                onSelect(result);
            } else {
                // Fallback if Place class is inexplicably missing (older cached version?)
                console.warn("Place class not found, falling back to legacy PlacesService");
                const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));
                placesService.getDetails({
                    placeId: placeId,
                    fields: ['geometry', 'name', 'formatted_address']
                }, (place: any, status: any) => {
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && place.geometry) {
                        const lat = place.geometry.location.lat();
                        const lng = place.geometry.location.lng();

                        const result: SearchResult = {
                            id: placeId,
                            text: place.name || description,
                            place_name: place.formatted_address || description,
                            center: [lng, lat]
                        };

                        setQuery(place.name || description);
                        setIsOpen(false);
                        onSelect(result);
                    }
                });
            }

        } catch (e) {
            console.error("Error fetching place details:", e);
        }
    };

    return (
        <div className="relative w-full">
            <input
                ref={inputRef}
                type="text"
                className="w-full p-4 text-lg bg-slate-800 border-2 border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 shadow-inner"
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setIsOpen(true);
                }}
                autoFocus={autoFocus}
            />

            {!scriptLoaded && (
                <div className="absolute right-4 top-4 text-xs text-slate-500">Loading Google...</div>
            )}

            {isOpen && predictions.length > 0 && (
                <div className="absolute z-60 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-[50vh] overflow-y-auto">
                    {predictions.map((p: any) => (
                        <button
                            key={p.place_id}
                            className="w-full text-left p-4 hover:bg-slate-700 border-b border-slate-700 last:border-0 transition-colors"
                            onClick={() => handleSelect(p.place_id, p.description)}
                        >
                            <div className="font-bold text-white text-base">{p.structured_formatting?.main_text || p.description}</div>
                            <div className="text-xs text-slate-400 truncate font-mono mt-0.5">{p.structured_formatting?.secondary_text}</div>
                        </button>
                    ))}
                    <div className="p-2 text-right">
                        <img src="https://developers.google.com/static/maps/documentation/images/powered_by_google_on_non_white.png" alt="Powered by Google" className="inline-block h-4" />
                    </div>
                </div>
            )}
        </div>
    );
}
