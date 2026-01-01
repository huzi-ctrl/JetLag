'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useGeolocation } from '../../../hooks/useGeolocation';
import { QUESTION_DATA, DECK_DATA, getAllQuestions } from '../../../lib/game_data';
import * as turf from '@turf/turf';
import GooglePlacesAutocomplete from '../../ui/GooglePlacesAutocomplete';

interface SeekerHUDProps {
    gameId: string;
    userId: string;
    gameSize: 'small' | 'medium' | 'large';
    onOcclusionChange?: (occluded: boolean) => void;
}

export default function SeekerHUD({ gameId, userId, gameSize, onOcclusionChange }: SeekerHUDProps) {
    // State
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'ASK' | 'HISTORY'>('ASK');
    const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
    const [selectedOption, setSelectedOption] = useState<any | null>(null);
    const [askHistory, setAskHistory] = useState<{ id: string, timestamp: number, status?: string, category?: string, question_text?: string, answer_text?: string, answer_blob_url?: string, questionId: string, params?: any }[]>([]);


    // Matching Manual Input State
    const [matchingInputOpen, setMatchingInputOpen] = useState(false);
    const [matchingManualValue, setMatchingManualValue] = useState<any>(null);

    const [rerollPreview, setRerollPreview] = useState<{ text: string, params: any, category: string } | null>(null);
    const [canDismissPreview, setCanDismissPreview] = useState(false); // 5s Timer lock

    // Answer Modal State
    const [incomingAnswer, setIncomingAnswer] = useState<any>(null);
    const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');

    // Thermometer State
    const [thermoStart, setThermoStart] = useState<number[] | null>(null);
    const [thermoTarget, setThermoTarget] = useState<number>(0);
    const [thermoDist, setThermoDist] = useState<number>(0);

    // Active Curses State
    const [activeCurses, setActiveCurses] = useState<any[]>([]);
    const [viewingCurse, setViewingCurse] = useState<any | null>(null);
    const [bans, setBans] = useState<any[]>([]);

    const flattenedQuestions = getAllQuestions();

    // Occlusion Logic
    const isOccluded = isOpen || matchingInputOpen || !!thermoStart || !!incomingAnswer || !!rerollPreview || !!viewingCurse;

    useEffect(() => {
        if (onOcclusionChange) {
            onOcclusionChange(isOccluded);
        }
    }, [isOccluded, onOcclusionChange]);

    // GPS
    const { location } = useGeolocation({ enabled: isOpen || !!thermoStart });

    // Computed
    const activeCategory = selectedCategoryKey ? QUESTION_DATA[selectedCategoryKey as keyof typeof QUESTION_DATA] : null;

    // Helpers
    const getOptions = () => {
        if (!activeCategory) return [];

        // Filter flattenedQuestions by category to get ID-rich objects
        const categoryQuestions = flattenedQuestions.filter(q => q.category === activeCategory.id);

        // Map questions to include ban status
        const questionsWithStatus = categoryQuestions.map(q => {
            const isBanned = bans.some(b => b.type === 'QUESTION_ID' && b.value === q.id);

            // Check if used in history
            const isUsed = askHistory.some(h => {
                const hOpt = h.params?.option;
                if (!hOpt) return false;

                // Compare labels (handles string vs object options)
                const hLabel = typeof hOpt === 'string' ? hOpt : hOpt.label;
                return hLabel === q.label;
            });

            return { ...q, isBanned, isUsed };
        });

        return questionsWithStatus;
    };

    // Effects
    // Thermometer Tracking
    useEffect(() => {
        if (thermoStart && location) {
            const startPt = turf.point(thermoStart);
            const currPt = turf.point([location.longitude, location.latitude]);
            const d = turf.distance(startPt, currPt, { units: 'meters' });
            setThermoDist(d);
        }
    }, [location, thermoStart]);

    // History Subs
    useEffect(() => {
        if (!gameId) return;

        const fetchHistory = async () => {
            const { data } = await supabase.from('questions').select('*').eq('game_id', gameId).eq('seeker_id', userId).order('created_at', { ascending: false });
            if (data) setAskHistory(data as any);
        };
        fetchHistory();

        const channel = supabase.channel(`seeker-history-${gameId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `game_id=eq.${gameId}` }, (payload) => {
                const q = payload.new as any;
                if (q.seeker_id === userId) {
                    fetchHistory();

                    // Detect Answer/Veto/Randomize
                    if (payload.eventType === 'UPDATE' && (q.status === 'answered' || q.status === 'vetoed' || q.status === 'randomized')) {
                        // Check if this is a fresh update (avoid re-triggering if we keep history open?)
                        // Realtime only fires on change, so it is fresh.
                        setIncomingAnswer(q);
                    }
                }
            })
            .subscribe((status) => {
                setConnectionStatus(status);
            });

        return () => { supabase.removeChannel(channel); };
    }, [gameId, userId]);

    // Active Curses Subs (Mirrors Questions Logic)
    useEffect(() => {
        console.log("DEBUG: SeekerHUD Active Curses Effect Triggered. GameID:", gameId);
        if (!gameId) return;

        const fetchCurses = async () => {
            console.log(`DEBUG: Fetching curses for gameId: ${gameId}`);
            const { data, error } = await supabase.from('active_curses').select('*').eq('game_id', gameId).order('created_at', { ascending: false });

            if (error) {
                console.error("DEBUG: Error fetching active_curses:", error);
            } else {
                console.log(`DEBUG: Fetched ${data?.length} active curses:`, data);
                if (data) setActiveCurses(data);
            }
        };
        fetchCurses();

        const channel = supabase.channel(`active-curses-${gameId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'active_curses', filter: `game_id=eq.${gameId}` }, (payload) => {
                console.log("DEBUG: Curse INSERT detected:", payload);
                const newCurse = payload.new;
                setActiveCurses(prev => [newCurse, ...prev]); // Optimistic add
                setViewingCurse(newCurse); // Auto-open the new curse!
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'active_curses', filter: `game_id=eq.${gameId}` }, (payload) => {
                console.log("DEBUG: Curse DELETE detected:", payload);
                // For delete, we need the ID. With Replica Identity FULL we get it.
                // If not, we fetch. But let's try to filter optimistically if we have the ID.
                const oldRecord = payload.old;
                if (oldRecord && oldRecord.id) {
                    setActiveCurses(prev => prev.filter(c => c.id !== oldRecord.id));
                } else {
                    fetchCurses();
                }
            })
            // Merging game_bans into this channel to save connections, or we can separate if strictly following "questions" pattern. 
            // Questions pattern only has one table per channel usually, but here we have bans too. 
            // I'll keep bans here but use the same filter style.
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_bans', filter: `game_id=eq.${gameId}` }, (payload) => {
                setBans(prev => [...prev, payload.new]);
            })
            .subscribe((status) => {
                console.log(`DEBUG: Active Curses Channel Status: ${status}`);
            });

        // Initial fetch for bans
        console.log("DEBUG: Fetching bans...");
        supabase.from('game_bans').select('*').eq('game_id', gameId).then(({ data, error }) => {
            if (error) {
                console.error("DEBUG: Error fetching game_bans:", error);
            } else {
                console.log(`DEBUG: Fetched ${data?.length} bans:`, data);
                if (data) setBans(data);
            }
        });

        return () => { supabase.removeChannel(channel); };
    }, [gameId]);

    // Auto-open new curses (Modal Pop-up)
    const prevCursesLength = useRef(0);
    useEffect(() => {
        if (activeCurses.length > prevCursesLength.current) {
            // A new curse was added!
            const newest = activeCurses[0];
            if (newest) setViewingCurse(newest);
        } else if (activeCurses.length < prevCursesLength.current) {
            // A curse was removed!
            // We can't easily know WHICH one without diffing, but a generic toast is fine.
            // Or we check which ID is missing.
            // Simplified:
            alert("✨ A CURSE HAS BEEN LIFTED!");
        }
        prevCursesLength.current = activeCurses.length;
    }, [activeCurses]);

    // --- REROLL LOGIC ---
    // --- HANDLERS ---
    const submitQuestion = async (text: string, params: any = {}, categoryOverride: string | null = null) => {
        // Optimistic UI updates could go here
        const cat = categoryOverride || activeCategory?.id;

        const { error } = await supabase.from('questions').insert({
            game_id: gameId,
            seeker_id: userId,
            category: cat,
            question_text: text,
            params: params,
            status: 'pending_veto' // Default state, Hider sees this
        });

        if (error) {
            console.error("Error asking question:", error);
            alert("Failed to send question. check connection.");
        } else {
            // Reset UI
            setIsOpen(false); // Close drawer
            setSelectedCategoryKey(null);
            setSelectedOption(null);
            setMatchingManualValue(null);
            setMatchingInputOpen(false);
        }
    };

    const handleConfirmMatching = () => {
        if (!matchingManualValue) return;

        const label = selectedOption.label || selectedOption;
        let finalQuestionText = "";

        if (activeCategory?.id === 'matching') {
            if (label === "Station's Name Length") {
                finalQuestionText = `Matching: Station Name Length (${matchingManualValue.text.length})`;
            } else {
                finalQuestionText = `Is the nearest ${label} the same as my nearest ${label}?`;
            }
        } else if (activeCategory?.id === 'measuring') {
            finalQuestionText = `Is your distance to the nearest ${label} greater or less than mine?`;
        } else {
            finalQuestionText = `${activeCategory?.name}: ${matchingManualValue.text}`;
        }

        submitQuestion(finalQuestionText, {
            manual_value: matchingManualValue,
            option: selectedOption,
            label: label
        });
    };

    const handleAsk = () => {
        if (!selectedOption) return;

        // Force Input for Matching & Measuring
        if (activeCategory?.id === 'matching' || activeCategory?.id === 'measuring') {
            setMatchingInputOpen(true);
            return;
        }

        // Specific Logic for Radar
        if (activeCategory?.id === 'radar') {
            if (!location) {
                alert("GPS Signal required for Radar check!");
                return;
            }
            const radius = (selectedOption as any).val; // e.g. 1609
            const label = (selectedOption as any).label;

            submitQuestion(`Radar Check: ${label}`, {
                option: selectedOption,
                center: [location.longitude, location.latitude],
                radius: radius
            });
            return;
        }

        // Specific Logic for Thermometer
        if (activeCategory?.id === 'thermometer') {
            if (!location) {
                alert("GPS Signal required for Thermometer check!");
                return;
            }
            const dist = (selectedOption as any).val; // meters

            // Initialize Tracking
            setThermoStart([location.longitude, location.latitude]);
            setThermoTarget(dist);
            setIsOpen(false); // Close menu to show overlay
            return;
        }

        // Specific Logic for Tentacles
        if (activeCategory?.id === 'tentacles') {
            if (!location) {
                alert("GPS Signal required for Tentacles check!");
                return;
            }
            const opt = selectedOption as any;

            submitQuestion(`Tentacles: ${opt.label}`, {
                type: opt.type,
                dist: opt.dist,
                seekerLoc: [location.longitude, location.latitude],
                label: opt.label,
                option: selectedOption
            });
            return;
        }

        // Standard Questions
        const label = typeof selectedOption === 'string' ? selectedOption : selectedOption.label;
        submitQuestion(`${activeCategory?.name}: ${label}`, { option: selectedOption });
    };

    useEffect(() => {
        if (incomingAnswer?.status === 'randomized') {
            const timer = setTimeout(() => {
                handleReroll(incomingAnswer.category, incomingAnswer.params);
            }, 5000); // 5s delay to assure user sees the "REROLLED" status
            return () => clearTimeout(timer);
        }
    }, [incomingAnswer]);

    // Preview Timer - REMOVED (Shifted to initial alert)
    useEffect(() => {
        if (rerollPreview) {
            setCanDismissPreview(true);
        }
    }, [rerollPreview]);

    const handleReroll = (category: string, oldParams: any = {}) => {
        console.log("Auto-Rerolling category:", category, oldParams);

        // 1. Get Data
        const catData = Object.values(QUESTION_DATA).find(c => c.id === category);
        if (!catData) {
            console.error("Auto-Reroll Error: Category not found", category);
            alert(`Error: Reroll failed. Category '${category}' not found.`);
            setIncomingAnswer(null);
            return;
        }

        // 2. Select a NEW Random Option
        // Data structure is `catData.questions.all`
        const options = (catData as any).questions?.all;
        if (!options || options.length === 0) {
            console.error("Auto-Reroll Error: No options found for", category);
            alert(`Error: No questions available for aut-reroll in '${category}'.`);
            setIncomingAnswer(null);
            return;
        }

        const randomOpt = options[Math.floor(Math.random() * options.length)];
        let questionText = "";
        let params: any = {};

        // 3. Construct Question based on Category

        // A. MATCHING / MEASURING
        // Reuse old Seeker Values (Location/Distance) but change the Target Label
        if (category === 'matching' || category === 'measuring') {
            const label = randomOpt.label || randomOpt;

            if (category === 'matching') {
                questionText = `Is the nearest ${label} the same as my nearest ${label}?`;
                // Reuse old params but override 'label'
                params = { ...oldParams, label: label };
            } else {
                questionText = `Is your distance to nearest ${label} greater/lower than mine?`;
                params = { ...oldParams, label: label };
            }
        }
        // B. THERMOMETER
        // Reuse old Start/End but change the Target Value
        else if (category === 'thermometer') {
            // The 'val' from randomOpt is the new target distance (e.g., 1609 for 1 mile)
            const label = randomOpt.label; // e.g., "1 Mile"
            questionText = `Thermometer Check (REROLL: ${label})`;
            // We pass the new option directly, the Hider will interpret it as the new goal.
            // oldParams should contain 'start' and 'end' if it was a thermometer question.
            params = { ...oldParams, forcedOption: randomOpt };
        }
        // C. TENTACLES
        else if (category === 'tentacles') {
            const opt = randomOpt as any;
            // Use old location if available (from oldParams.seekerLoc) to avoid GPS dependency failure on reroll?
            const loc = oldParams.seekerLoc || (location ? [location.longitude, location.latitude] : null);

            if (!loc) {
                alert("GPS signal lost. Cannot reroll Tentacles.");
                setIncomingAnswer(null);
                return;
            }
            questionText = `Tentacles: ${opt.label}`;
            params = { type: opt.type, dist: opt.dist, seekerLoc: loc, label: opt.label };
        }
        // D. RADAR
        else if (category === 'radar') {
            // New Radius
            const radius = randomOpt.val || 1609;
            const label = randomOpt.label;

            // Check for center
            if (!oldParams.center && !oldParams.seekerLoc && !location) {
                alert("Reroll Active! Please manually select a new target point.");
                setIncomingAnswer(null);
                return;
            }

            // Reuse center (from old 'center' or 'seekerLoc' or current location if all else fails?)
            // Usually Radar stores 'center' (lng,lat) and 'radius' (m). 
            // We reuse the point, just change the radius.
            params = { ...oldParams, radius: radius, option: randomOpt };
            questionText = `Radar Check: ${label}`;
        }
        // E. PHOTOS, GENERAL
        else {
            const label = typeof randomOpt === 'string' ? randomOpt : (randomOpt as any).label;
            questionText = `${catData.name}: ${label}`;
            params = { option: randomOpt };
        }

        // Show Preview instead of auto-submitting
        setRerollPreview({ text: questionText, params: params, category: category });
        setIncomingAnswer(null); // Dismiss "REROLLED" alert
    };

    // Handlers


    // Helper to format description with tiered values
    const formatCurseDescription = (curse: any) => {
        const def = DECK_DATA.CURSES.find(c => c.id === curse.curse_id);
        if (!def) return curse.description;

        // Get raw tier value for game size
        const tiers = (def as any).tiers;
        const rawVal = tiers ? tiers[gameSize as keyof typeof tiers] : null;

        if (!rawVal) return curse.description;

        const strVal = String(rawVal);
        const parts = strVal.split('/').map(s => s.trim());

        let desc = curse.description;
        desc = desc.split('{val}').join(strVal);
        desc = desc.split('{time}').join(parts.length > 1 ? parts[1] : strVal);
        desc = desc.split('{dist}').join(parts[0]);
        desc = desc.split('{bonus}').join(parts.length > 2 ? parts[2] : strVal);
        desc = desc.split('{dur}').join(parts[0]);
        desc = desc.split('{retry}').join(parts.length > 1 ? parts[1] : strVal);

        return desc;
    };

    const handleThermoCheck = async () => {
        if (!thermoStart || !location) return;

        const params = {
            start: thermoStart,
            end: [location.longitude, location.latitude]
        };

        const { error } = await supabase.from('questions').insert({
            game_id: gameId,
            seeker_id: userId,
            category: 'thermometer',
            question_text: `Thermometer Check (${Math.round(thermoDist)}m)`,
            params: params,
            status: 'pending_veto'
        });

        if (error) alert("Error submitting check");
        setThermoStart(null);
        setThermoTarget(0);
        setThermoDist(0);
    };

    const handleCurseAction = async (action: 'fail' | 'complete', curseActiveId: string, curseDefId: string) => {
        const curseDef = DECK_DATA.CURSES.find(c => c.id === curseDefId);

        // 1. Delete Active Curse
        // Optimistic update
        setActiveCurses(prev => prev.filter(c => c.id !== curseActiveId));

        const { error } = await supabase.from('active_curses').delete().eq('id', curseActiveId);
        if (error) {
            console.error("Error deleting curse:", error);
            alert("Failed to resolve curse. Please try again.");
            // Revert optimistic update? Or just let fetchCurses sync it eventually.
            // For now, failure is rare enough.
            return;
        }

        // 2. Handle specific logic
        if (action === 'fail') {
            // Logic: Add time to Hider (Bonus Time)
            // Default penalty: 5 mins
            const penalty = curseDef?.failed_penalty || 5;

            // Fetch current bonus time first to increment safely
            const { data: gameData } = await supabase.from('games').select('bonus_time').eq('id', gameId).single();
            const currentBonus = gameData?.bonus_time || 0;

            const { error: gameError } = await supabase.from('games')
                .update({ bonus_time: currentBonus + penalty })
                .eq('id', gameId);

            if (gameError) console.error("Error updating bonus time:", gameError);
            else alert(`Curse Failed! Hider gained +${penalty} minutes.`);
        } else {
            // Complete
            alert("Curse Completed and Removed!");
        }

        setViewingCurse(null);
    };

    return (
        <>
            {/* --- CONNECTION STATUS PILL --- */}
            {!isOccluded && (
                <div className="absolute top-28 left-4 z-[90] pointer-events-auto animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md shadow-sm border transition-all ${connectionStatus === 'SUBSCRIBED'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${connectionStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span className="text-[10px] font-bold tracking-wider uppercase">
                            {connectionStatus === 'SUBSCRIBED' ? 'LINKED' : 'OFFLINE'}
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

            {/* --- ACTIVE CURSE BANNER --- */}
            <div className="absolute top-28 right-4 z-[90] flex flex-col gap-2 pointer-events-auto animate-in slide-in-from-right fade-in">
                {activeCurses.map(curse => {
                    const timeLeft = curse.expires_at ? Math.max(0, Math.ceil((new Date(curse.expires_at).getTime() - Date.now()) / 60000)) : null;

                    return (
                        <button
                            key={curse.id}
                            onClick={() => setViewingCurse(curse)}
                            className="bg-red-600 text-white px-3 py-1.5 rounded-full shadow-lg border-2 border-red-400 flex items-center gap-2 hover:scale-105 transition-transform"
                        >
                            <span className="animate-pulse">☠</span>
                            <div className="flex flex-col items-start leading-none">
                                <span className="text-[10px] font-black uppercase tracking-widest max-w-[100px] truncate">{curse.name}</span>
                                {timeLeft !== null && (
                                    <span className="text-[9px] font-mono font-bold bg-black/20 px-1 rounded mt-0.5">
                                        {timeLeft} MIN LEFT
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* --- CURSE DETAIL MODAL --- */}
            {viewingCurse && (
                <div className="fixed inset-0 z-[130] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <div className="w-full max-w-sm bg-slate-800 rounded-3xl p-6 shadow-2xl border border-red-500/30 text-center relative">
                        <div className="text-6xl mb-4 opacity-80">☠</div>
                        <h2 className="text-2xl font-black text-white italic uppercase mb-2 leading-none text-red-100">{viewingCurse.name}</h2>

                        <div className="bg-black/30 rounded-xl p-4 my-4 border border-white/5 max-h-[40vh] overflow-y-auto">
                            <p className="text-slate-300 text-sm font-medium leading-relaxed">{formatCurseDescription(viewingCurse)}</p>

                            {/* Metadata / Evidence */}
                            {viewingCurse.metadata?.value && (
                                <div className="mt-4 bg-white/10 p-3 rounded-lg text-left">
                                    <div className="text-[10px] text-white/50 font-bold uppercase mb-1">Hider Input</div>
                                    <div className="text-white font-mono text-sm">
                                        {typeof viewingCurse.metadata.value === 'object'
                                            ? viewingCurse.metadata.value.value || JSON.stringify(viewingCurse.metadata.value)
                                            : viewingCurse.metadata.value}
                                    </div>
                                </div>
                            )}

                            {viewingCurse.image_url && (
                                <div className="mt-4 rounded-lg overflow-hidden border-2 border-white/10">
                                    <div className="text-[10px] text-white/50 font-bold uppercase p-2 bg-black/40">Evidence</div>
                                    <img src={viewingCurse.image_url} alt="Proof" className="w-full h-auto" />
                                </div>
                            )}
                        </div>

                        <div className="text-xs text-red-400 font-bold uppercase tracking-widest mb-6 animate-pulse">
                            ACTIVE CURSE EFFECT
                        </div>

                        <button
                            onClick={() => setViewingCurse(null)}
                            className="w-full py-4 bg-slate-700 text-white rounded-xl font-black hover:bg-slate-600"
                        >
                            CLOSE
                        </button>

                        {/* --- ACTION BUTTONS FOR TASK CURSES --- */}
                        {(() => {
                            const def = DECK_DATA.CURSES.find(c => c.id === viewingCurse.curse_id);
                            if (!def) return null;

                            return (
                                <div className="flex flex-col gap-2 mt-2 w-full">
                                    {def.completable && (
                                        <button
                                            onClick={() => handleCurseAction('complete', viewingCurse.id, viewingCurse.curse_id)}
                                            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-500 shadow-lg border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 transition-all"
                                        >
                                            MARK COMPLETE
                                        </button>
                                    )}

                                    {def.failed_condition && (
                                        <button
                                            onClick={() => handleCurseAction('fail', viewingCurse.id, viewingCurse.curse_id)}
                                            className="w-full py-4 bg-rose-600 text-white rounded-xl font-black hover:bg-rose-500 shadow-lg border-b-4 border-rose-800 active:border-b-0 active:translate-y-1 transition-all"
                                        >
                                            FAIL & DISMISS (+{def.failed_penalty || 5}m)
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                    <button
                        onClick={() => setViewingCurse(null)}
                        className="mt-6 text-white/50 text-sm font-bold hover:text-white"
                    >
                        CANCEL / CLOSE
                    </button>
                </div>
            )}

            {/* --- INCOMING ANSWER MODAL (BLOCKING) --- */}
            {
                incomingAnswer && (
                    <div className="fixed inset-0 z-[120] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
                        <div className="w-full max-w-sm flex flex-col items-center gap-6">
                            <div className={`text-xs font-black uppercase px-4 py-1 rounded-full tracking-widest animate-pulse shadow-[0_0_20px_rgba(255,255,255,0.2)] 
                            ${incomingAnswer.status === 'vetoed' ? 'bg-red-500 text-white'
                                    : incomingAnswer.status === 'randomized' ? 'bg-purple-500 text-white'
                                        : 'bg-green-500 text-white'}`}>
                                {incomingAnswer.status === 'vetoed' ? 'TRANSMISSION BLOCKED'
                                    : incomingAnswer.status === 'randomized' ? 'SIGNAL SCRAMBLED'
                                        : 'INTEL RECEIVED'}
                            </div>

                            <div className="text-8xl filter drop-shadow-2xl animate-bounce-slow">
                                {incomingAnswer.status === 'vetoed' ? '🚫'
                                    : incomingAnswer.status === 'randomized' ? '🎲'
                                        : '📬'}
                            </div>

                            <div className="w-full bg-white text-slate-900 p-6 rounded-3xl shadow-2xl skew-y-1 border-b-8 border-slate-200">
                                <div className="text-slate-400 font-black text-xs uppercase tracking-widest mb-2">QUERY</div>
                                <div className="text-xl font-black uppercase leading-tight mb-4 text-slate-600">{incomingAnswer.question_text}</div>

                                <div className="h-px bg-slate-200 w-full my-4" />

                                <div className="text-slate-400 font-black text-xs uppercase tracking-widest mb-2">RESPONSE</div>
                                {incomingAnswer.status === 'vetoed' ? (
                                    <div className="text-4xl font-black text-red-600 uppercase">VETOED</div>
                                ) : incomingAnswer.status === 'randomized' ? (
                                    <div className="text-4xl font-black text-purple-600 uppercase">REROLLED</div>
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        <div className="text-4xl font-black text-slate-900 uppercase leading-none">{incomingAnswer.answer_text}</div>
                                        {incomingAnswer.answer_blob_url && (
                                            <div className="rounded-xl overflow-hidden border-4 border-slate-100 shadow-inner">
                                                <img src={incomingAnswer.answer_blob_url} alt="Proof" className="w-full h-auto object-cover" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setIncomingAnswer(null)}
                                disabled={incomingAnswer.status === 'randomized'}
                                className={`btn w-full bg-white text-slate-900 py-4 text-xl font-black rounded-xl shadow-lg hover:bg-slate-100 active:scale-95 border-b-4 border-slate-200 active:border-b-0 active:translate-y-1 transition-all ${incomingAnswer.status === 'randomized' ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                            >
                                {incomingAnswer.status === 'randomized' ? 'PLEASE WAIT (REROLLING)...' : 'DISMISS'}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* --- THERMOMETER UI --- */}
            {
                thermoStart && (
                    <div className="absolute top-safe left-4 right-4 z-[110] pointer-events-auto animate-in slide-in-from-top fade-in duration-300">
                        <div className="bg-slate-900/90 text-white p-4 rounded-xl shadow-2xl border border-blue-500/50 backdrop-blur-md flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl animate-pulse">🌡️</span>
                                    <div>
                                        <div className="font-black text-sm uppercase tracking-wider text-blue-400">Tracking Active</div>
                                        <div className="text-xs text-slate-400">Target: {thermoTarget}m</div>
                                    </div>
                                </div>
                                <div className="text-3xl font-black font-mono">{Math.round(thermoDist)}<span className="text-sm text-slate-500 ml-1">/{thermoTarget}m</span></div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-blue-500 h-full transition-all duration-1000 ease-out"
                                    style={{ width: `${Math.min(100, (thermoDist / thermoTarget) * 100)}%` }}
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setThermoStart(null); setThermoTarget(0); }}
                                    className="px-4 py-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleThermoCheck}
                                    disabled={thermoDist < thermoTarget}
                                    className="flex-1 px-4 py-3 rounded-lg bg-blue-600 text-white font-black hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/50"
                                >
                                    {thermoDist < thermoTarget ? `WALK ${(thermoTarget - Math.round(thermoDist))}m MORE` : 'CHECK READING'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Match Input Modal */}
            {
                matchingInputOpen && selectedOption && activeCategory && (
                    <div className="fixed inset-0 z-[120] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in">
                        <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-700">
                            <h3 className="text-white font-black text-lg uppercase tracking-wider mb-2">
                                {activeCategory.id === 'matching' ? 'Identify Your Match' : 'Identify Your Reference'}
                            </h3>
                            <p className="text-slate-400 text-xs mb-6 font-bold leading-relaxed">
                                {selectedOption.label === "Station's Name Length"
                                    ? "Search for your nearest station. We will use the length of its name."
                                    : `To ask this, you must first identify your nearest ${selectedOption.label || "location"}.`}
                            </p>

                            <div className="mb-6">
                                <GooglePlacesAutocomplete
                                    placeholder={`Search for ${selectedOption.label}...`}
                                    onSelect={(val) => setMatchingManualValue(val)}
                                    autoFocus={true}
                                />
                            </div>

                            {matchingManualValue && (
                                <div className="bg-slate-700/50 p-4 rounded-xl border border-slate-600 mb-6 flex items-start gap-3">
                                    <span className="text-lg">📍</span>
                                    <div>
                                        <div className="text-white font-bold">{matchingManualValue.text}</div>
                                        <div className="text-slate-400 text-xs">{matchingManualValue.place_name}</div>
                                        {selectedOption.label === "Station's Name Length" && (
                                            <div className="mt-2 text-emerald-400 text-xs font-mono font-black border-t border-slate-600 pt-2">
                                                LENGTH: {matchingManualValue.text.length} CHARS
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setMatchingInputOpen(false); setMatchingManualValue(null); }}
                                    className="flex-1 py-3 bg-slate-700 text-slate-300 font-bold rounded-xl hover:bg-slate-600"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleConfirmMatching}
                                    disabled={!matchingManualValue}
                                    className="flex-[2] py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                                >
                                    CONFIRM & ASK
                                </button>
                            </div>
                        </div>
                    </div>

                )
            }

            {/* --- REROLL REVIEW MODAL --- */}
            {
                rerollPreview && (
                    <div className="fixed inset-0 z-[130] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
                        <div className="w-full max-w-sm flex flex-col items-center gap-6">
                            <div className="text-xs font-black uppercase px-4 py-1 rounded-full tracking-widest bg-purple-600 text-white animate-pulse shadow-[0_0_20px_rgba(147,51,234,0.5)]">
                                FORCED REROLL
                            </div>

                            <div className="text-8xl filter drop-shadow-2xl animate-spin-slow">
                                🎲
                            </div>

                            <div className="w-full bg-white text-slate-900 p-6 rounded-3xl shadow-2xl skew-y-1 border-b-8 border-slate-200">
                                <div className="text-slate-400 font-black text-xs uppercase tracking-widest mb-2">NEW ASSIGNMENT</div>
                                <div className="text-xl font-black uppercase leading-tight mb-4 text-purple-700">{rerollPreview.text}</div>
                                <p className="text-xs font-medium text-slate-500">
                                    The Hider used a Randomize powerup. You must ask this question instead.
                                </p>
                            </div>

                            <button
                                onClick={() => {
                                    submitQuestion(rerollPreview.text, rerollPreview.params, rerollPreview.category);
                                    setRerollPreview(null);
                                }}
                                className="w-full py-4 bg-purple-600 text-white font-black rounded-xl hover:bg-purple-500 shadow-xl border-b-4 border-purple-800 active:border-b-0 active:translate-y-1 transition-all"
                            >
                                CONFIRM & ASK
                            </button>
                        </div>
                    </div>
                )
            }

            {/* --- COMMS LINK (Main Button) --- */}
            {/* HIDDEN IF OCCLUDED */}
            {
                !isOccluded && (
                    <div className="absolute bottom-safe-aligned left-1/2 -translate-x-1/2 pointer-events-auto z-50 animate-in fade-in slide-in-from-bottom-4">
                        <button
                            onClick={() => { setIsOpen(true); }}
                            className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-full shadow-2xl border-2 border-slate-700 hover:scale-105 active:scale-95 transition-all w-64"
                        >
                            <span className="text-2xl">⚡</span>
                            <span className="font-black tracking-wider">COMMS LINK</span>
                        </button>
                    </div>
                )
            }



            {/* --- MAIN DRAWER (Questions & History) --- */}
            <div className={`fixed inset-0 z-[100] bg-slate-50/95 backdrop-blur-sm transition-transform duration-300 ease-out transform ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="p-4 bg-white shadow-sm flex flex-col gap-4 pb-4 pt-safe-top">
                    <div className="flex justify-between items-center px-2">
                        <div className="font-black text-slate-300 text-xs tracking-widest uppercase">Select Frequency</div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="bg-slate-200 px-4 py-2 rounded-lg text-slate-600 font-bold text-xs hover:bg-slate-300 active:scale-95 transition-all"
                        >
                            CLOSE MAP ✕
                        </button>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab('ASK')}
                            className={`flex-1 py-3 rounded-lg font-black text-sm tracking-wide transition-all ${activeTab === 'ASK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            ASK COMMAND
                        </button>
                        <button
                            onClick={() => setActiveTab('HISTORY')}
                            className={`flex-1 py-3 rounded-lg font-black text-sm tracking-wide transition-all ${activeTab === 'HISTORY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            COMM LOG
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-4 h-full overflow-y-auto pb-48">
                    {activeTab === 'HISTORY' && (
                        <div className="space-y-4">
                            {askHistory.length === 0 ? (
                                <div className="text-center text-slate-400 mt-10 italic">No questions asked yet.</div>
                            ) : (
                                askHistory.map((q) => (
                                    <div key={q.id + '_' + q.timestamp} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-black text-slate-900 uppercase text-xs tracking-wider">{q.category}</span>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase 
                                                ${q.status === 'answered' ? 'bg-green-100 text-green-700' :
                                                    q.status === 'vetoed' ? 'bg-red-100 text-red-700' :
                                                        'bg-yellow-100 text-yellow-700'}`}>
                                                {q.status}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-700 font-bold mb-3 leading-snug">{q.question_text}</div>

                                        {q.answer_text && (
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2">
                                                <div className="text-[10px] uppercase text-slate-400 font-bold">Intel Received:</div>
                                                <div className="text-lg font-black text-slate-800">{q.answer_text}</div>
                                            </div>
                                        )}
                                        {q.answer_blob_url && (
                                            <div className="mt-2 rounded-lg overflow-hidden border border-slate-200">
                                                <img src={q.answer_blob_url} alt="Proof" className="w-full h-auto" />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'ASK' && (
                        !selectedCategoryKey ? (
                            <div className="grid grid-cols-1 gap-3">
                                {Object.entries(QUESTION_DATA).map(([key, type]) => {
                                    // Check for Category Ban
                                    const isBanned = bans.some(b => b.type === 'CATEGORY' && b.value === key);
                                    if (isBanned) return null; // Hide banned categories

                                    // Check Blocking
                                    const blockingCurse = activeCurses.find(ac => {
                                        const def = DECK_DATA.CURSES.find(d => d.id === ac.curse_id);
                                        return def?.blocking;
                                    });
                                    const isDisabled = !!blockingCurse;

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => {
                                                if (isDisabled) {
                                                    alert(`BLOCKED BY CURSE: ${DECK_DATA.CURSES.find(c => c.id === blockingCurse.curse_id)?.name}\n\nYou cannot ask questions until this curse is resolved.`);
                                                    return;
                                                }
                                                setSelectedCategoryKey(key);
                                            }}
                                            disabled={isDisabled}
                                            className={`p-4 rounded-2xl shadow-sm border-2 text-left transition-all flex items-center justify-between group
                                                ${isDisabled ? 'bg-slate-50 border-transparent opacity-60 grayscale cursor-not-allowed' : 'bg-white border-slate-100 hover:border-blue-500 hover:shadow-lg active:scale-[0.99]'}
                                            `}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 flex items-center justify-center bg-slate-50 rounded-xl text-2xl">{type.icon}</div>
                                                <div>
                                                    <div className="font-black text-sm text-slate-900 uppercase tracking-wide">{type.name}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                                                        Draw {type.draw} • Keep {type.keep} {type.timeLimit ? `• ${type.timeLimit}m` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-xl text-blue-200 group-hover:text-blue-500">➜</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="animate-in slide-in-from-right duration-200 h-full flex flex-col">
                                <button
                                    onClick={() => { setSelectedCategoryKey(null); setSelectedOption(null); }}
                                    className="bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold px-4 py-2 rounded-lg flex items-center gap-2 mb-4 w-fit active:scale-95 transition-all"
                                >
                                    <span className="text-lg">←</span> BACK TO CATEGORIES
                                </button>

                                <div className="flex items-center gap-4 mb-4">
                                    <div className="text-4xl bg-white rounded-xl p-2 shadow-sm border border-slate-100">{activeCategory?.icon}</div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{activeCategory?.name}</h2>
                                        <p className="text-slate-500 font-medium text-xs mt-1 leading-tight">{activeCategory?.desc}</p>
                                    </div>
                                </div>

                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">SELECT OPTION</h3>

                                <div className="flex-1 overflow-y-auto pb-4">
                                    <div className="grid grid-cols-1 gap-2">
                                        {getOptions().map((opt: any, i: number) => {
                                            const label = typeof opt === 'string' ? opt : opt.label;
                                            // Fix: Compare by ID if possible, or Label as fallback (stable across renders)
                                            const isSelected = selectedOption && (opt.id ? selectedOption.id === opt.id : selectedOption.label === label);
                                            const isBanned = opt.isBanned; // Check banned status
                                            const isUsed = opt.isUsed; // Check used status

                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        if (isBanned) {
                                                            alert("This question is BANNED by a curse!");
                                                            return;
                                                        }
                                                        if (isUsed) {
                                                            return; // No alert needed, visual cue is enough, but prevent selection
                                                        }
                                                        setSelectedOption(opt);
                                                    }}
                                                    disabled={isBanned || isUsed}
                                                    className={`p-3 rounded-lg text-left text-sm font-bold transition-all border-2
                                                        ${isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-md' :
                                                            (isBanned || isUsed) ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed opacity-60 grayscale' :
                                                                'bg-white text-slate-600 border-slate-100 hover:border-blue-300'
                                                        }
                                                    `}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span>{label}</span>
                                                        {isBanned && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-black uppercase">BANNED</span>}
                                                        {isUsed && !isBanned && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-black uppercase">USED</span>}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>


                                <button
                                    disabled={!selectedOption}
                                    onClick={handleAsk}
                                    className="w-full mt-4 mb-24 btn bg-slate-900 text-white rounded-2xl py-5 text-lg shadow-xl font-black flex justify-center items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                                >
                                    <span>CONFIRM REQUEST</span>
                                    {activeCategory?.id === 'radar' && !location && <span className="text-[10px] animate-pulse ml-2">(NO GPS)</span>}
                                </button>
                                <div className="h-24 w-full shrink-0" />
                            </div>
                        )
                    )}
                </div>
            </div >
        </>
    );
}
