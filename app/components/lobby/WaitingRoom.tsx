'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface WaitingRoomProps {
    gameId: string;
    gameCode: string;
    userId: string;
    onGameStart: () => void;
    onRoleChange: (role: 'HIDER' | 'SEEKER') => void;
    onLeave: () => void;
}

interface Player {
    id: string; // game_player id
    user_id: string;
    role: 'hider' | 'seeker';
    username?: string; // We might need to join with profiles, or just show role
}

export default function WaitingRoom({ gameId, gameCode, userId, onGameStart, onRoleChange, onLeave }: WaitingRoomProps) {
    const [players, setPlayers] = useState<Player[]>([]);
    const [isHost, setIsHost] = useState(false);
    const [loading, setLoading] = useState(false);

    // Initial Fetch & Subscription
    useEffect(() => {
        // 1. Fetch initial players
        const fetchPlayers = async () => {
            const { data, error } = await supabase
                .from('game_players')
                .select(`
                    *,
                    profiles:user_id ( username )
                `)
                .eq('game_id', gameId);

            if (data) {
                // Type assertion for the joined query result
                const rawPlayers = data as unknown as (Player & { profiles: { username: string } | null })[];
                const formattedPlayers: Player[] = rawPlayers.map(p => ({
                    ...p,
                    username: p.profiles?.username || 'Unknown Pilot'
                }));
                setPlayers(formattedPlayers);

                // Sync MY role to parent
                const me = formattedPlayers.find(p => p.user_id === userId);
                if (me) {
                    onRoleChange(me.role === 'hider' ? 'HIDER' : 'SEEKER');
                }
            }

            // Check if I am host
            const { data: game } = await supabase
                .from('games')
                .select('hider_id, status')
                .eq('id', gameId)
                .single();

            if (game && game.hider_id === userId) setIsHost(true);

            // If game is already active (re-join), trigger start immediately
            if (game && game.status === 'active') {
                onGameStart();
            }
        };

        fetchPlayers();

        // 2. Subscribe to new players
        const playerSub = supabase
            .channel(`lobby-players-${gameId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, (payload) => {
                console.log("Player change detected!", payload);
                fetchPlayers(); // Reload full list on any change for simplicity
            })
            .subscribe((status, err) => {
                console.log(`[LOBBY] Player Subscription Status: ${status}`, err);
            });

        // 3. Subscribe to Game Status (for non-hosts to know when to start)
        const gameSub = supabase
            .channel('lobby-game-status')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
                if (payload.new.status === 'active') {
                    onGameStart();
                }
            })
            .subscribe((status) => {
                console.log(`[LOBBY] Game Status Subscription: ${status}`);
            });

        // 4. Polling Fallback (Crucial if Realtime fails/is not enabled)
        const pollInterval = setInterval(() => {
            fetchPlayers();
        }, 3000);

        // 5. Dedicated Aggressive Game Status Check (For Joiners)
        const statusCheckInterval = setInterval(async () => {
            const { data } = await supabase.from('games').select('status').eq('id', gameId).single();
            if (data && data.status === 'active') {
                console.log("[LOBBY] Aggressive Poll: Game is ACTIVE!");
                onGameStart();
            }
        }, 1000); // Check every second

        return () => {
            playerSub.unsubscribe();
            gameSub.unsubscribe();
            clearInterval(pollInterval);
            clearInterval(statusCheckInterval); // Cleanup
        };
    }, [gameId, userId, onGameStart, onRoleChange]);


    const handleStartGame = async () => {
        setLoading(true);
        try {
            // Start the game!
            const { error } = await supabase.from('games').update({ status: 'active', start_time: new Date().toISOString() }).eq('id', gameId);
            if (error) throw error;

            // Manual trigger to prevent waiting for Realtime roundtrip
            onGameStart();
        } catch (e: any) {
            console.error("Link fail", e);
            alert("Failed to start game: " + e.message);
            setLoading(false);
        }
    };

    const handleRoleSelect = async (targetUserId: string, newRole: 'hider' | 'seeker') => {
        if (!isHost) return;

        try {
            if (newRole === 'seeker') {
                // Demote specific user
                await supabase.from('game_players').update({ role: 'seeker' }).eq('game_id', gameId).eq('user_id', targetUserId);

                // If they were the hider, clear the game hider_id
                const { data: game } = await supabase.from('games').select('hider_id').eq('id', gameId).single();
                if (game && game.hider_id === targetUserId) {
                    await supabase.from('games').update({ hider_id: null }).eq('id', gameId);
                }
            } else {
                // Promote to Hider (Exclusive)
                await handleMakeHider(targetUserId);
            }
        } catch (e: any) {
            console.error("Role switch error", e);
            alert("Failed to switch role: " + e.message);
        }
    };

    const handleMakeHider = async (targetUserId: string) => {
        if (!isHost) return;

        try {
            // A. Update Game Metadata
            await supabase.from('games').update({ hider_id: targetUserId }).eq('id', gameId);

            // B. Demote everyone else to SEEKER
            await supabase.from('game_players').update({ role: 'seeker' }).eq('game_id', gameId).neq('user_id', targetUserId);

            // C. Promote Target to HIDER
            await supabase.from('game_players').update({ role: 'hider' }).eq('game_id', gameId).eq('user_id', targetUserId);

            // We rely on Realtime/Polling to update the UI
        } catch (e) {
            console.error("Failed to switch roles", e);
            alert("Role switch failed");
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(gameCode);
        alert('Copied to clipboard!');
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-6">
            <div className="max-w-md w-full flex flex-col items-center text-center space-y-8 animate-in fade-in zoom-in duration-300 relative">

                {/* Back/Leave Button */}
                <button
                    onClick={() => {
                        if (confirm("Leave waiting room?")) onLeave();
                    }}
                    className="absolute -top-12 left-0 text-slate-500 hover:text-white flex items-center gap-1 text-sm font-bold uppercase tracking-widest transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                    LEAVE
                </button>

                {/* Header */}
                <div>
                    <div className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-2">Flight Number</div>
                    <button
                        onClick={copyCode}
                        className="text-7xl font-black font-mono text-white tracking-widest border-4 border-dashed border-white/20 px-8 py-4 rounded-3xl hover:bg-white/5 transition-colors"
                    >
                        {gameCode}
                    </button>
                    <p className="text-slate-500 text-xs mt-2">Tap to copy code</p>
                </div>

                {/* Player List */}
                <div className="w-full bg-white/5 rounded-2xl p-6 border border-white/10">
                    <h3 className="text-white font-bold mb-4 flex justify-between items-center">
                        <span className="uppercase tracking-wider">Passenger Manifest</span>
                        <span className="bg-primary text-black px-2 py-0.5 rounded text-xs font-black">{players.length}</span>
                    </h3>

                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {players.map(p => (
                            <div key={p.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 group">
                                <div className={`w-3 h-3 rounded-full ${p.role === 'hider' ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-blue-500 shadow-[0_0_10px_blue]'}`} />
                                <span className="text-white font-bold flex-1 text-left truncate">
                                    {p.user_id === userId ? 'YOU' : p.username}
                                </span>
                                {isHost ? (
                                    <div className="relative z-20">
                                        <select
                                            value={p.role}
                                            onChange={(e) => handleRoleSelect(p.user_id, e.target.value as 'hider' | 'seeker')}
                                            className="bg-black/40 text-xs font-bold uppercase text-white border border-white/20 rounded-lg pl-2 pr-6 py-1 outline-none focus:border-primary appearance-none cursor-pointer hover:bg-black/60 transition-colors"
                                        >
                                            <option value="seeker">Seeker</option>
                                            <option value="hider">Hider</option>
                                        </select>
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] text-white/70">▼</div>
                                    </div>
                                ) : (
                                    <span className={`text-[10px] uppercase font-black px-2 py-1 rounded ${p.role === 'hider' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                        {p.role}
                                    </span>
                                )}
                            </div>
                        ))}
                        {players.length < 2 && (
                            <div className="text-slate-500 italic text-sm py-2">
                                Waiting for seekers to join...
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Action */}
                <div className="w-full pt-4">
                    {isHost ? (
                        <button
                            disabled={loading || players.length < 2}
                            onClick={handleStartGame}
                            className="w-full btn bg-primary text-black font-black text-xl py-5 rounded-2xl shadow-[0_0_30px_rgba(0,122,255,0.4)] hover:shadow-[0_0_50px_rgba(0,122,255,0.6)] hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all"
                        >
                            {loading ? 'INITIATING...' : 'TAKEOFF 🚀'}
                        </button>
                    ) : (
                        <div className="flex flex-col items-center gap-3 animate-pulse">
                            <div className="w-8 h-8 border-4 border-white/20 border-t-primary rounded-full animate-spin" />
                            <span className="text-slate-400 font-bold tracking-widest text-sm">WAITING FOR PILOT</span>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
