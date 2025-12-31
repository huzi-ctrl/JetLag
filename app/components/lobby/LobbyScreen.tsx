'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import GameSettingsForm, { GameSettings } from './GameSettingsForm';

interface LobbyScreenProps {
    userId: string;
    onJoinGame: (gameId: string, role: 'HIDER' | 'SEEKER', gameCode: string, status: 'lobby' | 'active', config: any) => void;
    mapboxToken: string;
    onLeave: () => void;
}

export default function LobbyScreen({ userId, onJoinGame, mapboxToken, onLeave }: LobbyScreenProps) {
    const [mode, setMode] = useState<'MENU' | 'JOIN' | 'HOST_SETTINGS' | 'HOST_CREATING'>('MENU');
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Generate a random 4 letter code
    const generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    const handleCreateGame = async (settings: GameSettings) => {
        setMode('HOST_CREATING');
        setLoading(true);
        setError(null);
        try {
            const gameCode = generateCode();

            // 1. Create Game with CONFIG
            const { data: game, error: gameError } = await supabase
                .from('games')
                .insert({
                    hider_id: userId, // Host is initially Hider (can change)
                    status: 'lobby',
                    game_code: gameCode,
                    config: settings // Save the settings!
                })
                .select()
                .single();

            if (gameError) throw gameError;

            // 2. Add Host as Player
            const { error: playerError } = await supabase
                .from('game_players')
                .insert({
                    game_id: game.id,
                    user_id: userId,
                    role: 'hider'
                });

            if (playerError) throw playerError;

            onJoinGame(game.id, 'HIDER', gameCode, 'lobby', settings); // Pass config

        } catch (err: any) {
            console.error(err);
            setError(err.message);
            setMode('HOST_SETTINGS'); // Go back on error
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (joinCode.length < 4) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Find Game (Fetch config too!)
            const { data: game, error: findError } = await supabase
                .from('games')
                .select('id, status, game_code, config')
                .eq('game_code', joinCode.toUpperCase())
                .single();

            if (findError || !game) throw new Error("Game not found");
            if (game.status === 'ended') throw new Error("Game has ended");
            if (game.status === 'active') throw new Error("Game is already in progress. Cannot join mid-flight.");

            // 2. Add Player (Seeker by default)
            const { error: playerError } = await supabase
                .from('game_players')
                .insert({
                    game_id: game.id,
                    user_id: userId,
                    role: 'seeker'
                });

            // Ignore duplicate key error (if re-joining)
            if (playerError && !playerError.message.includes('duplicate')) {
                throw playerError;
            }

            // JOINER enters in whatever status the game is (lobby or active)
            onJoinGame(game.id, 'SEEKER', game.game_code, game.status as 'lobby' | 'active', game.config);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <div className="glass-panel max-w-sm w-full p-6 md:p-8 bg-white/80 border-white/40 shadow-2xl space-y-6 md:space-y-8 backdrop-blur-md">

                {mode === 'HOST_SETTINGS' ? (
                    <GameSettingsForm
                        mapboxToken={mapboxToken}
                        onStart={handleCreateGame}
                        onCancel={() => setMode('MENU')}
                    />
                ) : (
                    <>
                        <div className="text-center">
                            <h2 className="text-2xl md:text-3xl font-black italic text-primary transform -rotate-2">DEPARTURE BOARD</h2>
                            <p className="text-slate-500 text-xs md:text-sm mt-2 font-medium">Where are we headed today?</p>
                        </div>

                        {mode === 'MENU' && (
                            <div className="space-y-3 md:space-y-4">
                                <button
                                    onClick={() => setMode('HOST_SETTINGS')}
                                    className="w-full btn bg-primary text-white text-base md:text-lg py-3 md:py-4 shadow-lg hover:-translate-y-1 transition-all font-bold"
                                >
                                    HOST NEW SESSION
                                </button>
                                <button
                                    onClick={() => setMode('JOIN')}
                                    className="w-full btn bg-slate-200 text-slate-800 text-base md:text-lg py-3 md:py-4 hover:bg-slate-300 transition-all font-bold"
                                >
                                    JOIN SESSION
                                </button>
                                <button
                                    onClick={onLeave}
                                    className="w-full btn bg-white/10 text-slate-500 text-sm py-2 hover:bg-red-50 hover:text-red-500 transition-all font-bold mt-4"
                                >
                                    SIGN OUT / SWITCH USER
                                </button>
                            </div>
                        )}

                        {mode === 'HOST_CREATING' && (
                            <div className="space-y-4 text-center">
                                <p className="text-slate-600">Initializing new game session...</p>
                                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                            </div>
                        )}

                        {mode === 'JOIN' && (
                            <div className="space-y-4">
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="CODE (e.g. ABCD)"
                                    className="w-full text-center text-2xl md:text-3xl font-mono tracking-widest bg-slate-100 border-2 border-slate-300 rounded-xl py-3 md:py-4 focus:border-primary outline-none placeholder:text-slate-400 placeholder:text-lg"
                                />

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMode('MENU')}
                                        className="flex-1 btn text-slate-500 font-bold"
                                    >
                                        BACK
                                    </button>
                                    <button
                                        onClick={handleJoin}
                                        disabled={loading || joinCode.length < 4}
                                        className="flex-[2] btn btn-primary text-white font-bold disabled:opacity-50"
                                    >
                                        {loading ? 'CONNECTING...' : 'JOIN'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 bg-red-100 border border-red-200 text-red-700 text-center text-sm font-bold rounded-lg animate-pulse">
                                {error}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
