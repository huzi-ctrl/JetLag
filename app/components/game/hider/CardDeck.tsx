'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { findNearestPOI } from '../../../lib/mapbox_utils';
import * as turf from '@turf/turf';
import GooglePlacesAutocomplete from '../../ui/GooglePlacesAutocomplete';

// --- Types ---
interface CardType {
    id: string; // Unique instance ID (e.g., time_red_0)
    defId: string; // Definition ID (e.g., time_red)
    name: string;
    type: 'TIME' | 'CURSE' | 'POWER';
    desc: string;
    color: string;
    tiers?: { small: string, medium: string, large: string }; // Value per game size
}

// --- Deck Definitions ---
import { DECK_DATA, QUESTION_DATA } from '../../../lib/game_data';
import BrainSelectorModal from './BrainSelectorModal';

// --- Deck Definitions ---
const generateFullDeck = (): CardType[] => {
    const deck: CardType[] = [];
    const add = (count: number, defId: string, name: string, type: 'TIME' | 'CURSE' | 'POWER', color: string, desc: string, tiers?: any) => {
        for (let i = 0; i < count; i++) {
            deck.push({
                id: `${defId}_${i}_${Math.random().toString(36).substr(2, 9)}`,
                defId, name, type, color, desc, tiers
            });
        }
    };

    // 1. TIME Cards
    DECK_DATA.TIME.forEach(c => {
        // Guess color based on ID for visual consistency
        let color = 'bg-slate-500';
        if (c.id.includes('red')) color = 'bg-red-500';
        if (c.id.includes('orange')) color = 'bg-orange-500';
        if (c.id.includes('yellow')) color = 'bg-yellow-400';
        if (c.id.includes('green')) color = 'bg-green-500';
        if (c.id.includes('blue')) color = 'bg-blue-600';

        add(c.count, c.id, c.name, 'TIME', color, 'Add time to the clock.', c.tier);
    });

    // 2. POWER Cards
    DECK_DATA.POWER.forEach(c => {
        add(c.count, c.id, c.name, 'POWER', 'bg-indigo-600', c.desc);
    });

    // 3. CURSES
    // Data has array of curses, but deck needs specific count.
    // Logic: 24 curses total. Shuffle curses list and pick.
    // Assuming 24 total curses in deck? 
    // Spreadsheet says 24 curses. The 'CURSES' array in data has definitions.
    // We'll just add one of each defined curse, and if we need more, we loop?
    // User data says "24 unique". So we add all of them.
    DECK_DATA.CURSES.forEach(c => {
        add(1, c.id, c.name, 'CURSE', 'bg-slate-800', c.desc, (c as any).tiers);
    });

    // Fill remaining if needed? The logic asks for specific counts.
    // The previous code had "24 curse_gen". Now we have unique ones.

    // Shuffle
    return deck.sort(() => Math.random() - 0.5);
};

// ... (imports remain)

// ... (CardType and generateFullDeck remain same)

import HiderResponse from './HiderResponse';

// ... (CardType and generateFullDeck remain same)

interface CardDeckProps {
    gameSize?: 'small' | 'medium' | 'large';
    gameId: string;
    userId: string;
    onOcclusionChange?: (occluded: boolean) => void;
    biasLocation?: { latitude: number, longitude: number } | null;
}

export default function CardDeck({ gameSize = 'medium', gameId, userId, onOcclusionChange, biasLocation }: CardDeckProps) {
    // --- State ---
    const [deck, setDeck] = useState<CardType[]>([]);
    const [hand, setHand] = useState<CardType[]>([]);
    const [discard, setDiscard] = useState<CardType[]>([]);

    // UI State
    const [isOpen, setIsOpen] = useState(false);
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [curseInputCard, setCurseInputCard] = useState<CardType | null>(null);
    const [incomingQuestionActive, setIncomingQuestionActive] = useState(false);

    // Drafting State (When Hider draws X but keeps Y)
    const [draftingCards, setDraftingCards] = useState<CardType[]>([]); // The X cards drawn
    const [draftKeepCount, setDraftKeepCount] = useState(0); // The Y cards to keep

    // Discard Mode State
    const [isDiscardMode, setIsDiscardMode] = useState(false);
    const [pendingCurseId, setPendingCurseId] = useState<string | null>(null);
    const [discardGoal, setDiscardGoal] = useState<{ count: number, draw: number } | null>(null);
    const [pendingAction, setPendingAction] = useState<'DRAW' | 'EXPAND' | 'DUPLICATE' | null>(null);
    const [pendingReward, setPendingReward] = useState<{ draw: number, keep: number } | null>(null);
    const [pendingDiscardReq, setPendingDiscardReq] = useState<{ count: number, type?: 'TIME' | 'POWER' } | null>(null);

    // Limit State
    const [maxHandSize, setMaxHandSize] = useState(6);
    const [loaded, setLoaded] = useState(false);

    // Drained Brain Post-Cast State
    const [brainSelectorOpen, setBrainSelectorOpen] = useState(false);
    const [brainCastId, setBrainCastId] = useState<string | null>(null); // The instance ID of the brain curse we just cast

    // Determine total occlusion
    const isOccluded = isOpen || incomingQuestionActive || !!curseInputCard || draftingCards.length > 0 || isDiscardMode;

    // Notify parent
    useEffect(() => {
        if (onOcclusionChange) {
            onOcclusionChange(isOccluded);
        }
    }, [isOccluded, onOcclusionChange]);

    // --- PERSISTENCE ---
    // 1. Load State on Mount
    useEffect(() => {
        const loadState = async () => {
            const { data, error } = await supabase
                .from('games')
                .select('hider_state')
                .eq('id', gameId)
                .single();

            if (data?.hider_state && Object.keys(data.hider_state).length > 0) {
                console.log("Loaded Persisted State:", data.hider_state);
                setDeck(data.hider_state.deck || []);
                setHand(data.hider_state.hand || []);
                setDiscard(data.hider_state.discard || []);
            } else {
                console.log("No persisted state, generating new deck.");
                setDeck(generateFullDeck());
            }
            setLoaded(true);
        };
        loadState();
    }, [gameId]);

    // 2. Save State on Change (Debounced slightly by nature of event loop, or explicit?)
    // We will save whenever critical state changes, ONLY if loaded.
    useEffect(() => {
        if (!loaded) return;

        const saveState = async () => {
            const { error } = await supabase
                .from('games')
                .update({
                    hider_state: {
                        deck,
                        hand,
                        discard
                    }
                })
                .eq('id', gameId);

            if (error) console.error("Error saving state:", error);
        };

        // Simple debounce could be added here if performance suffers, 
        // but for a card game, moves are sparse.
        saveState();

    }, [deck, hand, discard, loaded, gameId]);

    const activeCard = hand.find(c => c.id === selectedCardId);

    // --- Actions ---

    const shuffleDiscardIntoDeck = (currentDeck: CardType[], currentDiscard: CardType[]) => {
        const newDeck = [...currentDeck, ...currentDiscard].sort(() => Math.random() - 0.5);
        setDeck(newDeck);
        setDiscard([]);
        return newDeck;
    };

    // 1. Start Draw Process (Draw N, Pick K)
    const startDraw = (drawCount: number, keepCount: number) => {
        // REMOVED: Pre-emptive overflow check. We now allow drafting -> then discard.


        let currentDeck = deck;
        if (currentDeck.length < drawCount) {
            if (discard.length > 0) {
                currentDeck = shuffleDiscardIntoDeck(deck, discard);
            } else {
                alert("Deck Empty!");
                return;
            }
        }

        const drawn = currentDeck.slice(0, drawCount);
        const remaining = currentDeck.slice(drawCount);

        setDeck(remaining);
        setDraftingCards(drawn);
        setDraftKeepCount(keepCount);
    };

    // 2. Confirm Selection
    const confirmDraft = (keptCardIds: string[]) => {
        if (keptCardIds.length !== draftKeepCount) return;

        const kept = draftingCards.filter(c => keptCardIds.includes(c.id));
        const rejected = draftingCards.filter(c => !keptCardIds.includes(c.id));

        setHand(prev => [...prev, ...kept]);

        // Return rejected to Deck (Random splice)
        const newDeck = [...deck];
        rejected.forEach(c => {
            const spliceIdx = Math.floor(Math.random() * (newDeck.length + 1));
            newDeck.splice(spliceIdx, 0, c);
        });
        setDeck(newDeck);
        setDraftingCards([]);

        // CHECK OVERFLOW POST-DRAFT
        // We use the calculated new size: hand.length + kept.length
        const totalCards = hand.length + kept.length;
        if (totalCards > maxHandSize) {
            const excess = totalCards - maxHandSize;
            setDiscardGoal({ count: excess, draw: 0 });
            setIsDiscardMode(true);
            // keep isOpen false or whatever state handling?
            // Actually, DiscardModal is an overlay.
            // We don't set isOpen(true) yet.
            return;
        }

        setIsOpen(true);
    };

    // Helper: Draw N cards directly to hand
    const drawCardsToHand = (count: number) => {
        let currentDeck = deck;
        if (currentDeck.length < count) {
            if (discard.length > 0) {
                currentDeck = shuffleDiscardIntoDeck(deck, discard);
            } else {
                // Even after shuffle not enough? Just draw what we can.
            }
        }

        const drawn = currentDeck.slice(0, count);
        const remaining = currentDeck.slice(count);

        setDeck(remaining);
        setHand(prev => [...prev, ...drawn]);
    };

    // 3. Play Card
    const playCard = (id: string) => {
        const card = hand.find(c => c.id === id);
        if (!card) return;

        if (card.type !== 'CURSE') {
            // Remove from hand, add to discard
            setHand(prev => prev.filter(c => c.id !== id));
            setDiscard(prev => [...prev, card]);
            setSelectedCardId(null);
            setIsOpen(false);
        } else {
            // For curses, we keep it in hand until confirmed/cast
            // But we still close the drawer to show the Modal/Discard interactions?
            // Actually, if we close drawer, `CardView` in background might disappear?
            // But `CurseInputModal` is an overlay.
            // Let's just Close Drawer.
            setIsOpen(false);
            setSelectedCardId(null);
        }

        // Check for specific effects
        // Check for specific effects
        // 1. Discard Powerup & Expand
        if (card.defId.startsWith('pwr_discard') || card.defId === 'pwr_expand') {

            if (card.defId === 'pwr_expand') {
                // Expand: Discard 1, Increase Hand Size
                setDiscardGoal({ count: 1, draw: 0 });
                setPendingAction('EXPAND');
            } else {
                // Discard N Draw M
                const isD1 = card.defId === 'pwr_discard1';
                setDiscardGoal({ count: isD1 ? 1 : 2, draw: isD1 ? 2 : 3 });
                setPendingAction('DRAW');
            }

            setIsDiscardMode(true);
            return;
        }

        // 2. Duplicate Powerup
        if (card.defId === 'pwr_duplicate') {
            setPendingAction('DUPLICATE');
            setIsOpen(true); // Keep drawer open to select target
            alert("Select a card to duplicate!");
            return;
        }

        // 3. Curses interaction
        if (card.type === 'CURSE') {
            // Find definition in DECK_DATA to check for config
            const curseDef = DECK_DATA.CURSES.find(c => c.id === card.defId);

            // If it has a Discard Cost, simply trigger discard mode? 
            // OR do we want to confirm the cast first? 
            // User said: "once the user confirms... just laike teh discard 2 draw three cards"
            // But curses have a COST. We probably want to separate the "Pay Cost" from "Effect".
            // However, "Discard 2 cards" IS the cost.

            if (curseDef?.discardCost) {
                // Trigger discard mode to pay cost
                setDiscardGoal({ count: curseDef.discardCost, draw: 0 });
                setPendingCurseId(card.id);
                setPendingDiscardReq((curseDef as any).discardReq || null);
                setIsDiscardMode(true);
                return;
            }

            setCurseInputCard(card);
            setIsOpen(false); // Close hand drawer
            return;
        }
    };

    // 3b. Trash Card (Discard without Effect)
    const trashCard = (id: string) => {
        const card = hand.find(c => c.id === id);
        if (!card) return;

        // Remove from hand, add to discard
        setHand(prev => prev.filter(c => c.id !== id));
        setDiscard(prev => [...prev, card]);
        setSelectedCardId(null);
        setIsOpen(false);
    };

    // 4. Handle Discard Mode Confirm
    const handleDiscardConfirm = (cardsToDiscardIds: string[]) => {
        // Validation handled by Modal logic usually, but double check?

        // HANDLE CANCEL (Empty Selection)
        if (!cardsToDiscardIds || cardsToDiscardIds.length === 0) {
            // If we are cancelling, we must reset the pending states without executing.
            setPendingCurseId(null);
            setPendingDiscardReq(null);
            setPendingReward(null);
            setDiscardGoal(null);
            setIsDiscardMode(false);
            setIsOpen(true); // Re-open drawer so they can try again
            return;
        }

        const cardsToDiscard = hand.filter(c => cardsToDiscardIds.includes(c.id));
        const cardsToKeep = hand.filter(c => !cardsToDiscardIds.includes(c.id));

        // 1. Discard selected
        setDiscard(prev => [...prev, ...cardsToDiscard]);

        // 2. Update hand to only kept (temporarily)
        setHand(cardsToKeep);

        // 3. Draw replacements / Execute Effect
        if (pendingCurseId) {
            // This was a cost for a curse.
            // Execute the curse now.
            finalizeCurseCast(pendingCurseId);
            setPendingCurseId(null);
            setPendingDiscardReq(null);
        } else if (pendingReward) {
            // We cleared space for a pending reward draft
            // Use setTimeout to allow state to settle/modal to close before opening draft?
            // Actually, we can just call it (since it updates state).
            // But we need to ensure we don't trigger overflow check again incorrectly?
            // hand state is updated synchronously in setHand wrapper? No.
            // But we passed `cardsToKeep` to `setHand`.
            // So `startDraw` needs to use the NEW hand length.
            // `startDraw` uses `hand.state`.
            // We can pass the `cardsToKeep` length to `startDraw`? No, it reads state.

            // Simplest fix: Just allow the draft rendering logic to handle it, but `startDraw` modifies `deck` and `draftingCards`, which is fine.
            // BUT strict overflow check in `startDraw` relies on `hand.length`.
            // `setHand` is async.
            // We should Manually proceed with draft logic here instead of calling `startDraw` again?
            // OR use a `useEffect` on `pendingReward`? No.

            // Let's manually invoke the draft logic part of `startDraw` here, using the updated deck/hand references?
            // Actually, `startDraw` splits deck.
            // Let's extract the "Execute Draw" logic to a helper `executeDraw(deck, draw, keep)`.

            // For now, let's just hack it:
            // We know we discarded enough.
            // Just run the deck splice logic.

            let currentDeck = deck; // This is STALE? No, state update in confirmDiscard hasn't happened yet?
            // `confirmDiscard` calls `setHand` and `setDiscard`.
            // `deck` is unchanged by discard (unless we reshuffle).

            if (currentDeck.length < pendingReward.draw) {
                if (discard.length > 0) { // Current Discard + New Discards?
                    // This is complex. 
                    // Let's Trust React State updates if we can, OR just do it all here.
                }
            }

            // Let's use a timeout to let setHand settle, then call startDraw?
            // It's a bit dirty but works for this level of app.
            setTimeout(() => {
                startDraw(pendingReward.draw, pendingReward.keep);
            }, 100);

            setPendingReward(null);
            // Return early to avoid opening drawer if we are drafting
            setIsDiscardMode(false);
            setDiscardGoal(null);
            return;

        } else if (discardGoal) {
            // Powerup Action Execution
            if (pendingAction === 'EXPAND') {
                setMaxHandSize(prev => prev + 1);
                alert("Hand Limit Increased!");
            } else if (pendingAction === 'DRAW') {
                drawCardsToHand(discardGoal.draw);
            } else if (discardGoal.draw > 0) {
                // Fallback for standard discard/draw if pendingAction not set
                drawCardsToHand(discardGoal.draw);
            }
        }

        setPendingAction(null);
        setIsDiscardMode(false);
        setDiscardGoal(null);
        setIsOpen(true); // Re-open drawer
    };

    // --- HELPERS ---

    // --- HELPERS ---

    const validateCurseLogic = async (card: CardType, inputValue: any): Promise<boolean> => {
        if (card.defId === 'curse_agent') {
            // Handle both string (legacy/text) and object (Mapbox result) inputs
            const queryText = typeof inputValue === 'string' ? inputValue : inputValue?.value;
            const preCoords = (typeof inputValue === 'object' && inputValue?.coords) ? inputValue.coords : null;

            if (!queryText) {
                alert("Please enter a valid destination description.");
                return false;
            }

            // 1. Get Hider Location (Using geolocation API as fallback if not in props, but we should have it)
            // Ideally we pass hiderLoc as prop. For now, let's try to get it fresh or use a saved state?
            // CardDeck doesn't track location. Let's assume we can get it from browser.
            const getLoc = (): Promise<GeolocationPosition> => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));

            try {
                const pos = await getLoc();
                const hiderLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };

                // 2. Geocode User Input OR Use Pre-existing Coords
                let destPt;

                if (preCoords) {
                    destPt = turf.point(preCoords);
                } else {
                    const destPOI = await findNearestPOI(hiderLoc, queryText);
                    if (!destPOI) {
                        if (!confirm("Could not verify that location automatically. Proceed anyway?")) {
                            return false;
                        }
                        // If proceeding without verification, we skip the distance check
                        return true;
                    }
                    destPt = turf.point(destPOI.center); // [lon, lat]
                }
                const hiderPt = turf.point([hiderLoc.longitude, hiderLoc.latitude]);

                // 3. Get Seeker Location (Fetch from DB)
                const { data: players } = await supabase
                    .from('game_players')
                    .select('location')
                    .eq('game_id', gameId)
                    .eq('role', 'seeker'); // Assuming 'seeker' matches enum logic (might be 'SEEKER'?)

                // DB uses lowercase 'seeker'.
                // If multiple seekers, maybe just take the closest one to Hider?
                // The rule: "Farther from you than the seekers [are from you]."
                // So Dist(Hider, Dest) > Dist(Hider, Seeker).

                if (!players || players.length === 0) {
                    alert("No seekers found to validate distance against.");
                    return true;
                }

                // Calculate distances
                const destDistFromHider = turf.distance(hiderPt, destPt, { units: 'kilometers' });

                // Find closest seeker to the destination (best case for Seeker)
                // Rule: "Destination must be further from you than the seekers are." (Interpreted as: Dest is further from Hider than Dest is from Seeker)
                let minSeekerDistToDest = Infinity;

                players.forEach((p: any) => {
                    if (p.location) {
                        const coords = p.location.coordinates;
                        if (coords) {
                            const seekerPt = turf.point(coords);
                            const d = turf.distance(seekerPt, destPt, { units: 'kilometers' });
                            if (d < minSeekerDistToDest) minSeekerDistToDest = d;
                        }
                    }
                });

                if (minSeekerDistToDest === Infinity) {
                    // No valid seeker locations found
                    return true;
                }

                // Parse Max Distance from Tiers
                // Format: "0.25mi / 5min / 30min"
                let maxDistKm = Infinity;
                if ((card as any).tiers) {
                    const tierStr = (card as any).tiers[gameSize as keyof typeof card.tiers]; // "0.25mi / ..."
                    if (tierStr) {
                        const distPart = tierStr.split('/')[0].trim(); // "0.25mi"
                        const numericVal = parseFloat(distPart);
                        if (!isNaN(numericVal)) {
                            if (distPart.includes('mi')) {
                                maxDistKm = numericVal * 1.60934;
                            } else {
                                // Assume km if no unit or just raw number? Game data usually uses mi/ft. 
                                // "0.25mi" -> mi. If just "10" (like tumble), handled elsewhere.
                                maxDistKm = numericVal;
                            }
                        }
                    }
                }

                console.log(`Validation: Hider -> Dest: ${destDistFromHider.toFixed(2)} km, Seeker -> Dest: ${minSeekerDistToDest.toFixed(2)} km, MaxAllowed: ${maxDistKm.toFixed(2)} km`);

                if (destDistFromHider <= minSeekerDistToDest) {
                    alert(`Invalid Destination!\n\nDistance from You: ${destDistFromHider.toFixed(2)} km\nDistance from Seeker: ${minSeekerDistToDest.toFixed(2)} km\n\nRule: Destination must be further from YOU than from the Seekers.`);
                    return false;
                }

                if (minSeekerDistToDest > maxDistKm) {
                    alert(`Invalid Destination!\n\nDestination is ${minSeekerDistToDest.toFixed(2)}km from the Seeker.\nmax allowed: ${maxDistKm.toFixed(2)} km(${(maxDistKm / 1.609).toFixed(2)}mi) \n\nRule: Must be within designated range of seeker.`);
                    return false;
                }

            } catch (e) {
                console.error("Validation Error", e);
                // Allow pass on error?
                return true;
            }
        }
        return true;
    };

    const calculateExpiration = (defId: string, size: string): string | null => {
        // Hardcoded duration logic for timed curses from game data
        const TIMED_CURSES = ['curse_right', 'curse_bird', 'curse_gambler', 'curse_lemon'];
        if (!TIMED_CURSES.includes(defId)) return null;

        const def = DECK_DATA.CURSES.find(c => c.id === defId);
        if (!def?.tiers) return null;

        const valStr = def.tiers[size as keyof typeof def.tiers];
        if (!valStr) return null;

        // Tiers are usually just number strings for these ("20", "30")
        const minutes = parseInt(valStr);
        if (isNaN(minutes)) return null;

        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);
        return now.toISOString();
    };

    const finalizeCurseCast = async (cardId: string, inputVal?: any) => {
        console.log("finalizeCurseCast", cardId);
        // Optimistic UI update
        const toRemove = hand.find(c => c.id === cardId);
        if (toRemove) {
            setHand(prev => prev.filter(c => c.id !== cardId));
            setDiscard(prev => [...prev, toRemove]);
        } else {
            // If not found in current hand state, it implies it was already removed or state is stale.
            // We will try to proceed if we can find the card definition from another source, but for now let's just warn.
            // Actually, if toRemove is undefined, we can't persist the card details properly (name, defId).
            // However, `playCard` works by ID.
        }

        const card = hand.find(c => c.id === cardId) || toRemove;
        if (!card) {
            alert("Error: Card lost in transaction.");
            return;
        }

        // Extract input values
        const inputValue = inputVal?.inputValue || (typeof inputVal === 'string' ? inputVal : null);
        const imageUrl = inputVal?.imageUrl;

        // --- LOGIC VALIDATION ---
        const isValid = await validateCurseLogic(card, inputValue);

        if (!isValid) {
            // Revert Optimistic Update (since we failed validation)
            if (toRemove) {
                setHand(prev => [...prev, toRemove]);
                setDiscard(prev => prev.filter(c => c.id !== cardId));
            }
            return;
        }

        // --- SPECIFIC CURSE EFFECTS ---
        if (card.defId === 'curse_brain' && inputValue?.brainSelection) {
            try {
                const bans = inputValue.brainSelection.map((qId: string) => ({
                    game_id: gameId,
                    type: 'QUESTION_ID',
                    value: qId,
                    reason: 'BRAIN_CURSE'
                }));

                const { error: banError } = await supabase.from('game_bans').insert(bans);
                if (banError) {
                    console.error("Error banning questions:", banError);
                    alert("Failed to apply bans, but curse cast proceeded.");
                }
            } catch (err) {
                console.error("Error processing brain curse:", err);
            }
        }

        // --- FREEZE-FRAME LOGIC FOR TRAVEL AGENT ---
        let additionalMetadata: any = {};
        if (card.defId === 'curse_agent') {
            // We need to store the seeker location AT THIS MOMENT so the radar deduction is static.

            // Fix: Use RPC to get clean GeoJSON (avoids WKB hex issues)
            const { data: seekers, error: seekerErr } = await supabase
                .rpc('get_game_seekers', { p_game_id: gameId });

            if (seekerErr) console.error(`Error fetching seekers: ${seekerErr.message}`);

            if (seekers && seekers.length > 0) {
                let bestSeekerLoc: any = null;
                let bestSeekerId: any = null;
                let minD = Infinity;

                // Destination point
                const destVal = inputValue?.inputValue || inputValue;

                let destPt = null;
                if (typeof destVal === 'object' && destVal?.coords) {
                    destPt = turf.point(destVal.coords);
                }

                // Helper to extract coords (RPC returns JSON)
                const getCoords = (loc: any) => {
                    if (!loc) return null;
                    if (loc.coordinates) return loc.coordinates;
                    return loc; // Should be [lng, lat] directly if strictly returning coordinate array, but St_AsGeoJSON returns geometry object {type, coordinates}
                };

                // Find closest seeker
                seekers.forEach((p: any) => {
                    const coords = getCoords(p.location);
                    if (coords) {
                        if (destPt) {
                            const pt = turf.point(coords);
                            const d = turf.distance(pt, destPt);
                            if (d < minD) {
                                minD = d;
                                bestSeekerLoc = coords;
                                bestSeekerId = p.user_id;
                            }
                        } else {
                            // No dest, just grab first valid
                            if (!bestSeekerLoc) {
                                bestSeekerLoc = coords;
                                bestSeekerId = p.user_id;
                            }
                        }
                    }
                });

                // Fallback (if loop didn't set it due to no destPt logic)
                if (!bestSeekerLoc && seekers[0]) {
                    const coords = getCoords(seekers[0].location);
                    if (coords) {
                        bestSeekerLoc = coords;
                        bestSeekerId = seekers[0].user_id;
                    }
                }

                if (bestSeekerLoc) {
                    additionalMetadata.seekerLocSnapshot = bestSeekerLoc;
                    additionalMetadata.seekerIdSnapshot = bestSeekerId;
                }
            }
        }



        try {
            const { error } = await supabase
                .from('active_curses')
                .insert({
                    game_id: gameId,
                    curse_id: card.defId,
                    name: card.name,
                    description: card.desc,
                    image_url: imageUrl,
                    metadata: { ...(inputValue ? { value: inputValue } : {}), ...additionalMetadata }, // Merge snapshot 
                    expires_at: calculateExpiration(card.defId, gameSize),
                    created_at: new Date().toISOString()
                });

            if (error) {
                if (error.code === '42P01') {
                    alert("Curse Played! (Database table not ready yet, but local effect is active)");
                } else {
                    throw error;
                }
            } else {

                // If it's the Travel Agent curse, PERMANENTLY log the deduction mask
                if (card.defId === 'curse_agent' && additionalMetadata.seekerLocSnapshot) {
                    // Fix: Extract destVal again for persistence logic
                    const destVal = inputValue?.inputValue || inputValue;

                    let destPt = null;
                    if (typeof destVal === 'object' && destVal?.coords) {
                        destPt = destVal.coords;
                    }

                    alert(`DEBUG: Attempting Question Insert. DestPt: ${JSON.stringify(destPt)}`);

                    if (destPt && additionalMetadata.seekerIdSnapshot) {
                        const { error: qError } = await supabase.from('questions').insert({
                            game_id: gameId,
                            seeker_id: additionalMetadata.seekerIdSnapshot,
                            category: 'travel_agent',
                            status: 'answered', // Immediately active
                            question_text: `Curse: ${card.name}`,
                            answer_text: 'NO', // Meaning: Hider is NOT within the circle
                            params: {
                                dest: destPt,
                                seekerLoc: additionalMetadata.seekerLocSnapshot
                            },
                            created_at: new Date().toISOString()
                        });
                        if (qError) {
                            alert(`DEBUG: Insert Error: ${qError.message} Code: ${qError.code}`);
                            console.error("Error logging deduction event:", qError);
                        } else {
                            alert("DEBUG: Insert Success! Mask should appear.");
                        }
                    } else {
                        alert("DEBUG: Skipping Insert. Missing Dest or ID.");
                    }
                }

                alert(`CURSE CAST: ${card.name} !`);
                if (card.defId === 'curse_brain') {
                    setBrainSelectorOpen(true);
                }
            }
        } catch (err) {
            console.error("Error casting curse:", err);
            alert("Failed to save curse to server, but played locally.");
        }


        // Ensure modal is dismissed
        setCurseInputCard(null);
    };

    // 6. Handle Curse Cast
    const handleCastCurse = (cardId: string, inputVal?: any) => {
        const card = hand.find(c => c.id === cardId);
        if (!card) return;

        const curseDef = DECK_DATA.CURSES.find(c => c.id === card.defId);
        const cost = (curseDef as any)?.discardCost;
        // Robust check: explicitly check ID or the flag
        const isDiscardHand = (curseDef as any)?.discardHand || card.defId === 'curse_brain';

        setCurseInputCard(null); // Close input modal

        if (isDiscardHand) {
            console.log("DEBUG: Auto-Discard Hand Triggered");

            // Auto-discard all other cards logic
            const cardsToDiscard = hand.filter(c => c.id !== cardId);

            setDiscard((prev) => [...prev, ...cardsToDiscard]);
            setHand((prev) => prev.filter(c => c.id === cardId)); // Temporarily keep curse card for finalization (actually finalize does optimistic removal too)

            // Force finalize immediately
            finalizeCurseCast(cardId, inputVal);
            return;
        }

        if (cost && cost > 0) {
            const numCost = Number(cost);

            // Standard Cost Check
            if (hand.length < cost + 1) {
                alert(`Cost: Discard ${cost} cards. (You don't have enough)`);
                return;
            }

            // Trigger discard mode for cost
            setPendingCurseId(cardId);
            setDiscardGoal({ count: cost, draw: 0 });
            setPendingDiscardReq((curseDef as any).discardReq || null);
            setIsDiscardMode(true);
        } else {
            finalizeCurseCast(cardId, inputVal);
        }
    };


    // 5. Handle Hider Response (Veto / Randomize)
    const hasVetoCard = hand.some(c => c.defId === 'pwr_veto');
    const hasRandomCard = hand.some(c => c.defId === 'pwr_random');

    const onUseVeto = (questionId: string) => {
        const vetoCard = hand.find(c => c.defId === 'pwr_veto');
        if (vetoCard) {
            playCard(vetoCard.id);
            alert("VETOED! Card Used.");
        }
    };

    const onUseRandomize = (questionId: string) => {
        const randCard = hand.find(c => c.defId === 'pwr_random');
        if (randCard) {
            playCard(randCard.id);
            alert("RANDOMIZED! Card Used.");
        }
    };

    // 6. Handle Duplicate
    const handleDuplicate = (card: CardType) => {
        // Clone card
        const newCard = { ...card, id: `${card.defId}_copy_${Date.now()}` };
        setHand(prev => [...prev, newCard]);
        setPendingAction(null);
        alert(`Duplicated ${card.name}!`);
    };

    // Subscribe to Active Curses for passive effects (e.g. Chalice)
    const [activeCurses, setActiveCurses] = useState<any[]>([]);

    useEffect(() => {
        if (!gameId) return;
        const fetchCurses = async () => {
            const { data } = await supabase.from('active_curses').select('*').eq('game_id', gameId);
            if (data) setActiveCurses(data);
        };
        fetchCurses();

        const channel = supabase.channel(`hider-curses-${gameId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_curses' }, () => {
                fetchCurses();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [gameId]);

    const onAllowQuestion = (questionId: string, category: string) => {
        console.log("Allowed question", questionId, category);

        // Find Reward Data
        const catData = Object.values(QUESTION_DATA).find(c => c.id === category);
        if (catData) {
            // Trigger Draw
            let draw = catData.draw || 0;
            const keep = catData.keep || 0;

            // --- CURSE OF THE OVERFLOWING CHALICE BONUS & TRACKING ---
            const chaliceCurse = activeCurses.find(c => c.curse_id === 'curse_chalice');
            if (chaliceCurse) {
                draw += 1;
                // Increment Usage Logic
                const currentCount = (chaliceCurse.metadata?.count || 0) + 1;
                const limit = 3;

                if (currentCount >= limit) {
                    // Prevent double-delete race conditions
                    if ((chaliceCurse as any).deleting) return;
                    (chaliceCurse as any).deleting = true;

                    supabase.rpc('delete_active_curse_debug', { p_curse_row_id: chaliceCurse.id })
                        .then(({ data, error }) => {
                            if (error) {
                                console.error("Error removing chalice:", error);
                                // allow retry
                                (chaliceCurse as any).deleting = false;
                            } else {
                                if (data && data.startsWith('CURSE_NOT_FOUND')) {
                                    // Already deleted, treat as success
                                    alert("🍷 Overflowing Chalice has expired (3/3 questions).");
                                } else if (data === 'DELETED') {
                                    alert("🍷 Overflowing Chalice has expired (3/3 questions).");
                                } else {
                                    alert(`Curse Status: ${data}`);
                                }
                            }
                        });
                } else {
                    supabase.from('active_curses').update({
                        metadata: { ...chaliceCurse.metadata, count: currentCount }
                    }).eq('id', chaliceCurse.id).then();

                    setTimeout(() => alert(`🍷 Overflowing Chalice: Bonus Card! (${currentCount}/3)`), 500);
                }
            }

            if (draw > 0 && keep > 0) {
                startDraw(draw, keep);
            }
        }
    };

    // 7. Brain Curse Handler
    const handleBrainBanConfirm = async (qIds: string[]) => {
        console.log("handleBrainBanConfirm called with:", qIds);
        try {
            const bans = qIds.map((qId) => ({
                game_id: gameId,
                type: 'QUESTION_ID',
                value: qId,
                reason: 'BRAIN_CURSE'
            }));

            console.log("Attempting insert into game_bans:", bans);

            const { data, error } = await supabase.from('game_bans').insert(bans).select();

            if (error) {
                console.error("CRITICAL ERROR inserting game_bans:", error);
                alert(`Error saving bans: ${error.message}`);
                throw error;
            }

            console.log("Insert successful! Data:", data);

            setBrainSelectorOpen(false);
            setBrainCastId(null);
            alert("Questions Banned for Seekers.");

        } catch (err) {
            console.error("Error saving bans:", err);
            alert("Failed to save bans to server.");
        }
    };

    return (
        <>
            <HiderResponse
                gameId={gameId}
                userId={userId}
                hasVetoCard={hasVetoCard}
                hasRandomCard={hasRandomCard}
                onVeto={onUseVeto}
                onRandomize={onUseRandomize}
                onAllow={onAllowQuestion}
                onOcclusionChange={setIncomingQuestionActive}
            />

            {/* ... (Existing Modals) ... */}
            {/* Brain Selector Modal */}
            <BrainSelectorModal
                isOpen={brainSelectorOpen}
                gameId={gameId}
                onSuccess={() => {
                    setBrainSelectorOpen(false);
                    setBrainCastId(null);
                    alert("Questions Banned for Seekers.");
                }}
                onCancel={() => { }} // No cancel allowed after cost paid
            />

            {/* Curse Input Modal */}
            {curseInputCard && (
                <CurseInputModal
                    card={curseInputCard}
                    gameSize={gameSize}
                    gameId={gameId}
                    biasLocation={biasLocation}
                    onConfirm={finalizeCurseCast}
                    onCancel={() => {
                        setCurseInputCard(null);
                        setIsOpen(true);
                    }}
                />
            )}

            {/* ... Drafting Modal (Overlay) ... */}
            {draftingCards.length > 0 && (
                <DraftModal
                    cards={draftingCards}
                    keepCount={draftKeepCount}
                    onConfirm={confirmDraft}
                    gameSize={gameSize}
                />
            )}

            {/* ... Discard Mode Modal ... */}
            {isDiscardMode && (
                <DiscardModal
                    hand={pendingCurseId ? hand.filter(c => c.id !== pendingCurseId) : hand} // Don't let them discard the curse itself as cost!
                    onConfirm={handleDiscardConfirm}
                    gameSize={gameSize}
                    goal={discardGoal}
                    requirement={pendingDiscardReq}
                />
            )}

            {/* --- Hand Trigger (Bottom Center) --- */}
            {/* HIDE IF OCCLUDED */}
            {!isOccluded && (
                <div className="absolute bottom-safe-aligned left-1/2 -translate-x-1/2 pointer-events-auto z-50 animate-in fade-in slide-in-from-bottom-4">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="flex items-center justify-center w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all border-4 border-slate-800"
                    >
                        <div className="relative">
                            <span className="text-3xl">🃏</span>
                            {hand.length > 0 && (
                                <span className={`absolute -top-2 -right-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-slate-900 ${hand.length >= maxHandSize ? 'bg-red-600 animate-bounce' : 'bg-red-500'}`}>
                                    {hand.length}/{maxHandSize}
                                </span>
                            )}
                        </div>
                    </button>
                </div>
            )}

            {/* --- FULL SCREEN HAND (Slide from Bottom) --- */}
            <div
                className={`fixed inset-0 z-[100] bg-slate-800 transition-transform duration-300 ease-out transform ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
            >
                {/* Header */}
                <div className="p-4 bg-slate-900 shadow-sm flex justify-between items-center sticky top-0 z-10 pb-safe-top pt-safe-top">
                    <h3 className="font-black text-white text-2xl italic tracking-tighter">MY DECK</h3>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-full text-white hover:bg-white/20 font-bold text-xl"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 h-full overflow-y-auto pb-32">
                    <div className="flex gap-4 mb-6 px-2 overflow-x-auto">
                        <div className="text-center">
                            <div className="text-2xl font-black text-white">{hand.length}</div>
                            <div className="text-[10px] font-bold text-white/50 uppercase">Hand</div>
                        </div>
                        <div className="w-px bg-white/10 mx-2"></div>
                        <div className="text-center opacity-50">
                            <div className="text-2xl font-black text-white">{deck.length}</div>
                            <div className="text-[10px] font-bold text-white/50 uppercase">Draw Pile</div>
                        </div>
                        <div className="text-center opacity-50">
                            <div className="text-2xl font-black text-white">{discard.length}</div>
                            <div className="text-[10px] font-bold text-white/50 uppercase">Discard</div>
                        </div>
                    </div>

                    {hand.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-white/20">
                            <span className="text-6xl mb-4">📭</span>
                            <span className="text-xl font-bold">Your hand is empty.</span>
                            <span className="text-sm mt-2">Wait for Seekers to ask questions!</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            {hand.map(card => (
                                <div key={card.id} className="flex justify-center">
                                    <CardView
                                        card={card}
                                        gameSize={gameSize}
                                        onClick={() => {
                                            if (pendingAction === 'DUPLICATE') {
                                                handleDuplicate(card);
                                            } else {
                                                setSelectedCardId(card.id);
                                                setIsOpen(true);
                                            }
                                        }}
                                        highlight={pendingAction === 'DUPLICATE'}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Detail Overlay */}
                    {activeCard && (
                        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center p-6 bg-slate-900/95 backdrop-blur-md animate-in fade-in">
                            <CardView card={activeCard} gameSize={gameSize} big />
                            <div className="flex gap-3 mt-8 w-full max-w-xs z-30">
                                <button
                                    onClick={() => setSelectedCardId(null)}
                                    className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-sm"
                                >BACK</button>

                                <button
                                    onClick={() => {
                                        const actionLabel = activeCard.type === 'CURSE' ? 'Trash/Discard this card?' : 'Trash this card?';
                                        if (confirm(actionLabel)) {
                                            trashCard(activeCard.id);
                                        }
                                    }}
                                    className="flex-1 py-4 bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 rounded-2xl font-bold text-sm flex items-center justify-center gap-1"
                                >
                                    <span>🗑️</span> TRASH
                                </button>

                                {/* PLAY / CAST BUTTON */}
                                <button
                                    onClick={() => {
                                        if (activeCard.type === 'TIME') {
                                            alert("Time cards are tallied at the end of the game! Keep them in your hand.");
                                            return;
                                        }
                                        const actionLabel = activeCard.type === 'CURSE' ? 'Cast this curse?' : `Play ${activeCard.name}?`;
                                        if (confirm(actionLabel)) {
                                            playCard(activeCard.id);
                                        }
                                    }}
                                    className={`flex-[2] py-4 font-black rounded-2xl text-lg shadow-xl hover:scale-105 transition-transform ${activeCard.type === 'CURSE'
                                        ? 'bg-red-600 text-white hover:bg-red-500 shadow-red-900/50'
                                        : (activeCard.type === 'TIME' ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-100')
                                        }`}
                                >
                                    {activeCard.type === 'CURSE' ? 'CAST CURSE' : (activeCard.type === 'TIME' ? 'NO ACTION' : 'PLAY CARD')}
                                </button>


                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- DEBUG SPAWNER --- */}
            <div className="p-4 border-t border-slate-700 bg-slate-900/50">
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Debug Spawner</div>
                <select
                    className="w-full bg-slate-800 text-white rounded p-2 text-xs font-mono mb-2"
                    onChange={(e) => {
                        if (!e.target.value) return;
                        const defId = e.target.value;
                        // Find Def
                        let cardDef: any;
                        let type: any = 'TIME';
                        let color = 'bg-slate-500';

                        // Search all lists
                        cardDef = DECK_DATA.TIME.find(c => c.id === defId);
                        if (cardDef) {
                            type = 'TIME';
                            if (cardDef.id.includes('red')) color = 'bg-red-500';
                            else if (cardDef.id.includes('orange')) color = 'bg-orange-500';
                            else if (cardDef.id.includes('yellow')) color = 'bg-yellow-400';
                            else if (cardDef.id.includes('green')) color = 'bg-green-500';
                            else if (cardDef.id.includes('blue')) color = 'bg-blue-600';
                        }
                        else {
                            cardDef = DECK_DATA.POWER.find(c => c.id === defId);
                            if (cardDef) { type = 'POWER'; color = 'bg-indigo-600'; }
                            else {
                                cardDef = DECK_DATA.CURSES.find(c => c.id === defId);
                                if (cardDef) { type = 'CURSE'; color = 'bg-slate-800'; }
                            }
                        }

                        if (cardDef) {
                            const newCard: CardType = {
                                id: `${defId}_debug_${Date.now()}`,
                                defId: defId,
                                name: cardDef.name,
                                type: type,
                                color: color,
                                desc: cardDef.desc || 'Debug Spawned',
                                tiers: (cardDef as any).tiers || (cardDef as any).tier
                            };
                            setHand(prev => [...prev, newCard]);
                        }
                        e.target.value = '';
                    }}
                >
                    <option value="">+ Spawn Card</option>
                    <optgroup label="Powerups">
                        {DECK_DATA.POWER.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                    <optgroup label="Curses">
                        {DECK_DATA.CURSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                    <optgroup label="Time">
                        {DECK_DATA.TIME.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                </select>
            </div>
        </>
    );
}

function CardView({ card, gameSize, onClick, big, highlight }: { card: CardType, gameSize: string, onClick?: () => void, big?: boolean, highlight?: boolean }) {
    // 1. Get raw dynamic value for this size
    const rawVal = card.tiers ? card.tiers[gameSize as keyof typeof card.tiers] : null;

    // Debug logging for replacement issues
    // if (big && card.defId === 'curse_agent') {
    //     const debugInfo = JSON.stringify({
    //         id: card.id,
    //         gameSize,
    //         hasTiers: !!card.tiers,
    //         rawVal,
    //         tiers: card.tiers
    //     }, null, 2);
    //     // alert("DEBUG AGENT: " + debugInfo); // Commented out to prevent spam, uncomment if needed or check console
    //     console.log("DEBUG AGENT", debugInfo);
    // }

    // 2. Format Description: replace placeholders if rawVal is a string w/ info or simplified
    // Logic: If rawVal exists, we likely want to inject it into placeholders OR display it prominently.
    // For TIME cards: rawVal IS the value.
    // For CURSES: rawVal might be "10" for "{val} minutes".

    let displayDesc = card.desc;
    if (rawVal) {
        const strVal = String(rawVal);
        // Simple replacement of common keys
        // We added {val}, {time}, {dist}, {bonus}, {dur}, {retry}
        // Global replacement for robustness
        const parts = strVal.split('/').map(s => s.trim());

        displayDesc = displayDesc
            .split('{val}').join(strVal)
            .split('{time}').join(parts.length > 1 ? parts[1] : strVal) // Agent uses index 1
            .split('{dist}').join(parts[0]) // Agent uses index 0
            .split('{bonus}').join(parts.length > 2 ? parts[2] : strVal) // Agent uses index 2
            .split('{dur}').join(parts[0]) // Door uses index 0
            .split('{retry}').join(parts.length > 1 ? parts[1] : strVal); // Door uses index 1
    }

    // Lookup Cost for Curses
    let costText = "";
    if (big && card.type === 'CURSE') {
        const curseDef = DECK_DATA.CURSES.find(c => c.id === card.defId);
        if (curseDef) {
            costText = (curseDef as any).cost || "";
        }
    }

    // Apply interpolation to costText specifically
    if (costText && rawVal) {
        const strVal = String(rawVal);
        const parts = strVal.split('/').map(s => s.trim());
        costText = costText
            .split('{val}').join(strVal)
            .split('{time}').join(parts.length > 1 ? parts[1] : strVal)
            .split('{dist}').join(parts[0])
            .split('{bonus}').join(parts.length > 2 ? parts[2] : strVal)
            .split('{dur}').join(parts[0])
            .split('{retry}').join(parts.length > 1 ? parts[1] : strVal);
    }

    return (
        <div
            onClick={onClick}
            className={`
                relative flex flex-col justify-between text-white shadow-xl transition-all cursor-pointer overflow-hidden
                ${card.color}
                ${highlight ? 'ring-4 ring-yellow-400 scale-105 animate-pulse' : ''}
                ${big ? 'w-80 h-auto max-h-[75vh] rounded-3xl p-8 text-center overflow-y-auto' : 'w-32 h-44 rounded-2xl p-3 flex-shrink-0 hover:-translate-y-2'}
            `}
        >
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white to-transparent" />
            <div className={`font-black italic opacity-30 ${big ? 'text-6xl absolute top-4 right-4' : 'text-4xl absolute top-0 right-1'}`}>
                {card.type === 'TIME' ? '⏱' : card.type === 'CURSE' ? '☠' : '★'}
            </div>
            <div className="z-10 relative flex flex-col h-full">
                <div className={`font-black uppercase tracking-wider opacity-70 ${big ? 'text-sm mb-2' : 'text-[10px]'}`}>{card.type}</div>
                <div className={`font-black leading-none ${big ? 'text-3xl mb-4' : 'text-sm break-words'}`}>
                    {/* For Time Cards, show Value. For Curses, show Name. */}
                    {card.type === 'TIME' ? `${rawVal} minutes` : card.name}
                </div>
                {big && (
                    <div className="text-white/90 font-medium leading-relaxed mt-2 text-base border-t border-white/20 pt-4">
                        {displayDesc}
                    </div>
                )}
                {big && costText && (
                    <div className="mt-4 bg-red-900/30 border border-red-500/30 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">REQ. COST</div>
                        <div className="text-sm font-bold text-red-200">{costText}</div>
                    </div>
                )}
            </div>
            {/* Show Value Chip for non-Time cards if they have a tier value */}
            {
                (!big && rawVal && card.type !== 'TIME') && (
                    <div className="z-10 mt-auto bg-black/20 backdrop-blur-sm rounded px-2 py-1 text-center">
                        <span className="text-xs font-mono font-bold text-yellow-300">{rawVal}</span>
                    </div>
                )
            }
        </div >
    );
}

function DraftModal({ cards, keepCount, onConfirm, gameSize }: { cards: CardType[], keepCount: number, onConfirm: (ids: string[]) => void, gameSize: string }) {
    const [selected, setSelected] = useState<string[]>([]);
    const remaining = keepCount - selected.length;

    const toggle = (id: string) => {
        if (selected.includes(id)) setSelected(s => s.filter(x => x !== id));
        else if (selected.length < keepCount) setSelected(s => [...s, id]);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
            <div className="text-white text-center mb-8">
                <h2 className="text-4xl font-black italic mb-2">PICK {keepCount}</h2>
                <p className="text-lg opacity-80">{remaining > 0 ? `Select ${remaining} more...` : 'Ready!'}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-4 max-w-4xl max-h-[60vh] overflow-y-auto p-4">
                {cards.map(card => {
                    const isSelected = selected.includes(card.id);
                    return (
                        <div key={card.id} className={`transform transition-all duration-300 ${isSelected ? 'scale-105 ring-4 ring-white' : 'opacity-60 scale-95'}`}>
                            <CardView card={card} gameSize={gameSize} onClick={() => toggle(card.id)} />
                            {isSelected && <div className="absolute -top-3 -right-3 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-bold shadow-lg">✓</div>}
                        </div>
                    );
                })}
            </div>
            <button
                disabled={remaining > 0}
                onClick={() => onConfirm(selected)}
                className="mt-8 btn bg-white text-black px-12 py-4 rounded-full text-xl font-black shadow-2xl disabled:opacity-30 hover:scale-110"
            >
                CONFIRM
            </button>
        </div>
    );
}

function DiscardModal({ hand, onConfirm, gameSize, goal, requirement }: {
    hand: CardType[],
    onConfirm: (ids: string[]) => void,
    gameSize: string,
    goal: { count: number, draw: number } | null,
    requirement?: { count: number, type?: 'TIME' | 'POWER' } | null
}) {
    const [selected, setSelected] = useState<string[]>([]);

    // Default to "Select exactly count" if goal exists
    const targetCount = goal?.count || 1;

    const toggle = (id: string) => {
        if (selected.includes(id)) setSelected(s => s.filter(x => x !== id));
        else {
            // Enforce limit if we have a strict count goal
            if (selected.length < targetCount) setSelected(s => [...s, id]);
        }
    };

    const confirmSelection = () => {
        // Strict Validation
        if (requirement?.type) {
            const selectedCards = hand.filter(c => selected.includes(c.id));
            const validCount = selectedCards.filter(c => c.type === requirement.type).length;
            if (validCount < requirement.count) {
                alert(`You must discard at least ${requirement.count} ${requirement.type} card(s)!`);
                return;
            }
        }
        onConfirm(selected);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-indigo-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
            <div className="text-white text-center mb-8">
                <h2 className="text-4xl font-black italic mb-2">
                    {goal?.draw === 0 ? 'PAY COST' : 'DISCARD & DRAW'}
                </h2>

                {requirement ? (
                    <div className="text-xl opacity-90 mb-6 bg-red-500/20 border border-red-500 rounded-lg p-3 inline-block">
                        <span className="text-red-300 font-bold block text-sm">STRICT COST</span>
                        Must discard <span className="text-white font-black">{requirement.count} {requirement.type}</span> card(s).
                    </div>
                ) : (
                    <p className="text-lg opacity-80">
                        {goal?.draw === 0 ? `Must discard ${targetCount} cards.` : `Discard ${targetCount} to draw ${goal?.draw}.`}
                    </p>
                )}

                <div className="mt-2 text-2xl font-bold bg-white/20 inline-block px-4 py-1 rounded-lg">
                    Selected: {selected.length} / {targetCount}
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 max-w-4xl max-h-[60vh] overflow-y-auto p-4">
                {hand.length === 0 ? (
                    <div className="text-white/50 italic">Empty Hand! Nothing to discard.</div>
                ) : (
                    hand.map(card => {
                        const isSelected = selected.includes(card.id);
                        return (
                            <div key={card.id} className={`transform transition-all duration-300 ${isSelected ? 'translate-y-4 brightness-50 grayscale' : 'hover:-translate-y-2'}`}>
                                <CardView card={card} gameSize={gameSize} onClick={() => toggle(card.id)} />
                                {isSelected && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="text-5xl">🗑️</div>
                                </div>}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="flex gap-4 mt-8">
                <button
                    onClick={() => onConfirm([])}
                    className="btn bg-white/10 text-white px-8 py-3 rounded-full font-bold hover:bg-white/20"
                >
                    CANCEL
                </button>
                <button
                    disabled={selected.length !== targetCount}
                    onClick={confirmSelection}
                    className="btn bg-white text-black px-8 py-3 rounded-full text-xl font-black shadow-2xl disabled:opacity-30 hover:scale-110"
                >
                    CONFIRM
                </button>
            </div>
        </div>
    );
}

function CurseInputModal({ card, onConfirm, onCancel, gameSize, gameId, biasLocation }: { card: CardType, onConfirm: (id: string, val?: any) => void, onCancel: () => void, gameSize: string, gameId: string, biasLocation?: { latitude: number, longitude: number } | null }) {
    const curseDef = DECK_DATA.CURSES.find(c => c.id === card.defId);
    const [inputVal, setInputVal] = useState<any>(''); // Allow object for location
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    // Drained Brain State
    const [brainSelection, setBrainSelection] = useState<string[]>([]); // Array of question IDs
    const [brainCategory, setBrainCategory] = useState<string>('matching'); // UI Filter

    // Helper to flatten questions with IDs
    const getFlattenedQuestions = () => {
        const all: any[] = [];
        Object.entries(QUESTION_DATA).forEach(([catKey, catData]) => {
            const catId = catData.id;
            catData.questions.all.forEach((q: any, idx: number) => {
                all.push({
                    ...q,
                    id: `${catId}_${idx}`, // Synthetic ID
                    category: catId,
                    question: q.label // Map label to 'question' property for UI
                });
            });
        });
        return all;
    };

    const flatQuestions = getFlattenedQuestions();

    // Filter questions logic
    const getQuestionsByCategory = (cat: string) => {
        // cat argument is 'matching', 'trivia' etc (lowercase id)
        // QUESTION_DATA keys are UPPERCASE (MATCHING, MEASURING).
        // Our flatQuestions use lowercase `category` property from `catData.id`.
        return flatQuestions.filter(q => q.category === cat);
    };

    const toggleQuestion = (qId: string, qCat: string) => {
        // Enforce 3 questions from DIFFERENT categories.
        // If already selected, remove it.
        if (brainSelection.includes(qId)) {
            setBrainSelection(prev => prev.filter(id => id !== qId));
            return;
        }

        // Check if we already have a question from this category
        // First find categories of already selected
        const selectedCats = brainSelection.map(id => flatQuestions.find(q => q.id === id)?.category);
        if (selectedCats.includes(qCat)) {
            alert(`You already selected a question from ${qCat.toUpperCase()}! Please pick from different categories.`);
            return;
        }

        if (brainSelection.length >= 3) {
            alert("You can only select 3 questions.");
            return;
        }

        setBrainSelection(prev => [...prev, qId]);
    };

    // Extract input config
    const inputConfig = (curseDef as any)?.inputConfig;

    const handleConfirm = async () => {
        // Drained Brain Validation
        // Drained Brain Validation bypassed - handled in BrainSelectorModal
        if (card.defId === 'curse_brain') {
            // Pass empty selection - populated later
            onConfirm(card.id, { brainSelection: [] });
            return;
        }

        // Input Config Validation
        if (inputConfig) {
            // ... existing validation checks ...
            if (inputConfig.type === 'location' && (!inputVal || (typeof inputVal === 'string' && inputVal.length < 3))) {
                // Check if object? 
                // If inputVal is string (from legacy or direct edit), ensure length.
                // If inputVal is object {value, coords}, ensure value.
                const val = typeof inputVal === 'string' ? inputVal : inputVal?.value;
                if (!val) {
                    alert("Please enter a destination.");
                    return;
                }
            }
        }

        if (uploading) return;

        let imageUrl = null;

        if (inputConfig?.imageRequired) {
            if (!imageFile) {
                alert("This curse requires photo evidence!");
                return;
            }

            setUploading(true);
            try {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `curse-${Date.now()}.${fileExt}`;
                const filePath = `${gameId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('game-uploads')
                    .upload(filePath, imageFile);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('game-uploads').getPublicUrl(filePath);
                imageUrl = data.publicUrl;
            } catch (e) {
                console.error("Upload failed", e);
                alert("Failed to upload image.");
                setUploading(false);
                return;
            }
            setUploading(false);
        }

        onConfirm(card.id, { inputValue: inputVal, imageUrl });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in">
            <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 shadow-2xl border border-slate-700 max-h-[90vh] overflow-y-auto">
                <h2 className="text-3xl font-black italic text-white mb-2 uppercase text-center">Cast Curse</h2>
                <div className="flex justify-center mb-6">
                    <CardView card={card} gameSize={gameSize} />
                </div>

                <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-6">
                    <div className="text-red-400 text-xs font-bold uppercase mb-1">Casting Cost</div>
                    <div className="text-red-100 font-bold text-lg leading-tight">{curseDef?.cost}</div>
                </div>

                {/* Dynamic Input Types - Prioritize Brain Check! */}
                {/* Legacy Brain UI Removed - Handled by BrainSelectorModal */}
                {card.defId === 'curse_brain' ? (
                    <div className="mb-6 text-center text-slate-400 text-sm italic">
                        Confirm you have paid the casting cost above.
                    </div>
                ) : inputConfig ? (
                    <div className="mb-6 flex flex-col gap-4">
                        <label className="text-white text-sm font-bold uppercase block">{inputConfig.label}</label>

                        {/* Location Autocomplete */}
                        {inputConfig.type === 'location' ? (
                            <GooglePlacesAutocomplete
                                biasLocation={biasLocation}
                                placeholder="Search for a place..."
                                onSelect={(res) => {
                                    // Store standard string in inputVal (for UI state?) actually we need to pass object
                                    // Let's store logic:
                                    // We update inputVal to object? Or use separate state?
                                    // `inputVal` is `string` in current state definition. 
                                    // Let's change state to any or handle it.
                                    // CardDeck::CurseInputModal expects `inputVal` to be passed to onConfirm.
                                    // We'll JSON stringify it or just store object if we change state type?
                                    // Simple hack: setInputVal(res.text) but we lose coords.
                                    // Checking state def: `const [inputVal, setInputVal] = useState('');` -> inferred string.
                                    // Let's change it to `any`.
                                    setInputVal({ value: res.text, coords: res.center } as any);
                                }}
                            />
                        ) : (
                            /* Text/Number Input */
                            <input
                                type={inputConfig.type === 'number' ? 'number' : 'text'}
                                value={typeof inputVal === 'string' ? inputVal : (inputVal as any)?.value || ''}
                                onChange={e => setInputVal(e.target.value)}
                                className="w-full bg-slate-900 text-white rounded-xl p-4 font-bold border-2 border-slate-700 focus:border-red-500 outline-none"
                                placeholder="Enter value..."
                            />
                        )}

                        {/* Image Upload */}
                        {inputConfig.imageRequired && (
                            <div className="bg-black/20 p-4 rounded-xl border-2 border-dashed border-slate-600">
                                <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Evidence Required</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => setImageFile(e.target.files ? e.target.files[0] : null)}
                                    className="text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-white hover:file:bg-slate-600"
                                />
                                {imageFile && <div className="mt-2 text-green-400 text-xs">Selected: {imageFile.name}</div>}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mb-6 text-center text-slate-400 text-sm italic">
                        Confirm you have paid the casting cost above.
                    </div>
                )}


                <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        disabled={uploading}
                        className="flex-1 py-4 bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-600 disabled:opacity-50"
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={uploading}
                        className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black shadow-lg hover:bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                CASTING...
                            </>
                        ) : 'CAST CURSE'}
                    </button>
                </div>
            </div>
        </div>
    );
}
