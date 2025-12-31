'use client';

import { useState } from 'react';

interface GameSettingsFormProps {
    mapboxToken: string;
    onStart: (settings: GameSettings) => void;
    onCancel: () => void;
}

export interface GameSettings {
    size: 'small' | 'medium' | 'large';
    hidingTime: number; // minutes
    location: {
        name: string;
        center: [number, number]; // [lng, lat]
    };
    debugMode?: boolean;
}

export default function GameSettingsForm({ mapboxToken, onStart, onCancel }: GameSettingsFormProps) {
    const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
    const [hidingTime, setHidingTime] = useState(30);
    const [debugMode, setDebugMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<GameSettings['location'] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery) return;
        setLoading(true);
        try {
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&types=place,locality,neighborhood`);
            const data = await res.json();
            setSearchResults(data.features || []);
        } catch (e) {
            console.error("Geocoding error", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center mb-6">
                <h2 className="text-3xl font-black italic text-primary">FLIGHT PLAN</h2>
                <p className="text-slate-500 font-bold text-sm">Configure your session</p>
            </div>

            {/* 1. Game Size */}
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Game Size / Complexity</label>
                <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setSize(s)}
                            className={`py-3 rounded-xl border-2 font-bold uppercase transition-all
                                ${size === s ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-400 hover:border-slate-300'}
                            `}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-slate-400 font-medium text-center">
                    {size === 'small' && "Short range. Lower bonuses. Quick games."}
                    {size === 'medium' && "Balanced range. Standard bonuses."}
                    {size === 'large' && "Wide area. High value time bonuses."}
                </p>
            </div>

            {/* 2. Hiding Time */}
            <div className="space-y-2">
                <div className="flex justify-between items-end">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Hiding Time</label>
                    <span className="text-xl font-black text-slate-800">{hidingTime}m</span>
                </div>
                <input
                    type="range"
                    min={15}
                    max={240}
                    step={5}
                    value={hidingTime}
                    onChange={(e) => setHidingTime(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
            </div>

            {/* 3. Location */}
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Starting Area</label>
                {!selectedLocation ? (
                    <div className="relative">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search City (e.g. London)"
                                className="flex-1 bg-slate-100 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={loading || !searchQuery}
                                className="btn bg-slate-800 text-white rounded-xl px-4 font-bold"
                            >
                                {loading ? '...' : '🔍'}
                            </button>
                        </div>

                        {/* Results Dropdown */}
                        {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                                {searchResults.map((place: any) => (
                                    <button
                                        key={place.id}
                                        onClick={() => {
                                            setSelectedLocation({ name: place.text, center: place.center });
                                            setSearchResults([]);
                                            setSearchQuery('');
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex flex-col"
                                    >
                                        <span className="font-bold text-slate-800 text-sm">{place.text}</span>
                                        <span className="text-[10px] text-slate-400 truncate">{place.place_name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-xl">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">📍</span>
                            <div>
                                <div className="font-black text-blue-900 leading-none">{selectedLocation.name}</div>
                                <div className="text-[10px] text-blue-500 font-bold mt-1 uppercase tracking-wider">Starting Point</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedLocation(null)}
                            className="text-blue-300 hover:text-red-500 font-bold px-2"
                        >✕</button>
                    </div>
                )}
            </div>

            {/* 4. Debug Mode */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center justify-between cursor-pointer p-2 hover:bg-slate-50 rounded-xl transition-colors">
                    <div>
                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Debug Mode</div>
                        <div className="text-[10px] text-slate-400">Enable advanced map tools & visualizers</div>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={debugMode}
                            onChange={(e) => setDebugMode(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                </label>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 flex gap-3 border-t border-slate-100 mt-6">
                <button
                    onClick={onCancel}
                    className="flex-1 btn bg-slate-100 text-slate-500 font-bold py-4 hover:bg-slate-200"
                >
                    CANCEL
                </button>
                <button
                    disabled={!selectedLocation}
                    onClick={() => selectedLocation && onStart({ size, hidingTime, location: selectedLocation, debugMode })}
                    className="flex-[2] btn btn-primary text-white font-black py-4 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    OPEN LOBBY
                </button>
            </div>
        </div>
    );
}
