'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { circle } from '@turf/turf';
import GooglePlacesAutocomplete from '../../ui/GooglePlacesAutocomplete';

interface ManualMaskToolProps {
    gameId: string;
    userId: string;
    userLocation: { latitude: number, longitude: number } | null;
    onMaskCreated: () => void;
}

export default function ManualMaskTool({ gameId, userId, userLocation, onMaskCreated }: ManualMaskToolProps) {
    const [radius, setRadius] = useState<number>(1); // km
    const [isCreating, setIsCreating] = useState(false);
    const [customCenter, setCustomCenter] = useState<{ lat: number, lng: number, label: string } | null>(null);

    const handleCreateMask = async () => {
        const center = customCenter
            ? [customCenter.lng, customCenter.lat]
            : (userLocation ? [userLocation.longitude, userLocation.latitude] : null);

        if (!center) return alert("No location selected! Wait for GPS or search for a place.");

        setIsCreating(true);

        try {
            // Create Circle Geometry using Turf
            const options = { steps: 64, units: 'kilometers' as const };
            const maskGeo = circle(center, radius, options);

            // Insert into map_events
            const { error } = await supabase
                .from('map_events')
                .insert({
                    game_id: gameId,
                    created_by: userId,
                    type: 'manual_mask',
                    geometry: maskGeo.geometry, // GeoJSON Geometry
                    label: `Mask: ${customCenter ? customCenter.label : 'Current Location'} (${radius}km)`,
                    color: '#3b82f6' // Blue
                });

            if (error) throw error;

            onMaskCreated();
            alert("Mask Created!");
        } catch (e: any) {
            alert("Error: " + e.message);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl">
            <h3 className="text-white font-bold text-sm mb-3 uppercase tracking-widest">Create Manual Mask</h3>

            {/* Center Selection */}
            <div className="mb-4">
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Center Point</label>
                <GooglePlacesAutocomplete
                    placeholder="Search location (or leave empty for GPS)"
                    onSelect={(val) => setCustomCenter({ lat: val.center[1], lng: val.center[0], label: val.text })}
                />
                {!customCenter && userLocation && (
                    <div className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                        <span>📍</span> Using Current GPS Location
                    </div>
                )}
            </div>

            <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Radius</span>
                    <span className="text-white font-mono">{radius.toFixed(1)} km</span>
                </div>
                <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={radius}
                    onChange={(e) => setRadius(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>

            <button
                onClick={handleCreateMask}
                disabled={isCreating || (!userLocation && !customCenter)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase text-xs tracking-wider"
            >
                {isCreating ? 'Creating...' : 'DROP MASK'}
            </button>
        </div>
    );
}
