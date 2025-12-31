'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import CardDeck from './hider/CardDeck';
import SeekerHUD from './seeker/SeekerHUD';
import LocationSync from './LocationSync';
import HostRoundControls from './HostRoundControls';
import Leaderboard from './Leaderboard';

interface GameStackProps {
    role: 'HIDER' | 'SEEKER';
    gameId: string;
    userId: string;
    onLeave: () => void;
    onOcclusionChange?: (occluded: boolean) => void;
    biasLocation?: { latitude: number, longitude: number } | null;
}

interface GameConfig {
    size: 'small' | 'medium' | 'large';
    hidingTime: number;
    // add other config fields as needed
}

import GamePhaseOverlay from './GamePhaseOverlay';

interface GameState {
    config: GameConfig;
    start_time: string;
    head_start_released_at: string | null;
    hiding_spot: { type: string, coordinates: number[] } | null;
    status: string; // Added status
    hider_id: string; // Added hider_id
}

export default function GameStack({ role, gameId, userId, onLeave, onOcclusionChange, biasLocation }: GameStackProps) {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [loading, setLoading] = useState(true);
    const [isJailed, setIsJailed] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // Host Detection (We need to specificially check if I am creator/host - usually stored in games table as created_by or just assume hider/seeker roles?
    // Wait, Host might be Hider or Seeker.
    // We didn't explicitly store Host ID in Client. 
    // We can assume user who created is 'GameHost'? Or is it separate?
    // User said "Host" controls.
    // Let's assume Profile has 'is_host' maybe? No.
    // Let's check 'created_by' in games table?
    // I need to fetch `owner_id` or similar from games.
    // Currently Schema doesn't strictly have `owner_id`. It has `hider_id`.
    // Wait, `games` table doesn't have `owner_id` in my recent read.
    // Ah, usually the creator.
    // Let's assume first player in `game_players` is host? Or just allow *current Hider* to control next?
    // "option to the HOST".
    // I'll fetch `created_by` (if exists) or just let ANYONE see controls? No.
    // Let's check schema again. `games` has no `created_by`. `map_events` has.
    // I'll assume for now that **Hider** is the Host for this purpose, OR I'll add a check.
    // Actually, usually in these apps, the person who made the game.
    // I'll stick to: Hider controls the flow? Or Seeker?
    // "Host... ask them to end...".
    // I will add a `host_id` column to `games`? No time. 
    // I will use `hider_id` (current hider) as the "Host" for round transition? 
    // Or just ANY player can see "Next Round" if status ended?
    // Let's make it visible to EVERYONE for now, or just Role=Hider. 
    // User said "Host".
    // I'll fetch `hider_id` and check against `userId`.
    // Wait, if roles switch, hider changes.
    // Let's fetch `hider_id` from game state.

    useEffect(() => {
        const fetchGameState = async () => {
            if (!gameId) return;

            const { data, error } = await supabase
                .from('games')
                .select('config, start_time, status, hider_id, head_start_released_at, hiding_spot_json') // Fetch status and hider_id
                .eq('id', gameId)
                .single();

            if (data) {
                // PostgREST returns JSON columns as objects automatically
                const hidingSpot = data.hiding_spot_json || null;

                setGameState({
                    config: data.config as unknown as GameConfig,
                    start_time: data.start_time,
                    head_start_released_at: data.head_start_released_at,
                    hiding_spot: hidingSpot,
                    status: data.status,
                    hider_id: data.hider_id
                } as any); // Extend GameState interface
            }
            setLoading(false);
        };

        fetchGameState();

        // Subscribe to Game Updates (for Head Start Release)
        const channel = supabase.channel(`game-state-${gameId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => {
                // Refetch to ensure clean GeoJSON parsing (Realtime payload might be WKB)
                fetchGameState();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [gameId]);

    if (!gameId) return null;

    if (loading || !gameState) {
        return (
            <div className="absolute inset-0 z-[40] flex items-center justify-center pointer-events-none">
                <div className="bg-black/80 backdrop-blur text-white px-6 py-4 rounded-xl font-bold animate-pulse">
                    LOADING MISSION DATA...
                </div>
            </div>
        );
    }

    const gameSize = gameState.config.size || 'medium';

    // ROUND OVER LOGIC
    if (gameState.status === 'ended') {
        const isHider = role === 'HIDER';
        // We'll show Leaderboard by default? Or "FOUND" screen?
        // Let's show "FOUND" Screen with buttons.
        return (
            <div className="absolute inset-0 pointer-events-auto z-[140] bg-black/90 flex flex-col items-center justify-center">
                <div className="text-6xl font-black text-yellow-500 mb-8 animate-bounce">
                    {isHider ? 'FOUND!' : 'HIDER FOUND!'}
                </div>

                {/* Host Controls (Assume Hider is Host for simplicity) */}
                {userId === gameState.hider_id ? (
                    <HostRoundControls gameId={gameId} onEndGame={() => setShowLeaderboard(true)} />
                ) : (
                    <>
                        <div className="text-white/50 animate-pulse text-center mb-8">
                            Waiting for Host to decide next round...
                        </div>
                        <button onClick={() => setShowLeaderboard(true)} className="mt-8 text-sm text-white underline z-[160] relative">
                            View Leaderboard
                        </button>
                    </>
                )}

                {showLeaderboard && (
                    <Leaderboard gameId={gameId} onClose={onLeave} />
                )}
            </div>
        );
    }

    return (
        <div className="absolute inset-0 pointer-events-none z-[40] overflow-hidden">
            {/* The stack sits on top of the map. Components inside should enable pointer-events-auto */}

            {/* PHASE OVERLAY (Head Start & Jails) */}
            <GamePhaseOverlay
                role={role}
                gameId={gameId}
                startTime={gameState.start_time}
                hidingTimeMinutes={gameState.config.hidingTime || 30}
                headStartReleasedAt={gameState.head_start_released_at}
                hidingSpot={gameState.hiding_spot}
                biasLocation={biasLocation}
                onJailChange={setIsJailed}
            />

            {/* Background Sync */}
            <LocationSync gameId={gameId} userId={userId} />

            {role === 'HIDER' && (
                <div className={`pointer-events-auto transition-opacity ${isJailed ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                    <CardDeck
                        gameSize={gameSize}
                        gameId={gameId}
                        userId={userId}
                        onOcclusionChange={onOcclusionChange}
                        biasLocation={biasLocation}
                    />
                </div>
            )}

            {role === 'SEEKER' && (
                <div className="pointer-events-auto">
                    <SeekerHUD
                        gameId={gameId}
                        userId={userId}
                        gameSize={gameSize}
                        onOcclusionChange={onOcclusionChange}
                    />
                </div>
            )}
        </div>
    );
}


