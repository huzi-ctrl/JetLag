'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface HostRoundControlsProps {
    gameId: string;
    onEndGame: () => void;
}

export default function HostRoundControls({ gameId, onEndGame }: HostRoundControlsProps) {
    const [players, setPlayers] = useState<any[]>([]);
    const [selectedHider, setSelectedHider] = useState<string>('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchPlayers = async () => {
            // Get all players (spectators might want to play?) - assuming current game players
            const { data } = await supabase
                .from('game_players')
                .select('user_id, role, profiles(username, avatar_url)')
                .eq('game_id', gameId);

            if (data) {
                setPlayers(data);
                // Default to a random seeker?
                const seekers = data.filter((p: any) => p.role === 'seeker');
                if (seekers.length > 0) setSelectedHider(seekers[0].user_id);
            }
        };
        fetchPlayers();
    }, [gameId]);

    const handleNextRound = async () => {
        if (!selectedHider) return alert("Select a hider!");
        setLoading(true);
        const { error } = await supabase.rpc('start_next_round', {
            p_game_id: gameId,
            p_next_hider_id: selectedHider
        });
        if (error) {
            alert(error.message);
            setLoading(false);
        } else {
            // Success - GameStack will react to status change
        }
    };

    return (
        <div className="absolute inset-0 z-[150] bg-black/90 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
            <h1 className="text-4xl font-black text-white mb-2">ROUND OVER</h1>
            <p className="text-white/60 mb-8">What would you like to do?</p>

            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md mb-8">
                <h2 className="text-xl font-bold text-white mb-4">START NEXT ROUND</h2>

                <div className="text-left mb-4">
                    <label className="text-xs uppercase font-bold text-slate-500 block mb-2">Select Next Hider</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                        {players.map(p => (
                            <button
                                key={p.user_id}
                                onClick={() => setSelectedHider(p.user_id)}
                                className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${selectedHider === p.user_id
                                        ? 'bg-blue-600/20 border-blue-500 text-white'
                                        : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                                    }`}
                            >
                                <div className="w-6 h-6 rounded-full bg-slate-700 overflow-hidden">
                                    {p.profiles?.avatar_url && <img src={p.profiles.avatar_url} className="w-full h-full object-cover" />}
                                </div>
                                <span className="text-sm font-bold truncate">{p.profiles?.username || 'Unknown'}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleNextRound}
                    disabled={loading}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-lg rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                    {loading ? 'STARTING...' : 'SWAP ROLES & START'}
                </button>
            </div>

            <button
                onClick={onEndGame}
                className="text-red-500 font-bold hover:text-red-400 text-sm border-b border-red-500/30 pb-0.5"
            >
                END GAME & SHOW LEADERBOARD
            </button>
        </div>
    );
}
