
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// 1. DATA FROM game_data.ts
const QUESTIONS = [
    { label: "Commercial Airport", query: "Airport" },
    { label: "Transit Line" },
    { label: "Station's Name Length" },
    { label: "Street or Path" },
    { label: "1st Admin Border (State)" },
    { label: "2nd Admin Border (County)" },
    { label: "3rd Admin (Municipality | City | Town)" },
    { label: "4th Admin (Borough)" },
    { label: "Mountain" },
    { label: "Landmass" },
    { label: "Park" },
    { label: "Amusement Park" },
    { label: "Zoo" },
    { label: "Aquarium" },
    { label: "Golf Course" },
    { label: "Museum" },
    { label: "Movie Theater" },
    { label: "Hospital" },
    { label: "Library" },
    { label: "Foreign Consulate" }
];

// 2. LOGIC (Replicated from mapbox_utils.ts)
async function findNearestPOI(location: { longitude: number, latitude: number }, query: string) {
    if (!MAPBOX_TOKEN) return "❌ No Token";

    // 100 Mile Radius
    const delta = 1.5;
    const bbox = `${location.longitude - delta},${location.latitude - delta},${location.longitude + delta},${location.latitude + delta}`;

    // PASS 1: Strict POI
    const urlPOI = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${location.longitude},${location.latitude}&bbox=${bbox}&types=poi&limit=1&access_token=${MAPBOX_TOKEN}`;

    try {
        const res1 = await fetch(urlPOI);
        const data1 = await res1.json();
        if (data1.features && data1.features.length > 0) {
            return `✅ [POI] ${data1.features[0].text} (${data1.features[0].place_type.join(', ')})`;
        }

        // PASS 2: Relaxed
        const urlRelaxed = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${location.longitude},${location.latitude}&bbox=${bbox}&limit=5&access_token=${MAPBOX_TOKEN}`;
        const res2 = await fetch(urlRelaxed);
        const data = await res2.json();

        if (!data.features || data.features.length === 0) return "❌ No Result";

        // Tier 1
        const preferredTypes = ['place', 'locality', 'neighborhood', 'district'];
        const bestMatch = data.features.find((f: any) => {
            return f.place_type.some((t: string) => preferredTypes.includes(t));
        });
        if (bestMatch) return `⚠️ [Relaxed Tier 1] ${bestMatch.text} (${bestMatch.place_type[0]})`;

        // Tier 2
        const address = data.features.find((f: any) => f.place_type.includes('address'));
        if (address) return `⚠️ [Relaxed Tier 2] ${address.text} (address)`;

        // Tier 3
        const fallback = data.features[0];
        if (!fallback.place_type.some((t: string) => ['country', 'region', 'postcode'].includes(t))) {
            return `⚠️ [Desperation] ${fallback.text} (${fallback.place_type[0]})`;
        }

        return "❌ Only Region/Country found";

    } catch (err) {
        return `❌ Error: ${err}`;
    }
}

import fs from 'fs';

// 3. RUNNER
async function run() {
    const coords = { latitude: 53.757729, longitude: -2.703440 }; // Preston, UK

    let output = "MATCHING LOGIC VERIFICATION (Two-Pass)\n";
    output += "Location: Preston, UK (53.757729, -2.703440)\n";
    output += "-----------------------------------------\n";

    for (const q of QUESTIONS) {
        // MATCHING LOGIC: Uses 'query' if present, otherwise 'label'
        const searchQuery = q.query || q.label;
        const result = await findNearestPOI(coords, searchQuery);

        // Format padding
        const labelStr = `"${q.label}"`.padEnd(35);
        const queryStr = `(Search: "${searchQuery}")`.padEnd(25);
        const line = `${labelStr} ${queryStr} -> ${result}`;

        console.log(line);
        output += line + "\n";
    }
    output += "-----------------------------------------\n";

    fs.writeFileSync('results_utf8.txt', output, 'utf8');
}

run();
