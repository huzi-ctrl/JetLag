'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useGeolocation } from '../../hooks/useGeolocation';
import ManualMaskTool from '../game/seeker/ManualMaskTool';

interface SettingsMenuProps {
    onLeave: () => void;
    proximityMode: 'HIDER' | 'SEEKER';
    onProximityChange: (mode: 'HIDER' | 'SEEKER') => void;
    gameId?: string;
    role?: 'HIDER' | 'SEEKER';
    userId?: string;
}

export default function SettingsMenu({ onLeave, proximityMode, onProximityChange, gameId, role, userId }: SettingsMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { location } = useGeolocation({ enabled: isOpen });

    const toggleMenu = () => setIsOpen(!isOpen);

    return (
        <div className="absolute top-4 right-4 z-[100] pointer-events-auto font-sans">
            {/* Gear Icon Button */}
            <button
                onClick={toggleMenu}
                className={`p-3 rounded-full shadow-xl transition-all border-2 border-white/20 
                    ${isOpen ? 'bg-slate-800 text-white rotate-90' : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:scale-105 active:scale-95'}
                `}
                title="Settings"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 top-14 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                    {/* Proximity Bias (HIDER ONLY) */}
                    {role === 'HIDER' && (
                        <div className="p-3 border-b border-slate-800">
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2 px-1">Search Proximity Bias</div>
                            <div className="flex bg-slate-800 rounded-lg p-1">
                                <button
                                    onClick={() => onProximityChange('HIDER')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${proximityMode === 'HIDER'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    ME (HIDER)
                                </button>
                                <button
                                    onClick={() => onProximityChange('SEEKER')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${proximityMode === 'SEEKER'
                                        ? 'bg-purple-600 text-white shadow-md'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    SEEKER
                                </button>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-2 px-1 italic">
                                * affects Autocomplete results
                            </div>
                        </div>
                    )}

                    {/* FOUND BUTTON (Seeker Only) */}
                    {role === 'SEEKER' && gameId && userId && (
                        <>
                            {/* Manual Mask Tool */}
                            <div className="p-3 border-b border-slate-800">
                                <ManualMaskTool
                                    gameId={gameId}
                                    userId={userId}
                                    userLocation={location}
                                    onMaskCreated={() => { }}
                                />
                            </div>

                            <div className="p-2 border-b border-slate-800">
                                <button
                                    onClick={async () => {
                                        if (!window.confirm("ARE YOU SURE YOU FOUND THE HIDER?\nThis will end the round!")) return;
                                        const { error } = await supabase.rpc('record_found', {
                                            p_game_id: gameId,
                                            p_seeker_id: userId
                                        });
                                        if (error) alert("Error: " + error.message);
                                        else setIsOpen(false);
                                    }}
                                    className="w-full text-center py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xl rounded-lg shadow-lg uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                                >
                                    FOUND! 🎯
                                </button>
                            </div>
                        </>
                    )}

                    <div className="p-2">
                        <button
                            onClick={onLeave}
                            className="w-full text-left px-4 py-3 text-red-500 hover:bg-red-900/20 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                            LEAVE GAME
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
