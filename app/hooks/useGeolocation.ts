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

        // --- MOCK GPS HANDLER ---
        const checkMock = () => {
            const mock = localStorage.getItem('mock_gps');
            if (mock) {
                try {
                    const parsed = JSON.parse(mock);
                    setLocation({
                        latitude: parsed.latitude,
                        longitude: parsed.longitude,
                        accuracy: 10,
                        heading: 0,
                        speed: 0,
                        timestamp: Date.now()
                    });
                    setLoading(false);
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
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        heading: position.coords.heading,
                        speed: position.coords.speed,
                        timestamp: position.timestamp,
                    });
                    setError(null);
                    setLoading(false);
                }
            };

            const handleError = (error: GeolocationPositionError) => {
                if (localStorage.getItem('mock_gps')) return; // Ignore errors if mocking

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
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            window.removeEventListener('mock-gps-update', onMockUpdate);
        };
    }, [enabled, enableHighAccuracy, timeout, maximumAge]);

    return { location, error, loading };
};
