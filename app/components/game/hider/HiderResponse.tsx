'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useGeolocation } from '../../../hooks/useGeolocation';
import * as turf from '@turf/turf';
import GooglePlacesAutocomplete from '../../ui/GooglePlacesAutocomplete';

interface HiderResponseProps {
    gameId: string;
    userId: string;
    hasVetoCard: boolean;
    hasRandomCard?: boolean;
    onVeto: (questionId: string) => void;
    onRandomize?: (questionId: string) => void;
    onAllow: (questionId: string, category: string) => void;
    onOcclusionChange?: (occluded: boolean) => void;
}

interface IncomingQuestion {
    id: string;
    category: string;
    question_text: string;
    params: any;
    status: 'pending_veto';
    answer_blob_url?: string;
}

export default function HiderResponse({ gameId, userId, hasVetoCard, hasRandomCard, onVeto, onRandomize, onAllow, onOcclusionChange }: HiderResponseProps) {
    const [incoming, setIncoming] = useState<IncomingQuestion | null>(null);
    const [status, setStatus] = useState<string>('initializing');
    const { location } = useGeolocation({ enabled: !!incoming });

    // Hider Matching State
    const [matchingHiderValue, setMatchingHiderValue] = useState<any>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [lastEvent, setLastEvent] = useState<string>('');
    const [uiStep, setUiStep] = useState<'ALERT' | 'INPUT'>('ALERT');

    // Notify parent about occlusion when Incoming presence changes
    useEffect(() => {
        if (onOcclusionChange) {
            onOcclusionChange(!!incoming);
        }
    }, [incoming, onOcclusionChange]);

    // Reset UI step when new question arrives
    useEffect(() => {
        if (incoming) setUiStep('ALERT');
    }, [incoming]);

    const subscribeToGame = () => {
        if (!gameId) {
            setStatus('NO_GAME_ID');
            return;
        }

        console.log("Attempting to subscribe...", gameId);
        setStatus('CONNECTING...');

        const channel = supabase.channel(`hider-questions-${gameId}`) // Removed Date.now() to prevent churn
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'questions',
                    filter: `game_id=eq.${gameId}`
                },
                (payload) => {
                    console.log("Hider - Realtime Payload:", payload);
                    setLastEvent(new Date().toLocaleTimeString());
                    setIncoming(payload.new as any);

                    // Force status to green if we get an event!
                    setStatus('SUBSCRIBED');
                }
            )
            .subscribe((st) => {
                console.log("Subscription status change:", st);
                setStatus(st);
            });

        return channel;
    };

    useEffect(() => {
        let channel: any;

        // Timeout to check if we are stuck
        const timer = setTimeout(() => {
            if (status === 'initializing' || status === 'CONNECTING...') {
                console.warn("Connection likely stuck. Re-trying...");
                // Note: We don't auto-retry here to avoid loops, just warn user
                setStatus('STUCK_CONNECTING');
            }
        }, 5000);

        channel = subscribeToGame();

        return () => {
            clearTimeout(timer);
            if (channel) supabase.removeChannel(channel);
        };
    }, [gameId]); // Only re-run if gameId changes

    const handleReconnect = () => {
        // Force re-mount or re-run effect? 
        // Easiest is to just re-call subscribe manually, but we need to cleanup old one.
        // Actually, forcing a reload of the page might be easier for the user, but let's try to just re-subscribe.
        window.location.reload();
    };

    // ... (ensureLocation) ...

    const handleAccept = async () => {
        if (!incoming) return;

        let answerText = '';
        let answerBlobUrl = null;

        // 1. RADAR
        if (incoming.category === 'radar') {
            // ... existing radar logic
            if (!location) { alert("GPS not locked!"); return; }
            let { center, radius } = incoming.params;

            // Normalize center
            if (center && !Array.isArray(center) && typeof center === 'object') {
                if (center.coordinates) center = center.coordinates;
                else if ('lng' in center && 'lat' in center) center = [center.lng, center.lat];
            }

            if (!center || !Array.isArray(center)) {
                console.error("Invalid Radar Center:", center);
                alert("Error: Invalid Radar Coordinates");
                return;
            }

            const userPt = turf.point([location.longitude, location.latitude]);
            const centerPt = turf.point(center);
            const dist = turf.distance(userPt, centerPt, { units: 'meters' });
            answerText = dist <= radius ? "YES" : "NO";
        }

        // 2. TENTACLES (RANGE CHECK + INPUT)
        else if (incoming.category === 'tentacles') {
            if (!location) { alert("GPS not locked!"); return; }

            // Check if user is in input mode (Phase 2)
            if (uiStep === 'INPUT') {
                if (!matchingHiderValue) {
                    alert("Please select the nearest location.");
                    return;
                }
                answerText = matchingHiderValue.text;
            }
            // Phase 1: Range Check
            else {
                const seekerLoc = incoming.params.seekerLoc;
                if (!seekerLoc) {
                    // Legacy fallback or error
                    answerText = "Error: No Seeker Location";
                } else {
                    const hiderPt = turf.point([location.longitude, location.latitude]);
                    const seekerPt = turf.point(seekerLoc);
                    const dist = turf.distance(hiderPt, seekerPt, { units: 'meters' });

                    const maxDist = incoming.params.dist || 1609; // Default 1mi

                    if (dist > maxDist) {
                        answerText = "NONE";
                    } else {
                        // IN RANGE -> Switch to Input
                        setUiStep('INPUT');
                        return; // Stop here, don't submit yet
                    }
                }
            }
        }



        // 4. MATCHING (UPDATED MANUAL LOGIC)
        else if (incoming.category === 'matching') {
            if (!matchingHiderValue) {
                alert("Please search for and select your location first.");
                return;
            }

            const label = incoming.params?.label || "Location";
            const seekerVal = incoming.params?.seekerValue; // String Name or Number Length
            const hiderVal = incoming.params?.label === "Station's Name Length" ? matchingHiderValue.text.length : matchingHiderValue.text;

            const match = String(seekerVal).toLowerCase().trim() === String(hiderVal).toLowerCase().trim();
            answerText = match ? "YES" : "NO";
        }

        // 5. MEASURING
        else if (incoming.category === 'measuring') {
            if (!location) { alert("GPS needed for measuring!"); return; }
            if (!matchingHiderValue) {
                alert("Please select the location first.");
                return;
            }

            // Calculate Hider Dist
            const hiderPt = turf.point([location.longitude, location.latitude]);
            const targetPt = turf.point(matchingHiderValue.center);
            const hiderDist = turf.distance(hiderPt, targetPt, { units: 'meters' });

            // Seeker Dist
            const seekerDist = incoming.params.seekerDist || 0;

            // Result
            const isGreater = hiderDist > seekerDist;
            answerText = isGreater ? "GREATER" : "LOWER";

            // Add context (clean this up if user wants minimal)
            // answerText += ` (You: ${Math.round(hiderDist)}m vs Them: ${Math.round(seekerDist)}m)`;
        }

        // 5. PHOTOS
        else if (incoming.category === 'photos') {
            // ... existing photos
            if (!photoFile) { alert("Select photo!"); return; }
            setUploading(true);
            const fileExt = photoFile?.name.split('.').pop();
            const fileName = `${gameId}/${Date.now()}.${fileExt}`;
            const { data, error } = await supabase.storage.from('game_uploads').upload(fileName, photoFile);
            if (error) { alert("Upload failed"); setUploading(false); return; }
            const { data: { publicUrl } } = supabase.storage.from('game_uploads').getPublicUrl(fileName);
            answerBlobUrl = publicUrl;
            answerText = "Photo Transmitted";
            setUploading(false);
        }

        // 6. THERMOMETER
        else if (incoming.category === 'thermometer') {
            // ... existing thermo
            if (!location) { alert("GPS not locked!"); return; }
            const hiderPt = turf.point([location.longitude, location.latitude]);
            const startPt = turf.point(incoming.params.start);
            const endPt = turf.point(incoming.params.end);
            const distToStart = turf.distance(hiderPt, startPt, { units: 'meters' });
            const distToEnd = turf.distance(hiderPt, endPt, { units: 'meters' });
            const isHotter = distToEnd < distToStart;
            answerText = isHotter ? "HOTTER" : "COLDER";
        }
        else {
            answerText = "OPENED";
        }

        // UPDATE DB
        await supabase.from('questions').update({
            status: 'answered',
            answer_text: answerText,
            answer_blob_url: answerBlobUrl,
            answered_at: new Date().toISOString()
        }).eq('id', incoming.id);

        onAllow(incoming.id, incoming.category);

        // BAN LOGIC: Ban this question for the rest of the run
        if (incoming.params?.defId) {
            supabase.from('game_bans').insert({
                game_id: gameId,
                type: 'QUESTION_ID',
                value: incoming.params.defId,
                reason: 'ASKED'
            }).then(({ error }) => {
                if (error) console.error("Auto-Ban Error:", error);
            });
        }

        setPhotoFile(null);
        setMatchingHiderValue(null);
        setIncoming(null); // Explicitly clear to dismiss modal
    };


    // ... (handleVeto) ...
    // ... (keep handleVeto) ...

    const handleVeto = async () => {
        if (!incoming) return;
        await supabase.from('questions').update({ status: 'vetoed' }).eq('id', incoming.id);

        // BAN LOGIC
        if (incoming.params?.defId) {
            supabase.from('game_bans').insert({
                game_id: gameId,
                type: 'QUESTION_ID',
                value: incoming.params.defId,
                reason: 'VETO'
            }).then(({ error }) => {
                if (error) console.error("Veto-Ban Error:", error);
            });
        }

        if (onVeto) onVeto(incoming.id);
        setIncoming(null); // Explicitly clear to dismiss modal
    };

    const handleRandomize = async () => {
        if (!incoming) return;
        // Update status to 'randomized' (Seeker will handle this state)
        // Or we treat it as 'vetoed' but with a different message?
        // User said: "randomize the question". This implies forcing a change.
        // Let's set status to 'randomized'.
        await supabase.from('questions').update({ status: 'randomized' }).eq('id', incoming.id);
        if (onRandomize) onRandomize(incoming.id);
        setIncoming(null);
    };

    // REMOVED: if (!incoming) return null; 

    return (
        <>
            {/* MODAL OVERLAY - Only show if incoming question exists */}
            {incoming && (
                <div className="absolute inset-0 z-[60] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in duration-300">

                    {/* --- STEP 1: ALERT VIEW --- */}
                    {uiStep === 'ALERT' && (
                        <div className="w-full max-w-md flex flex-col items-center text-center gap-6">
                            <div className="bg-red-500 text-white font-black text-xs uppercase px-4 py-1 rounded-full tracking-widest animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)]">
                                INCOMING TRANSMISSION
                            </div>

                            <div className="relative">
                                <div className="text-8xl filter drop-shadow-2xl animate-bounce-slow">
                                    {incoming.category === 'radar' && '📡'}
                                    {incoming.category === 'photos' && '📸'}
                                    {incoming.category === 'measuring' && '📏'}
                                    {incoming.category === 'matching' && '👯'}
                                    {incoming.category === 'tentacles' && '🐙'}
                                    {incoming.category === 'thermometer' && '🌡️'}
                                </div>
                            </div>

                            <div className="w-full bg-white text-slate-900 p-6 rounded-3xl shadow-2xl skew-y-1 border-b-8 border-slate-200">
                                <div className="text-slate-400 font-black text-xs uppercase tracking-widest mb-2">QUERY PARAMETERS</div>
                                <div className="text-3xl font-black uppercase leading-tight mb-4">{incoming.question_text}</div>

                                {incoming.params?.option?.desc && (
                                    <div className="bg-slate-100 p-3 rounded-xl text-left border border-slate-200">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">TASK</div>
                                        <div className="text-sm font-bold text-slate-700 leading-tight">{incoming.params.option.desc}</div>
                                    </div>
                                )}
                            </div>

                            <div className="w-full grid grid-cols-2 gap-4 mt-4">
                                {hasVetoCard && hasRandomCard ? (
                                    <div className="flex flex-col gap-2 h-full">
                                        <button
                                            onClick={handleVeto}
                                            disabled={uploading}
                                            className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg"
                                        >
                                            <span className="text-lg">🚫</span> VETO
                                        </button>
                                        <button
                                            onClick={handleRandomize}
                                            disabled={uploading}
                                            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg"
                                        >
                                            <span className="text-lg">🎲</span> REROLL
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={hasVetoCard ? handleVeto : (hasRandomCard ? handleRandomize : undefined)}
                                        disabled={(!hasVetoCard && !hasRandomCard) || uploading}
                                        className={`py-6 rounded-2xl font-black text-xl flex flex-col items-center justify-center border-b-8 active:border-b-0 active:translate-y-2 transition-all
                                            ${hasVetoCard
                                                ? 'bg-red-600 border-red-800 text-white hover:bg-red-500'
                                                : hasRandomCard
                                                    ? 'bg-purple-600 border-purple-800 text-white hover:bg-purple-500'
                                                    : 'bg-slate-800 border-slate-900 text-slate-500 cursor-not-allowed'}
                                        `}
                                    >
                                        <span>{hasVetoCard ? 'VETO' : hasRandomCard ? 'REROLL' : 'VETO'}</span>
                                        {hasVetoCard && <span className="text-[10px] opacity-70 font-normal uppercase mt-1">Cost: 1 Card</span>}
                                        {(!hasVetoCard && hasRandomCard) && <span className="text-[10px] opacity-70 font-normal uppercase mt-1">Cost: Randomize</span>}
                                    </button>
                                )}

                                <button
                                    onClick={() => {
                                        // Auto-proceed types check immediately? 
                                        // Or move to input/verify screen?
                                        if (['matching', 'measuring', 'photos'].includes(incoming.category)) {
                                            setUiStep('INPUT');
                                        } else if (incoming.category === 'tentacles') {
                                            // Tentacles checks range first in handleAccept, then switches to INPUT if valid
                                            handleAccept();
                                        } else {
                                            // Auto-types
                                            handleAccept();
                                        }
                                    }}
                                    className="py-6 bg-blue-500 border-b-8 border-blue-700 text-white rounded-2xl font-black text-xl flex flex-col items-center justify-center active:border-b-0 active:translate-y-2 transition-all hover:bg-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                                >
                                    <span>
                                        {incoming && (['matching', 'measuring', 'photos'].includes(incoming.category)) ? 'ANSWER'
                                            : incoming.category === 'tentacles' ? 'CHECK RANGE' : 'VERIFY GPS'}
                                    </span>
                                    <span className="text-[10px] opacity-70 font-normal uppercase mt-1">
                                        {incoming && (['matching', 'measuring', 'photos'].includes(incoming.category)) ? 'Requires Input'
                                            : incoming.category === 'tentacles' ? 'Auto-Check' : 'Auto-Check'}
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- STEP 2: INPUT VIEW --- */}
                    {uiStep === 'INPUT' && (
                        <div className="w-full max-w-md flex flex-col h-full pt-safe-top pb-safe-bottom">
                            <div className="flex items-center justify-between mb-6">
                                <button onClick={() => setUiStep('ALERT')} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm">← BACK</button>
                                <div className="font-black text-white text-lg uppercase tracking-wider">
                                    {incoming.category === 'matching' ? 'MATCH LOCATION' : 'UPLOAD INTEL'}
                                </div>
                                <div className="w-16" /> {/* Spacer */}
                            </div>

                            <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                                    <div className="text-xs text-slate-400 font-bold uppercase mb-1">Seeker Asked:</div>
                                    <div className="text-xl font-black text-white leading-tight">{incoming.question_text}</div>
                                </div>

                                {['matching', 'measuring'].includes(incoming.category) && (
                                    <div className="flex flex-col gap-4">
                                        <div className="text-white font-bold text-2xl px-2">
                                            What is your nearest <span className="text-blue-400 underline decoration-4 decoration-blue-500/30">{incoming.params?.label || 'Location'}</span>?
                                        </div>

                                        <div className="bg-slate-800 p-2 rounded-2xl border-2 border-slate-700">
                                            <GooglePlacesAutocomplete
                                                placeholder={`Type ${incoming.params?.label} name...`}
                                                onSelect={(val) => setMatchingHiderValue(val)}
                                                autoFocus={true}
                                            />
                                        </div>

                                        {matchingHiderValue ? (
                                            <div className="bg-emerald-500/10 border border-emerald-500/50 p-4 rounded-xl text-emerald-100 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2">
                                                <span className="text-2xl">📍</span>
                                                <div>
                                                    <div className="font-black text-lg">{matchingHiderValue.text}</div>
                                                    <div className="text-xs opacity-70">{matchingHiderValue.place_name}</div>
                                                    {incoming.category === 'matching' && incoming.params?.label === "Station's Name Length" && (
                                                        <div className="mt-2 text-sm font-mono bg-emerald-900/40 inline-block px-2 py-1 rounded">
                                                            LENGTH CALC: {matchingHiderValue.text.length}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center text-slate-500 text-sm font-bold italic py-8">
                                                Search and select a location above to confirm.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {incoming.category === 'tentacles' && (
                                    <div className="flex flex-col gap-4">
                                        <div className="text-white font-bold text-2xl px-2">
                                            You are in range!
                                            <div className="text-sm font-normal opacity-80 mt-1">Identify the nearest ONE to you:</div>
                                            <span className="text-blue-400 underline decoration-4 decoration-blue-500/30">{incoming.params?.label || 'Location'}</span>
                                        </div>

                                        <div className="bg-slate-800 p-2 rounded-2xl border-2 border-slate-700">
                                            <GooglePlacesAutocomplete
                                                placeholder={`Type ${incoming.params?.type || 'Place'} name...`}
                                                onSelect={(val) => setMatchingHiderValue(val)}
                                                autoFocus={true}
                                            />
                                        </div>

                                        {matchingHiderValue ? (
                                            <div className="bg-emerald-500/10 border border-emerald-500/50 p-4 rounded-xl text-emerald-100 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2">
                                                <span className="text-2xl">📍</span>
                                                <div>
                                                    <div className="font-black text-lg">{matchingHiderValue.text}</div>
                                                    <div className="text-xs opacity-70">{matchingHiderValue.place_name}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center text-slate-500 text-sm font-bold italic py-8">
                                                Search and select the location closest to you.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {incoming.category === 'photos' && (
                                    <div className="bg-slate-800 rounded-2xl p-6 border-2 border-dashed border-slate-600 hover:border-blue-500 transition-colors group cursor-pointer relative">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setPhotoFile(e.target.files?.[0] || null)}
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="flex flex-col items-center gap-4 py-8">
                                            <div className="text-6xl group-hover:scale-110 transition-transform">
                                                {photoFile ? '✅' : '📷'}
                                            </div>
                                            <div className="font-black text-white text-xl uppercase">
                                                {photoFile ? 'PHOTO SELECTED' : 'TAP TO CAPTURE'}
                                            </div>
                                            {photoFile && <div className="text-blue-400 font-bold">{photoFile.name}</div>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleAccept}
                                disabled={uploading || (incoming.category === 'matching' && !matchingHiderValue) || (incoming.category === 'photos' && !photoFile)}
                                className="w-full mt-4 mb-24 bg-emerald-500 border-b-8 border-emerald-700 text-white py-5 rounded-2xl font-black text-2xl shadow-xl active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50 disabled:grayscale hover:bg-emerald-400"
                            >
                                {uploading ? 'TRANSMITTING...' : 'CONFIRM & SEND'}
                            </button>
                        </div>
                    )}

                </div>
            )}

            {/* --- CONNECTION STATUS PILL --- */}
            {!incoming && (
                <div className="absolute top-28 left-4 z-[90] pointer-events-auto animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md shadow-sm border transition-all ${status === 'SUBSCRIBED'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${status === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span className="text-[10px] font-bold tracking-wider uppercase">
                            {status === 'SUBSCRIBED' ? 'SECURE' : 'STANDBY'}
                        </span>
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        className="p-1.5 rounded-full bg-white/80 shadow-sm border border-slate-200 text-slate-500 hover:text-slate-900 active:scale-90 transition-all"
                        title="Reload Page"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                    </button>
                </div>
            )}
        </>
    );
}
