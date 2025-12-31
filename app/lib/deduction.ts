import * as turf from '@turf/turf';
import { createBisectorPolygon } from './geo_utils';

// Types
export type DeductionType = 'RADAR' | 'MEASURING' | 'MATCHING' | 'THERMOMETER' | 'TRAVEL_AGENT';

export interface QuestionEvent {
    id: string;
    type: DeductionType;
    params: any; // e.g. { center: [lng, lat], radius: 500 }
    answer: boolean; // YES (inside/closer) or NO (outside/farther)
    timestamp: number;
}

/**
 * Generates the "Fog of War" mask.
 * 
 * Logic:
 * 1. Start with a "World Mask" (Full opacity everywhere).
 * 2. Punch holes in the mask for "Possible Areas" (YES answers).
 * 3. Add patches to the mask for "Impossible Areas" (NO answers).
 * 
 * However, visually, it's easier to compute the "Valid Region" and then invert it to get the mask.
 * 
 * Valid Region = (Intersection of all YES regions) - (Union of all NO regions)
 * Mask = World - Valid Region
 */
export const calculateDeductionMask = (history: QuestionEvent[]): GeoJSON.FeatureCollection | null => {
    if (history.length === 0) return null;

    console.log("Calculated Deduction Mask for events:", history.length);

    // World Polygon (spanning the globe)
    // Used as the base "Everything is possible" state if we start with a negative constraint
    const world = turf.polygon([[
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90],
        [-180, -90]
    ]]);

    // "possiblePoly" represents the area where the hider COULD be.
    // null = Infinite/Unknown (The whole world).
    let possiblePoly: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;

    history.forEach(event => {
        let eventPoly: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;

        if (event.type === 'RADAR') {
            const { center, radius } = event.params; // radius in meters
            const options = { steps: 64, units: 'meters' as const };
            const circle = turf.circle(center, radius, options);
            eventPoly = circle as GeoJSON.Feature<GeoJSON.Polygon>;
        }

        if (event.type === 'THERMOMETER') {
            const { start, end } = event.params; // Expect [lng, lat] arrays
            if (start && end) {
                // Logic:
                // If answer=YES (Hotter/Closer to End), area is Bisector(Start -> End).
                // If answer=NO (Colder/Closer to Start), area is Bisector(End -> Start).
                // In both cases, "Hider IS inside this polygon". 
                // So we force event.answer to effectively be TRUE for the calculated polygon.

                if (event.answer === true) {
                    // Hotter
                    console.log(`Deduction: Thermometer HOTTER. Bisecting ${start} -> ${end}`);
                    eventPoly = createBisectorPolygon(start, end);
                } else {
                    // Colder
                    console.log(`Deduction: Thermometer COLDER. Bisecting ${end} -> ${start}`);
                    eventPoly = createBisectorPolygon(end, start);
                    // Force inclusive logic because we already inverted the geometry
                }
            }
        }

        if (event.type === 'TRAVEL_AGENT') {
            // Rule: Dist(Hider, Dest) > Dist(Seeker, Dest)
            // Hider is NOT within Radius R of Dest, where R = Dist(Seeker, Dest)
            const { dest, seekerLoc } = event.params;
            if (dest && seekerLoc) {
                const destPt = turf.point(dest);
                const seekerPt = turf.point(seekerLoc);
                const radius = turf.distance(destPt, seekerPt, { units: 'meters' });

                const options = { steps: 64, units: 'meters' as const };
                eventPoly = turf.circle(dest, radius, options) as GeoJSON.Feature<GeoJSON.Polygon>;
                // event.answer is assumed FALSE (Excluded) for this logic
            }
        }

        // Logic Determination
        let isInclusive = event.answer;
        if (event.type === 'THERMOMETER' && eventPoly) {
            isInclusive = true; // Thermometer always uses the "Valid" polygon we constructed
        }

        if (!eventPoly) return;

        // Logic Application
        if (isInclusive) {
            // YES: Hider IS inside this shape.
            // New Possible = INTERSECT(CurrentPossible, Shape)

            if (possiblePoly === null) {
                // Previously anything was possible, now only this shape is possible
                possiblePoly = eventPoly;
            } else {
                // Intersect logic
                try {
                    const intersection = turf.intersect(turf.featureCollection([possiblePoly, eventPoly]));
                    if (intersection) possiblePoly = intersection;
                    else possiblePoly = null; // Disjoint
                } catch (e) { console.error("Intersect Error", e); }
            }
        } else {
            // NO: Hider is NOT inside this shape.
            // New Possible = DIFFERENCE(CurrentPossible, Shape)

            if (possiblePoly === null) {
                // If anything was possible, now it's World - Shape
                try {
                    // Try v7 (p1, p2) or v6 (collection)
                    // Safest check is to try one; if it fails/returns undefined, try the other?
                    // But difference signature is tricky. 
                    // Most standard Turf: difference(poly1, poly2)
                    // @ts-ignore
                    const diff = turf.difference(turf.featureCollection([world, eventPoly]));
                    if (diff) possiblePoly = diff;
                } catch (e) { console.error("Diff Error 1", e); }
            } else {
                try {
                    // @ts-ignore
                    const diff = turf.difference(turf.featureCollection([possiblePoly, eventPoly]));
                    if (diff) possiblePoly = diff;
                } catch (e) { console.error("Diff Error 2", e); }
            }
        }
    });

    // Generate Visual Mask (The Part to Black Out)
    // Mask = World - Possible
    // If possiblePoly is null (everything possible), Mask is empty (null).
    if (possiblePoly) {
        try {
            // @ts-ignore
            const mask = turf.difference(turf.featureCollection([world, possiblePoly]));
            return mask ? turf.featureCollection([mask]) : null;
        } catch (e) {
            console.error("Turf difference error", e);
            return null;
        }
    }

    return null;
};

/**
 * Helper to get a simple circle polygon for testing
 */
export const getRadarCircle = (center: [number, number], radiusMeters: number) => {
    return turf.circle(center, radiusMeters, { steps: 64, units: 'meters' });
};
