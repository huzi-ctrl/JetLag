'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useGeolocation } from '../../hooks/useGeolocation';

interface LocationSyncProps {
    gameId: string;
    userId: string;
}

export default function LocationSync({ gameId, userId }: LocationSyncProps) {
    // High accuracy, 5s timeout
    const { location, error } = useGeolocation({ enableHighAccuracy: true });

    // Throttle updates
    const lastUpdateRef = useRef<number>(0);
    const THROTTLE_MS = 5000; // Update DB every 5 seconds max

    useEffect(() => {
        if (!location || !gameId || !userId) return;

        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) return;

        const pushLocation = async () => {
            const point = `POINT(${location.longitude} ${location.latitude})`;
            const { error: updateError } = await supabase
                .from('game_players')
                .update({
                    location: point,
                    last_seen: new Date().toISOString()
                })
                .eq('game_id', gameId)
                .eq('user_id', userId);

            if (updateError) {
                console.error("Error syncing location:", updateError);
            } else {
                // console.log("Location synced:", point);
                lastUpdateRef.current = now;
            }
        };

        pushLocation();

    }, [location, gameId, userId]);

    return null; // Invisible component
}
