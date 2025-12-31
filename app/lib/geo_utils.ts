export function createGeoJSONCircle(center: [number, number], radiusInKm: number, points = 64): GeoJSON.Feature<GeoJSON.Polygon> {
    const coords = {
        latitude: center[1],
        longitude: center[0]
    };

    const km = radiusInKm;

    const ret: number[][] = [];
    const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
    const distanceY = km / 110.574;

    let theta, x, y;
    for (let i = 0; i < points; i++) {
        theta = (i / points) * (2 * Math.PI);
        x = distanceX * Math.cos(theta);
        y = distanceY * Math.sin(theta);

        ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]); // Close ring

    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [ret]
        },
        properties: {}
    };
}

export function createWorldMask(center: [number, number], radiusInKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
    // 1. Create the circle ring
    const circleFeature = createGeoJSONCircle(center, radiusInKm);
    const circleRing = circleFeature.geometry.coordinates[0];

    // 2. Create world boundary ring (Counter-Clockwise)
    // Mapbox needs the outer ring to be one way and inner holes the other way?
    // Actually standard GeoJSON is: Outer Ring (CCW), Holes (CW).

    // Let's define a huge box covering the world.
    const worldRing = [
        [-180, 90],
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90]
    ];

    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [worldRing, circleRing] // Outer (World), Inner (Hole = Circle)
        },
        properties: {}
    };
}

import * as turf from '@turf/turf';

/**
 * Creates a polygon representing the half-plane defined by the perpendicular bisector of A -> B.
 * Returns the half-plane closer to B (The "End" point).
 * @param start [lng, lat]
 * @param end [lng, lat]
 */
export function createBisectorPolygon(start: [number, number], end: [number, number]): GeoJSON.Feature<GeoJSON.Polygon> {
    const startPt = turf.point(start);
    const endPt = turf.point(end);
    const midpoint = turf.midpoint(startPt, endPt);
    const bearing = turf.bearing(startPt, endPt);

    // We want the area "forward" of the bisector (closer to End).
    // The bisector runs at bearing - 90 / + 90.
    // We create a huge box roughly aligned or covering that side.

    // Config: Size of the "Half World" box (in km). 
    // Reduced to 100km to ensure the "straight line" (Bisector) doesn't curve visibly due to Great Circle projection.
    const width = 100;

    // Normalize angle to -180..180
    const normalize = (angle: number) => {
        let a = angle % 360;
        if (a > 180) a -= 360;
        if (a < -180) a += 360;
        return a;
    };

    // Points on the bisector line:
    // "Left" of the line A->B
    const pLeft = turf.destination(midpoint, width, normalize(bearing - 90), { units: 'kilometers' });
    // "Right" of the line A->B
    const pRight = turf.destination(midpoint, width, normalize(bearing + 90), { units: 'kilometers' });

    // Points "Forward" (Beyond the bisector, closer to B)
    const pFrontRight = turf.destination(pRight, width, bearing, { units: 'kilometers' });
    const pFrontLeft = turf.destination(pLeft, width, bearing, { units: 'kilometers' });

    // Construct Polygon (CCW)
    return turf.polygon([[
        pLeft.geometry.coordinates,
        pRight.geometry.coordinates,
        pFrontRight.geometry.coordinates,
        pFrontLeft.geometry.coordinates,
        pLeft.geometry.coordinates
    ]]);
}

/**
 * Creates just the Bisector LineString for visualization.
 */
export function createBisectorLine(start: [number, number], end: [number, number]): GeoJSON.Feature<GeoJSON.LineString> {
    // console.log("createBisectorLine Input:", start, end);
    const startPt = turf.point(start);
    const endPt = turf.point(end);
    const midpoint = turf.midpoint(startPt, endPt);
    const bearing = turf.bearing(startPt, endPt);

    // console.log("Midpoint:", midpoint.geometry.coordinates);
    // console.log("Bearing:", bearing);

    const width = 10; // 10km visual line

    // Normalize angle to -180..180
    const normalize = (angle: number) => {
        let a = angle % 360;
        if (a > 180) a -= 360;
        if (a < -180) a += 360;
        return a;
    };

    // "Left" of the line A->B
    const pLeft = turf.destination(midpoint, width, normalize(bearing - 90), { units: 'kilometers' });
    // "Right" of the line A->B
    const pRight = turf.destination(midpoint, width, normalize(bearing + 90), { units: 'kilometers' });

    console.log("Bisector Calc:", {
        bearing,
        normLeft: normalize(bearing - 90),
        mid: midpoint.geometry.coordinates,
        left: pLeft.geometry.coordinates,
        right: pRight.geometry.coordinates
    });

    return turf.lineString([pLeft.geometry.coordinates, pRight.geometry.coordinates]);
}
