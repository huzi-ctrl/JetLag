'use client';

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import dynamic from 'next/dynamic';
import LoginScreen from './components/auth/LoginScreen';
import LobbyScreen from './components/lobby/LobbyScreen';
import GameStack from './components/game/GameStack';
import WaitingRoom from './components/lobby/WaitingRoom';
import SettingsMenu from './components/ui/SettingsMenu';

const GameMap = dynamic(() => import('./components/map/GameMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-black flex items-center justify-center text-primary">Initializing Map...</div>
});

export default function Home() {
  const [role, setRole] = useState<'HIDER' | 'SEEKER'>('SEEKER');
  const [userId, setUserId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const [gameStatus, setGameStatus] = useState<'lobby' | 'active' | 'ended'>('lobby'); // Track status
  const [gameConfig, setGameConfig] = useState<any>(null); // Store Game Config

  // UI State
  const [isUIOccluded, setIsUIOccluded] = useState(false);
  const [proximityMode, setProximityMode] = useState<'HIDER' | 'SEEKER'>('HIDER');
  const [seekerBiasLocation, setSeekerBiasLocation] = useState<{ latitude: number, longitude: number } | null>(null);

  // Session Restoration
  useEffect(() => {
    const restoreSession = async () => {
      // 1. Check Auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const restoredUserId = session.user.id;

      // 2. Check for Active Game
      // Find a game that is NOT ended where this user is a player
      const { data: participationResults, error } = await supabase
        .from('game_players')
        .select(`
          game_id, 
          role, 
          last_seen,
          games!inner (
            status,
            game_code,
            hider_id,
            config
          )
        `)
        .eq('user_id', restoredUserId)
        .order('last_seen', { ascending: false });

      // Find first non-ended game
      const participation = participationResults?.find((p: any) => p.games.status !== 'ended');

      // Debug Log
      if (!participation) {
        console.log("No active game participation found for user:", restoredUserId);
      }

      if (participation && participation.games) {
        // --- TIMEOUT CHECK ---
        // If last_seen is > 1 hour ago, force sign out
        const lastSeen = new Date(participation.last_seen);
        const now = new Date();
        const diffMs = now.getTime() - lastSeen.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > 1) {
          console.log("Session expired (inactive > 1hr). Logging out.");
          await supabase.auth.signOut();
          setUserId(null); // Clear local state to force LoginScreen
          return;
        }

        // Type assertion since Typescript might not infer the inner join shape perfectly without generated types
        const gameData = participation.games as any;

        console.log("Restoring active game session:", participation);

        setUserId(restoredUserId); // Ensure this is set
        setGameId(participation.game_id);
        // Map db role 'hider'/'seeker' to 'HIDER'/'SEEKER'
        setRole(participation.role.toUpperCase() as 'HIDER' | 'SEEKER');
        setGameCode(gameData.game_code);
        setGameStatus(gameData.status);
        setGameConfig(gameData.config);

        // --- Added for GameMap Hider Jail ---
        if (gameData.hiding_spot && typeof gameData.hiding_spot !== 'string') {
          // Assume it works if object
          setGameState(prev => ({ ...prev, hiding_spot: gameData.hiding_spot }));
        } else {
          // If string (WKB), we rely on the useEffect to fetch clean GeoJSON shortly
        }
      } else {
        // Just generic logged in, no active game
        setUserId(restoredUserId);
      }
    };

    restoreSession();
  }, []);

  // --- Hiding Spot State Lifting ---
  const [gameState, setGameState] = useState<{ hiding_spot: any } | null>(null);

  // Poll/Subscribe for hiding spot updates
  useEffect(() => {
    if (!gameId) return;

    // Fetch initial
    supabase.from('games').select('hiding_spot_json').eq('id', gameId).single()
      .then(({ data }) => {
        if (data && data.hiding_spot_json) {
          setGameState(prev => ({ ...prev, hiding_spot: data.hiding_spot_json }));
        }
      });

    const channel = supabase.channel(`page-game-state-${gameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => {
        supabase.from('games').select('hiding_spot_json, status').eq('id', gameId).single()
          .then(({ data }) => {
            if (data) {
              if (data.hiding_spot_json) setGameState(prev => ({ ...prev, hiding_spot: data.hiding_spot_json }));
              setGameStatus(data.status);
            }
          });
      })
      .subscribe();

    // Subscribe to Role Changes
    // Note: 'filter' with AND syntax strings is often flaky in client libs. Filtering by game_id is safer.
    const roleChannel = supabase.channel(`role-change-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, (payload) => {
        if (payload.new && payload.new.user_id === userId && payload.new.role) {
          console.log("Role Switch Detected!", payload.new.role);
          setRole(payload.new.role.toUpperCase() as 'HIDER' | 'SEEKER');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(roleChannel);
    };
  }, [gameId, userId]);

  // --- Session Control (Single Session Enforcement) ---
  useEffect(() => {
    if (!userId) return;

    const channelName = `session-control-${userId}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'force_logout' }, (payload) => {
        // We received a logout signal. 
        // We need to check if it's meant for US (active session) vs the new session.
        // Actually, broadcast goes to everyone *subscribed*. The one sending it is also subscribed basically.
        // We need to differentiate "I just logged in" vs "I was already here".
        // Simple way: The new session sends the signal AFTER subscribing? 
        // Or we include a session_id in the payload and compare.
        // Since we don't have a unique session ID in state easily without generating one on mount...
        // Let's generate a quick session ID REF.
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // We are online. Tell others to leave.
          // We need to wait a tiny bit to ensure others receive it?
          // Only send if we just "logged in" (mounted)? 
          // Yes, this effect runs on mount (when userId set).
          const mySessionId = Math.random().toString(36).substring(7);
          sessionStorage.setItem('tab_session_id', mySessionId);

          channel.send({
            type: 'broadcast',
            event: 'force_logout',
            payload: { new_session_id: mySessionId }
          });
        }
      });

    // Listen handler needs to be robust
    channel.on('broadcast', { event: 'force_logout' }, (payload) => {
      const mySessionId = sessionStorage.getItem('tab_session_id');
      // If the broadcast comes from a DIFFERENT session ID, we logout.
      if (payload.payload.new_session_id !== mySessionId) {
        console.log("New session detected. Logging out this tab.");
        alert("You have connected from another device/tab. This session is now closed.");
        handleLeaveGame();
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Subscribe to Seeker Location (for Hider's "Proximity: Seeker" mode)
  useEffect(() => {
    if (!gameId || role !== 'HIDER' || proximityMode !== 'SEEKER') return;

    // Initial Fetch
    const fetchSeekerLoc = async () => {
      const { data } = await supabase.rpc('get_game_seekers', { p_game_id: gameId });
      if (data && data.length > 0 && data[0].location) {
        const coords = data[0].location.coordinates || data[0].location; // Handle format variance
        // WKB support coming later if needed, but RPC handles GeoJSON usually
        if (Array.isArray(coords)) {
          setSeekerBiasLocation({ longitude: coords[0], latitude: coords[1] });
        }
      }
    };
    fetchSeekerLoc();

    // Subscription
    const channel = supabase
      .channel(`seeker-loc-bias-${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_players',
        filter: `game_id=eq.${gameId}`
      }, (payload: any) => {
        if (payload.new.role === 'seeker' && payload.new.location) {
          const loc = payload.new.location;
          const coords = loc.coordinates || loc; // Handle GeoJSON vs raw
          if (Array.isArray(coords)) {
            setSeekerBiasLocation({ longitude: coords[0], latitude: coords[1] });
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameId, role, proximityMode]);

  const handleLeaveGame = async () => {
    if (!confirm("Are you sure you want to leave?")) return;

    // UI Feedback logic
    // const btn = document.getElementById('leave-btn'); // Logic moved to Settings Component internal state if needed

    try {
      // 1. Remove from DB (Triggers auto-cleanup if last player)
      if (userId && gameId) {
        await supabase.from('game_players').delete().match({ game_id: gameId, user_id: userId });
      }
    } catch (e) { console.error("Error cleaning up player:", e); }

    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (e) {
      console.error("Logout error:", e);
    }

    try { localStorage.clear(); } catch (e) { }

    setUserId(null);
    setGameId(null);
    window.location.href = '/';
  };

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!mapboxToken) {
    // ... error UI
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white p-8 text-center">
        <div>
          <h1 className="text-3xl font-bold mb-4 text-primary">Configuration Required</h1>
          <p className="mb-4 text-gray-400">Please set <code className="bg-gray-800 px-2 py-1 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your .env.local file.</p>
        </div>
      </div>
    )
  }

  // --- Bias Location Logic ---
  // If HIDER and Seeker Mode selected, pass seeker loc.
  // Else pass NULL (CardDeck will use internal useGeolocation for Hider default).
  const effectiveBiasLocation = (role === 'HIDER' && proximityMode === 'SEEKER')
    ? seekerBiasLocation
    : null; // Hider default handled in components

  return (
    <main className="w-screen h-screen overflow-hidden relative bg-slate-50">
      {/* 0. Map is renderered first (background) */}
      <GameMap
        userRole={role.toLowerCase() as 'hider' | 'seeker'}
        mapboxToken={mapboxToken}
        userId={userId || 'spectator'}
        gameId={gameId || undefined}
        viewMode={(userId && gameId && gameStatus === 'active') ? 'game' : 'simple'} // Only 'game' mode if ACTIVE
        gameConfig={gameConfig}
        isOccluded={isUIOccluded}
        hidingSpot={gameState?.hiding_spot}
      />

      {/* 1. Game Code Badge (Small, Top Right) - Show ONLY in Lobby */}
      {gameCode && gameStatus === 'lobby' && (
        <div className="absolute top-safe right-4 z-10 mt-2 pointer-events-none">
          <div className="glass-panel px-3 py-2 flex flex-col items-center pointer-events-auto shadow-md bg-white/90">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Flight</span>
            <span className="text-lg font-black font-mono text-primary tracking-widest leading-none">{gameCode}</span>
          </div>
        </div>
      )}

      {/* 2. Login Overlay */}
      {!userId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/10">
          <LoginScreen onLogin={(id) => setUserId(id)} />
        </div>
      )}

      {/* 3. Lobby Overlay (Only if logged in but no game) */}
      {userId && !gameId && (
        <LobbyScreen
          userId={userId}
          mapboxToken={mapboxToken}
          onJoinGame={(id, newRole, code, status, config) => {
            setGameId(id);
            setRole(newRole);
            setGameCode(code);
            setGameStatus(status);
            setGameConfig(config);
          }}
          onLeave={handleLeaveGame}
        />
      )}

      {/* 4. Waiting Room (If gameId exists but status is 'lobby') */}
      {userId && gameId && gameStatus === 'lobby' && (
        <WaitingRoom
          gameId={gameId}
          gameCode={gameCode!}
          userId={userId}
          onGameStart={() => setGameStatus('active')}
          onRoleChange={(newRole) => setRole(newRole)}
          onLeave={handleLeaveGame}
        />
      )}

      {/* 5. Game Interaction Stack (Drawers/Forms) - Only when ACTIVE or ENDED */}
      {userId && gameId && (gameStatus === 'active' || gameStatus === 'ended') && (
        <GameStack
          role={role}
          gameId={gameId}
          userId={userId}
          onLeave={handleLeaveGame}
          onOcclusionChange={setIsUIOccluded}
          biasLocation={effectiveBiasLocation}
        />
      )}

      {/* 6. SETTINGS MENU (Replaces Leave Button) - Only HIDER gets the proximity toggles visually, but we render for both or restricting? */}
      {/* User Logic: "setting is nly avaialbe for the hhider obviously" */}
      {userId && gameId && gameStatus === 'active' && !isUIOccluded && (
        role === 'HIDER' ? (
          <SettingsMenu
            onLeave={handleLeaveGame}
            proximityMode={proximityMode}
            onProximityChange={setProximityMode}
            gameId={gameId || undefined}
            role={role}
            userId={userId || undefined}
          />
        ) : (
          // Seeker just gets standard Leave Button for now? Or Settings Menu with just Leave?
          // Let's give Seeker the menu but with only Leave option hidden?
          // Actually, simplest is just give Seeker the old button or a simplified Menu.
          // Let's use the Menu for consistency but hide the toggle inside it.
          // Wait, reusing the component is cleaner.
          <SettingsMenu
            onLeave={handleLeaveGame}
            proximityMode={proximityMode}
            onProximityChange={setProximityMode}
            gameId={gameId || undefined}
            role={role}
            userId={userId || undefined}
          />
        )
      )}
    </main>
  );
}
