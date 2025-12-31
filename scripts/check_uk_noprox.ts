
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

async function twoPassSearch(location: { longitude: number, latitude: number }, query: string) {
    if (!MAPBOX_TOKEN) {
        console.error("❌ Missing MAPBOX_TOKEN");
        return;
    }

    // UPDATED DELTA: 1.5 degrees (~100 miles)
    const delta = 1.5;
    const bbox = `${location.longitude - delta},${location.latitude - delta},${location.longitude + delta},${location.latitude + delta}`;

    console.log(`\n🔎 Searching for "${query}" near [${location.latitude}, ${location.longitude}]`);
    console.log(`   BBOX ONLY (No Proximity Bias)`);

    // PASS 1: Strict POI
    const url1 = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?bbox=${bbox}&types=poi&limit=5&access_token=${MAPBOX_TOKEN}`;

    try {
        const res1 = await fetch(url1);
        const data1 = await res1.json();

        if (data1.features && data1.features.length > 0) {
            console.log("   ✅ PASS 1 (Strict POI) FOUND:");
            data1.features.forEach((f: any) => console.log(`      - "${f.text}" (${f.place_type.join(', ')})`));
            return;
        } else {
            console.log("   ❌ PASS 1 FAILED (No POIs found).");
        }
    } catch (e) {
        console.error("   Pass 1 Error:", e);
    }
}

async function run() {
    // Preston, UK
    await twoPassSearch({ latitude: 53.757729, longitude: -2.703440 }, "Airport");
}

run();
