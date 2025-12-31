'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useGeolocation } from '../../hooks/useGeolocation';
import * as turf from '@turf/turf';

interface GamePhaseOverlayProps {
    role: 'HIDER' | 'SEEKER';
    gameId: string;
    startTime: string | null;
    hidingTimeMinutes: number;
    headStartReleasedAt: string | null;
    hidingSpot: { type: string, coordinates: number[] } | null; // GeoJSON Point
    biasLocation?: { latitude: number, longitude: number } | null;
    onJailChange?: (isJailed: boolean) => void;
}

export default function GamePhaseOverlay({
    role,
    gameId,
    startTime,
    hidingTimeMinutes,
    headStartReleasedAt,
    hidingSpot,
    biasLocation,
    onJailChange
}: GamePhaseOverlayProps) {
    const { location: gpsLoc } = useGeolocation();
    // Prioritize Bias Location (Sim) if available
    const myLoc = biasLocation || gpsLoc;

    const [timeLeftStr, setTimeLeftStr] = useState<string>('');
    const [phase, setPhase] = useState<'HEAD_START' | 'ACTIVE' | 'LOADING'>('LOADING');
    const [isOutOfBounds, setIsOutOfBounds] = useState(false);
    const [distFromJail, setDistFromJail] = useState(0);

    // ENDGAME STATE
    const [seekers, setSeekers] = useState<any[]>([]);
    const [isEndgame, setIsEndgame] = useState(false);

    const [showEndgameModal, setShowEndgameModal] = useState(false);
    const [showSafeModal, setShowSafeModal] = useState(false);
    const [hasEndgameTriggered, setHasEndgameTriggered] = useState(false); // To detect transition back to normal

    // 1. Determine Phase & Timer
    useEffect(() => {
        if (!startTime) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();

            // HEAD START LOGIC
            if (!headStartReleasedAt) {
                const start = new Date(startTime).getTime();
                const endHeadStart = start + (hidingTimeMinutes * 60 * 1000);
                const diff = endHeadStart - now;

                if (diff <= 0) {
                    // Time is up!
                    // If I am Hider, I should trigger release automatically if not already
                    // For now, wait for manual trigger or assume active?
                    // Better: Display 00:00.
                    setTimeLeftStr("00:00");
                    if (role === 'HIDER') {
                        // Auto-release logic could go here, but let's encourage manual click via button pulsing
                    }
                } else {
                    const m = Math.floor(diff / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    setTimeLeftStr(`${m}:${s.toString().padStart(2, '0')}`);
                }
                setPhase('HEAD_START');
            } else {
                // ACTIVE PHASE LOGIC (Game Timer)
                // Timer counts UP from release
                const release = new Date(headStartReleasedAt).getTime();
                const elapsed = now - release;

                const h = Math.floor(elapsed / 3600000);
                const m = Math.floor((elapsed % 3600000) / 60000);
                const s = Math.floor((elapsed % 60000) / 1000);

                setTimeLeftStr(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
                setPhase('ACTIVE');
            }

        }, 1000);

        return () => clearInterval(interval);
    }, [startTime, headStartReleasedAt, hidingTimeMinutes, role]);

    // 2. Hider Jail Check (Only in Active Phase)
    useEffect(() => {
        // Bypass Jail Check if Sim (Bias Location) is on
        if (biasLocation) {
            setIsOutOfBounds(false);
            return;
        }

        if (role === 'HIDER' && phase === 'ACTIVE' && hidingSpot && myLoc && myLoc.latitude && myLoc.longitude) {
            const myPt = turf.point([myLoc.longitude, myLoc.latitude]);
            // hidingSpot is likely GeoJSON { type: 'Point', coordinates: [lng, lat] }
            // Ensure coordinates exist
            if (hidingSpot.coordinates) {
                const centerPt = turf.point(hidingSpot.coordinates);
                const dist = turf.distance(myPt, centerPt, { units: 'miles' });
                setDistFromJail(dist);

                if (dist > 0.25) {
                    // console.log("JAIL BREAK! Dist:", dist);
                    if (!isOutOfBounds) onJailChange?.(true);
                    setIsOutOfBounds(true);
                } else {
                    if (isOutOfBounds) onJailChange?.(false);
                    setIsOutOfBounds(false);
                }
            } else {
                console.warn("Jail Check: Hiding spot missing coordinates", hidingSpot);
            }
        } else {
            if (isOutOfBounds) onJailChange?.(false);
            setIsOutOfBounds(false);
            if (role === 'HIDER' && phase === 'ACTIVE') {
                // console.log("Jail Check Skipped. Spot:", hidingSpot, "Loc:", myLoc);
            }
        }
    }, [role, phase, hidingSpot, myLoc, biasLocation]);

    // 3. ENDGAME DETECTION (Seekers entering zone)
    // Subscribe to Seekers
    useEffect(() => {
        if (!gameId || role !== 'HIDER' || phase !== 'ACTIVE' || !hidingSpot || !hidingSpot.coordinates) return;

        const fetchSeekersSafe = async () => {
            const { data, error } = await supabase.from('game_players').select('user_id, location_json').eq('game_id', gameId).eq('role', 'seeker');
            if (error) console.error("Error fetching seekers:", error);

            const validSeekers = data?.map((s: any) => ({
                user_id: s.user_id,
                location: s.location_json // PostgREST auto-parses
            })) || [];
            console.log("Endgame Check - Seekers:", validSeekers);
            setSeekers(validSeekers); // Just update state, let the other effect handle logic
        };

        fetchSeekersSafe();

        const channel = supabase.channel(`phase-endgame-${gameId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, () => {
                console.log("Seeker Move Detected!");
                fetchSeekersSafe();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };

    }, [gameId, role, phase, hidingSpot]);

    // 4. REACTIVE ENDGAME LOGIC
    // React to changes in 'seekers' state to determine endgame status
    useEffect(() => {
        if (!hidingSpot || !hidingSpot.coordinates) return;
        const centerPt = turf.point(hidingSpot.coordinates);
        let countInZone = 0;

        seekers.forEach(s => {
            if (s.location && s.location.coordinates) {
                const pt = turf.point(s.location.coordinates);
                const dist = turf.distance(pt, centerPt, { units: 'miles' });
                if (dist <= 0.25) countInZone++;
            }
        });

        // State Machine Logic
        if (countInZone > 0) {
            // TRANSITION: SAFE -> ENDGAME
            if (!isEndgame) {
                console.log("Endgame: Seekers ENTERED zone.");
                setIsEndgame(true);
                setShowEndgameModal(true);
                setHasEndgameTriggered(true);
                setShowSafeModal(false);
            }
        } else {
            // TRANSITION: ENDGAME -> SAFE
            if (isEndgame) {
                console.log("Endgame: Seekers LEFT zone. Showing Safe Modal.");
                setIsEndgame(false);
                setShowEndgameModal(false);
                setShowSafeModal(true);
            }
        }
    }, [seekers, hidingSpot, isEndgame]); // Dependency on isEndgame ensures we only trigger ON CHANGE


    // HANDLERS
    const handleRelease = async () => {
        if (!myLoc || !myLoc.latitude) {
            alert("Waiting for GPS location...");
            return;
        }

        const confirm = window.confirm("Are you sure? This will LOCK IN your current location as your hiding spot (0.25mi radius). Seekers will be released!");
        if (!confirm) return;

        // Call RPC
        const { error } = await supabase.rpc('release_seekers', {
            p_game_id: gameId,
            p_lat: myLoc.latitude,
            p_lng: myLoc.longitude
        });

        if (error) {
            console.error("Release failed:", error);
            alert("Failed to release seekers: " + error.message);
        }
    };


    // RENDER
    if (phase === 'LOADING') return null;

    // SCENARIO A: HEAD START
    if (phase === 'HEAD_START') {
        return (
            <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 text-white pointer-events-auto p-6 text-center">
                <div className="mb-8">
                    <h1 className="text-6xl font-black italic text-yellow-500 mb-2">{timeLeftStr}</h1>
                    <p className="text-xl font-bold uppercase tracking-widest text-white/50">HIDING TIME REMAINING</p>
                </div>

                {role === 'SEEKER' && (
                    <div className="bg-red-500/20 border-2 border-red-500 p-6 rounded-2xl animate-pulse">
                        <h2 className="text-3xl font-black text-red-500 mb-2">⚠ STAY IN LOBBY</h2>
                        <p className="text-sm opacity-80">Hiders are currently moving to position.<br />Do not leave the starting area.</p>
                    </div>
                )}

                {role === 'HIDER' && (
                    <div className="space-y-4">
                        <p className="text-lg opacity-80 max-w-sm mx-auto">
                            You are free to move. When you are ready to hide, click below.
                            <br /><span className="text-yellow-400 text-sm font-bold">Your current location will become your Jail (0.25mi).</span>
                        </p>
                        <button
                            onClick={handleRelease}
                            className="btn bg-yellow-500 hover:bg-yellow-400 text-black font-black text-2xl px-12 py-6 rounded-full shadow-[0_0_50px_rgba(234,179,8,0.5)] transition-all transform hover:scale-105"
                        >
                            LOCK IN & START 🔓
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // SCENARIO D: ENDGAME MODAL (Hider only, dismissable)
    // Rendered on top of active HUD
    const EndgameModal = () => (
        showEndgameModal && role === 'HIDER' ? (
            <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 p-6 pointer-events-auto">
                <div className="bg-red-900 border-4 border-red-500 p-8 rounded-3xl max-w-md text-center shadow-[0_0_100px_rgba(220,38,38,0.5)] animate-bounce-in">
                    <h1 className="text-5xl font-black text-white mb-4 italic">ENDGAME BEGUN!</h1>
                    <p className="text-xl text-red-200 mb-8 font-bold">Seekers have entered your zone.<br />DO NOT MOVE.</p>
                    <button
                        onClick={() => setShowEndgameModal(false)}
                        className="bg-white text-red-900 font-bold py-3 px-8 rounded-full hover:bg-gray-200 transition-colors"
                    >
                        I UNDERSTAND
                    </button>
                </div>
            </div>
        ) : null
    );

    // SCENARIO E: SAFE MODAL (When Seekers leave)
    const SafeModal = () => (
        showSafeModal && role === 'HIDER' ? (
            <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 p-6 pointer-events-auto">
                <div className="bg-green-900 border-4 border-green-500 p-8 rounded-3xl max-w-md text-center shadow-[0_0_100px_rgba(34,197,94,0.5)] animate-bounce-in">
                    <h1 className="text-4xl font-black text-white mb-4 italic">ZONE CLEAR!</h1>
                    <p className="text-xl text-green-200 mb-8 font-bold">Seekers have left your 0.25mi radius.<br />You are safe (for now).</p>
                    <button
                        onClick={() => setShowSafeModal(false)}
                        className="bg-white text-green-900 font-bold py-3 px-8 rounded-full hover:bg-gray-200 transition-colors"
                    >
                        DISMISS
                    </button>
                </div>
            </div>
        ) : null
    );

    // SCENARIO B: ACTIVE PHASE - HIDER JAIL BREAK
    if (phase === 'ACTIVE' && isOutOfBounds && role === 'HIDER') {
        return (
            <div className="absolute inset-0 z-[100] bg-red-600/50 text-white flex flex-col items-center justify-center p-8 text-center animate-pulse pointer-events-none">
                <h1 className="text-6xl font-black mb-4 drop-shadow-md">⚠ RETURN TO ZONE</h1>
                <p className="text-2xl font-bold mb-8 drop-shadow-md">You have left your hiding perimeter!</p>
                <div className="bg-black/80 p-4 rounded-xl mb-4 pointer-events-auto">
                    <span className="text-4xl font-mono">{distFromJail.toFixed(2)}mi</span>
                    <span className="block text-xs uppercase opacity-75">Distance from Center (Max 0.25mi)</span>
                </div>
                <p className="text-sm opacity-80 drop-shadow-md">Game functions disabled until you return.</p>
            </div>
        );
    }

    // SCENARIO C: ACTIVE GAME HUD (Small Timer)
    // We render a small top-center timer for everyone
    return (
        <div className="absolute inset-0 pointer-events-none">
            {/* Endgame Modal (Dismissable) */}
            <EndgameModal />
            <SafeModal />

            {/* Timer Pill */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[50] pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-mono font-bold text-white text-lg tracking-wider">{timeLeftStr}</span>
                    {role === 'HIDER' && (
                        <div className="text-[10px] uppercase font-black text-white/30 border-l border-white/20 pl-3 ml-1">
                            LOCKED
                        </div>
                    )}
                </div>
            </div>

            {/* DEBUG: EndGame Stats */}
            {role === 'HIDER' && (
                <div className="absolute top-20 right-4 z-[120] bg-black/80 text-green-400 p-2 text-[10px] font-mono rounded pointer-events-none">
                    <div>Endgame: {isEndgame ? 'YES' : 'NO'}</div>
                    <div>In Zone: {seekers.filter((s: any) => {
                        if (!s.location) return false;
                        const pt = turf.point(s.location.coordinates);
                        const center = turf.point(hidingSpot!.coordinates);
                        return turf.distance(pt, center, { units: 'miles' }) <= 0.25;
                    }).length}</div>
                    <div>Total Seekers: {seekers.length}</div>
                    {seekers.map((s, i) => {
                        if (!s.location) return <div key={i}>S{i}: No Loc</div>;
                        const d = turf.distance(turf.point(s.location.coordinates), turf.point(hidingSpot!.coordinates), { units: 'miles' });
                        return <div key={i}>S{i}: {d.toFixed(3)}mi</div>
                    })}
                </div>
            )}
        </div>
    );
}
