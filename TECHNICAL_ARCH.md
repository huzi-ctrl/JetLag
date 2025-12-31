# 🏗️ Technical Architecture: Jetlag

## System Overview

Jetlag acts as a real-time state synchronization engine between a Hider and multiple Seekers. The core loop involves:
1.  **State Sync:** Clients subscribe to Supabase Realtime channels (`game_players`, `questions`, `map_events`).
2.  **Location:** GPS data is pushed to `game_players.location` (PostGIS geography type) every ~5 seconds.
3.  **Deduction:** The Hider's "Mask" (Fog of War) is calculated client-side (or server-side in future) based on `map_events`.

## Key Components

### 1. Game State (`GameStack.tsx`)
The root component that manages the active game session. It handles:
*   **Role Logic:** Determines if user is HIDER or SEEKER.
*   **Phase Management:** Lobby -> Head Start -> Active -> Ended.
*   **Data Subscription:** Listens for global game events.

### 2. The Map (`GameMap.tsx`)
A complex Mapbox implementation that renders:
*   **Region Mask:** Examples include the "City Boundaries".
*   **Deduction Mask:** The "Bisector" logic (Voronoi-like regions based on questions).
*   **Live Players:** GeoJSON sources updated via Realtime.
*   **Manual Masks:** User-drawn overlays for strategic planning.

### 3. Deduction Engine (`lib/deduction.ts`)
Handles the logic for "Questions".
*   **Bisectors:** When a Hider answers "Are you closer to A than B?", we calculate the perpendicular bisector of line AB.
*   **Turf.js:** Used for all geospatial math (intersections, buffers, distance).

### 4. Database Schema (PostGIS)
We use PostgreSQL's `geography` type for accurate earth-distance calculations.
*   `game_players.location`: Stores live coords.
*   `map_events.geometry`: Stores Polygons/Lines for the map.

## Security & RLS
Row Level Security (RLS) policies enforce game rules:
*   **Hider Privacy:** Seekers generally *cannot* read the Hider's exact location row (depending on implementation, often proxied or gated).
*   **Anti-Cheat:** Users can only update their *own* location.

## Future Improvements
*   **Server-Side Validation:** Move distance checks (for Curses) to a Postgres Function to prevent client-side spoofing.
*   **Offline Support:** Enhanced Service Worker caching for map tiles.
