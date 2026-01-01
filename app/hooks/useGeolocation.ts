import { useState, useEffect } from 'react';

interface Location {
    latitude: number;
    longitude: number;
    accuracy: number;
    heading: number | null;
    speed: number | null;
    timestamp: number;
}

interface GeolocationOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
    enabled?: boolean;
}

export const useGeolocation = ({ enabled = true, enableHighAccuracy = true, timeout = 15000, maximumAge = 0 }: GeolocationOptions = {}) => {
    const [location, setLocation] = useState<Location | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        // --- 0. LAST KNOWN FALLBACK (DELAYED) ---
        // Setup a timer to fall back to last known location if GPS is slow/fails
        const fallbackTimer = setTimeout(() => {
            const lastKnown = localStorage.getItem('last_known_gps');
            // Only use fallback if we haven't got a location yet
            setLocation(prev => {
                if (!prev && lastKnown) {
                    try {
                        const parsed = JSON.parse(lastKnown);
                        setLoading(false); // Stop loading as we have data now
                        return parsed;
                    } catch (e) { return null; }
                }
                return prev;
            });
        }, 3000); // 3 seconds timeout before showing stale data


        // --- MOCK GPS HANDLER ---
        const checkMock = () => {
            const mock = localStorage.getItem('mock_gps');
            if (mock) {
                try {
                    const parsed = JSON.parse(mock);
                    const loc = {
                        latitude: parsed.latitude,
                        longitude: parsed.longitude,
                        accuracy: 10,
                        heading: 0,
                        speed: 0,
                        timestamp: Date.now()
                    };
                    setLocation(loc);
                    localStorage.setItem('last_known_gps', JSON.stringify(loc)); // Persist
                    setLoading(false);
                    clearTimeout(fallbackTimer); // Clear fallback
                    return true; // Mock active
                } catch (e) { }
            }
            return false;
        };

        // Check immediately
        const isMocking = checkMock();

        // Listen for Mock Updates (Custom Event)
        const onMockUpdate = () => {
            checkMock();
        };
        window.addEventListener('mock-gps-update', onMockUpdate);


        // --- REAL GPS HANDLER ---
        let watchId: number | null = null;

        if ('geolocation' in navigator) {
            const handleSuccess = (position: GeolocationPosition) => {
                // Only use real GPS if NOT mocking
                if (!localStorage.getItem('mock_gps')) {
                    const loc = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        heading: position.coords.heading,
                        speed: position.coords.speed,
                        timestamp: position.timestamp,
                    };
                    setLocation(loc);
                    localStorage.setItem('last_known_gps', JSON.stringify(loc)); // Persist
                    setError(null);
                    setLoading(false);
                    clearTimeout(fallbackTimer);
                }
            };

            const handleError = (error: GeolocationPositionError) => {
                if (localStorage.getItem('mock_gps')) return; // Ignore errors if mocking

                // If we have a last known location, we might not want to show a hard error immediately?
                // But we should probably let the user know if the LIVE signal is failing.

                let msg = error.message;
                if (!window.isSecureContext) {
                    msg = "GPS requires HTTPS";
                } else if (error.code === error.PERMISSION_DENIED) {
                    msg = "GPS Permission Denied";
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    msg = "Signal Unavailable";
                } else if (error.code === error.TIMEOUT) {
                    msg = "GPS Timeout";
                }
                setError(msg);
                setLoading(false);
            };

            const options = {
                enableHighAccuracy,
                timeout,
                maximumAge,
            };

            watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, options);
        } else {
            if (!checkMock()) setError('Geolocation not supported');
            setLoading(false);
        }

        return () => {
            clearTimeout(fallbackTimer);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            window.removeEventListener('mock-gps-update', onMockUpdate);
        };
    }, [enabled, enableHighAccuracy, timeout, maximumAge]);

    return { location, error, loading };
};
