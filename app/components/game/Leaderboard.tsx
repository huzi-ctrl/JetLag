'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface LeaderboardProps {
    gameId: string;
    onClose?: () => void;
}

export default function Leaderboard({ gameId, onClose }: LeaderboardProps) {
    const [rounds, setRounds] = useState<any[]>([]);

    useEffect(() => {
        const fetchRounds = async () => {
            const { data } = await supabase
                .from('game_rounds')
                .select(`
                    *,
                    hider:hider_id(username, avatar_url),
                    finder:found_by_user_id(username)
                `)
                .eq('game_id', gameId)
                .order('final_score', { ascending: false }); // Sort by calculated score

            if (data) setRounds(data);
        };
        fetchRounds();
    }, [gameId]);

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    };

    return (
        <div className="absolute inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6 text-center pointer-events-auto animate-in fade-in active">
            <h1 className="text-5xl font-black text-yellow-500 mb-8 italic drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">LEADERBOARD</h1>

            <div className="w-full max-w-md space-y-3">
                {rounds.map((round, i) => (
                    <div key={round.id} className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="text-2xl font-black text-slate-500 w-8">#{i + 1}</div>
                            <div className="text-left">
                                <div className="text-white font-bold text-lg">{round.hider?.username}</div>
                                <div className="text-xs text-slate-400">Found by {round.finder?.username || 'Unknown'}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-mono text-yellow-400 font-bold">{formatTime(round.final_score || round.duration_seconds)}</div>
                            <div className="text-[10px] uppercase text-slate-600 font-bold tracking-widest">SURVIVED</div>
                        </div>
                    </div>
                ))}

                {rounds.length === 0 && (
                    <div className="text-white/50 italic">No rounds completed yet.</div>
                )}
            </div>

            {onClose && (
                <button onClick={onClose} className="mt-8 text-white/50 hover:text-white underline">
                    Return to Lobby
                </button>
            )}
        </div>
    );
}
