const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Helper to search POIs
export async function findNearestPOI(location: { longitude: number, latitude: number }, query: string) {
    if (!MAPBOX_TOKEN) throw new Error("Missing Mapbox Token");

    // Calculate Bounding Box to force local results
    // 1 deg lat is ~111km (69 miles).
    // User requested larger range (Manchester is 60 miles away).
    // delta 1.5 = ~100 miles (160km).
    const delta = 1.5;
    const minLon = location.longitude - delta;
    const minLat = location.latitude - delta;
    const maxLon = location.longitude + delta;
    const maxLat = location.latitude + delta;
    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;

    // TWO-PASS STRATEGY
    // PASS 1: Strict POI search (Best for "Airport", "Museum")
    const urlPOI = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${location.longitude},${location.latitude}&bbox=${bbox}&types=poi&limit=5&access_token=${MAPBOX_TOKEN}`;

    try {
        // Attempt Pass 1
        const res1 = await fetch(urlPOI);
        const data1 = await res1.json();
        if (data1.features && data1.features.length > 0) {
            console.log("Mapbox Strict POI Match:", data1.features[0].text);
            return data1.features[0];
        }

        // PASS 2: Relaxed Search (Fallback to Address/Place if no POI found)
        console.log("Mapbox Strict POI failed, falling back to relaxed search...");
        const urlRelaxed = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${location.longitude},${location.latitude}&bbox=${bbox}&limit=10&access_token=${MAPBOX_TOKEN}`;
        const res2 = await fetch(urlRelaxed);
        const data = await res2.json();

        if (!data.features || data.features.length === 0) return null;

        // TIER 1: Preferred Matches (Place, Locality, Neighborhood - since POI already failed)
        const preferredTypes = ['place', 'locality', 'neighborhood', 'district'];
        const bestMatch = data.features.find((f: any) => {
            return f.place_type.some((t: string) => preferredTypes.includes(t));
        });
        if (bestMatch) {
            console.log("Mapbox Tier 1 Match (Relaxed):", bestMatch.text, bestMatch.place_type);
            return bestMatch;
        }

        // TIER 2: Address
        const address = data.features.find((f: any) => f.place_type.includes('address'));
        if (address) {
            console.log("Mapbox Tier 2 (Address) Match:", address.text);
            return address;
        }

        // TIER 3: Desperation
        if (!data.features[0].place_type.some((t: string) => ['country', 'region', 'postcode'].includes(t))) {
            console.log("Mapbox Desperation Match:", data.features[0].text, data.features[0].place_type);
            return data.features[0];
        }

        return null;

    } catch (err) {
        console.error("Mapbox POI Error:", err);
        return null;
    }
}

// Helper for Tentacles (Count in Radius) requires distinct API or manual calculation?
// Mapbox Geocoding API doesn't do "count in radius" directly well (it limits usually).
// A better approach for "Tentacles" (Count X): Fetch limit=10, filter by distance manually.
import * as turf from '@turf/turf';

export async function countPOI(location: { longitude: number, latitude: number }, query: string, radiusMeters: number) {
    if (!MAPBOX_TOKEN) throw new Error("Missing Mapbox Token");

    // Fetch up to 10 candidates (limit is usually low for free tier, max 10 or 5 for Geocoding?)
    // Actually limit can be 10.
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${location.longitude},${location.latitude}&limit=10&access_token=${MAPBOX_TOKEN}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        let count = 0;
        const userPt = turf.point([location.longitude, location.latitude]);

        if (data.features) {
            data.features.forEach((f: any) => {
                const pt = turf.point(f.center);
                const dist = turf.distance(userPt, pt, { units: 'meters' });
                if (dist <= radiusMeters) {
                    count++;
                }
            });
        }
        return count;
    } catch (err) {
        console.error("Mapbox Count Error:", err);
        return 0;
    }
}
