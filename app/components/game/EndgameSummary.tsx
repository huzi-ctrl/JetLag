'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface EndgameSummaryProps {
    gameId: string;
    gameSize: 'small' | 'medium' | 'large';
    onClose: () => void;
    onViewLeaderboard: () => void;
    isHost: boolean;
    onLeave?: () => void;
}

export default function EndgameSummary({ gameId, gameSize, onClose, onViewLeaderboard, isHost, onLeave }: EndgameSummaryProps) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        const fetchStats = async () => {
            // 1. Fetch Game Data (Bonus Time & Hider Hand)
            const { data: game, error: gameErr } = await supabase
                .from('games')
                .select('bonus_time, hider_state, start_time, round_end_time')
                .eq('id', gameId)
                .single();

            // 2. Fetch Round Data (Base Duration)
            // We assume the active round just ended, so we get the latest round?
            // Or we use the `round_end_time` - `start_time` diff?
            // Actually `game_rounds` table stores it. Let's fetch the latest round.
            const { data: round, error: roundErr } = await supabase
                .from('game_rounds')
                .select('*')
                .eq('game_id', gameId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (game && round) {
                // Calculator Logic
                const baseSeconds = round.duration_seconds;
                const bonusMinutes = game.bonus_time || 0;

                // Card Tally
                let cardMinutes = 0;
                const hand = game.hider_state?.hand || [];
                const cards: any[] = [];

                hand.forEach((c: any) => {
                    if (c.type === 'TIME') {
                        // Parse Tier Value
                        let val = 0;
                        // Handle both 'tier' (from DECK_DATA) and 'tiers' (potential DB alias)
                        // Handle both string ("+2m") and number (2) values
                        const raw = c.tier?.[gameSize] ?? c.tiers?.[gameSize] ?? 0;
                        const str = String(raw);
                        val = parseInt(str.replace(/\D/g, '')) || 0;

                        cardMinutes += val;
                        cards.push({ name: c.name, val });
                    }
                });

                const totalMinutes = Math.floor(baseSeconds / 60) + bonusMinutes + cardMinutes;
                const totalSeconds = baseSeconds % 60; // We might just show minutes for simplicity?
                const finalScoreSeconds = (totalMinutes * 60) + totalSeconds;

                const statsObj = {
                    baseSeconds,
                    bonusMinutes,
                    cardMinutes,
                    cards,
                    totalTimeStr: `${Math.floor(totalMinutes)}m ${totalSeconds}s`
                };

                setStats(statsObj);

                // PERSIST SCORE (Idempotent check?)
                // We only do this if we haven't already for this round?
                // Or just do it every time the summary loads (safe enough for now)

                if (round.id) {
                    await supabase.from('game_rounds').update({
                        final_score: finalScoreSeconds,
                        score_breakdown: statsObj
                    }).eq('id', round.id);
                }
            }
            setLoading(false);
        };
        fetchStats();
    }, [gameId, gameSize]);

    const handleEndGame = async () => {
        // "Return to Lobby" -> Reset to lobby state
        const confirm = window.confirm("Return to Lobby? This will reset the game.");
        if (!confirm) return;

        // Force game status to 'ended' so other clients see the end screen if they haven't yet?
        // Or 'lobby' to reset?
        // User asked for "leave game signal".
        // We'll update to ENDED to ensure session closes, then leave.
        await supabase.from('games').update({ status: 'ended' }).eq('id', gameId);

        // Trigger local leave cleanup
        onLeave?.();
    };

    if (loading) return <div className="text-white animate-pulse">Calculating Final Tally...</div>;

    if (!stats) return <div className="text-white">Error loading stats.</div>;

    return (
        <div className="bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-700 animate-in zoom-in duration-300">
            <h2 className="text-3xl font-black text-white uppercase text-center mb-6 tracking-wider">
                Mission Report
            </h2>

            <div className="space-y-4 mb-8">
                {/* Base Time */}
                <div className="flex justify-between items-center text-slate-400 font-bold border-b border-white/10 pb-2">
                    <span>RUN DURATION</span>
                    <span>{Math.floor(stats.baseSeconds / 60)}m {stats.baseSeconds % 60}s</span>
                </div>

                {/* Bonus Time */}
                <div className="flex justify-between items-center text-amber-400 font-bold border-b border-white/10 pb-2">
                    <span>CURSE PENALTIES</span>
                    <span>+{stats.bonusMinutes}m</span>
                </div>

                {/* Time Cards */}
                <div className="flex flex-col gap-1 border-b border-white/10 pb-2">
                    <div className="flex justify-between items-center text-emerald-400 font-bold">
                        <span>UNUSED TIME CARDS</span>
                        <span>+{stats.cardMinutes}m</span>
                    </div>
                    {stats.cards.length > 0 && (
                        <div className="pl-4 text-xs text-slate-500 font-mono">
                            {stats.cards.map((c: any, i: number) => (
                                <div key={i} className="flex justify-between">
                                    <span>• {c.name}</span>
                                    <span>+{c.val}m</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* TOTAL */}
                <div className="mt-6 bg-white/10 p-4 rounded-xl flex justify-between items-center">
                    <span className="text-slate-300 font-black text-lg">FINAL SCORE</span>
                    <span className="text-4xl font-black text-white">{stats.totalTimeStr}</span>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                {isHost && (
                    <button
                        onClick={handleEndGame}
                        className="w-full py-4 bg-yellow-500 text-black font-black rounded-xl hover:bg-yellow-400 shadow-lg text-lg uppercase"
                    >
                        RETURN TO LOBBY
                    </button>
                )}
                <button
                    onClick={onViewLeaderboard}
                    className="w-full py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 uppercase"
                >
                    View Leaderboard
                </button>
            </div>
        </div>
    );
}
