'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface LoginScreenProps {
    onLogin: (userId: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleJoin = async () => {
        if (!username.trim()) return;
        setLoading(true);
        setError(null);

        const baseEmail = username.replace(/\s+/g, '').toLowerCase();
        const password = 'temporary-password-123';

        // Helper to attempt login
        const tryAuth = async (emailToUse: string) => {
            // 1. Try Sign Up
            const { data: upData, error: upError } = await supabase.auth.signUp({
                email: emailToUse,
                password,
            });

            if (upData.user && !upData.session) {
                // User created but needs email confirmation (Supabase default)
                // We can't fix this without changing DB settings.
                // Workaround: Try to Sign In (maybe they verified?) or Throw specific error
                return { user: null, error: new Error("Account exists but email not verified. Try a different name.") };
            }

            if (upData.session) return { user: upData.user, error: null };

            // 2. If Sign Up failed (e.g. already registered), Try Sign In
            if (upError && upError.message.includes('already registered')) {
                const { data: inData, error: inError } = await supabase.auth.signInWithPassword({
                    email: emailToUse,
                    password
                });
                if (inData.session) return { user: inData.user, error: null };
                return { user: null, error: inError };
            }

            return { user: null, error: upError };
        };

        try {
            // First attempt: clean username
            // Use @jetlag.app which is a valid TLD
            let result = await tryAuth(`${baseEmail}@jetlag.app`);

            // Retry with random suffix if it failed (likely due to unverified email conflict)
            if (result.error) {
                console.log("First attempt failed, retrying with unique suffix...");
                const uniqueSuffix = Math.floor(Math.random() * 1000);
                result = await tryAuth(`${baseEmail}${uniqueSuffix}@jetlag.app`);
            }

            if (result.error || !result.user) {
                throw result.error || new Error("Authentication failed");
            }

            const userId = result.user.id;

            // Create Profile
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    username: username,
                    avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
                }, { onConflict: 'id' });

            if (profileError) {
                console.error("Profile creation error:", profileError);
                // Don't block login if profile fails, just warn
            }

            onLogin(userId);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to join');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-panel p-6 md:p-8 max-w-xs md:max-w-sm w-full space-y-4 md:space-y-6 bg-white/90 shadow-2xl border-white/60 backdrop-blur-xl">
            <h1 className="text-3xl md:text-4xl font-black text-primary text-center tracking-tighter italic transform -rotate-2">JET LAG</h1>
            <p className="text-slate-500 text-center text-xs md:text-sm font-medium">Ready for your journey?</p>

            <div className="space-y-3 md:space-y-4">
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-400"
                />

                <button
                    onClick={handleJoin}
                    disabled={loading}
                    className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 active:translate-y-0 transition-all"
                >
                    {loading ? 'PACKING BAGS...' : "LET'S GO!"}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-100 border border-red-200 rounded text-red-700 text-xs text-center font-bold">
                    {error.includes('verified') ? (
                        <span>
                            ⚠️ <strong>Supabase Config Required</strong><br />
                            Go to Authentication &gt; Providers &gt; Email<br />
                            Disable <em>"Confirm email"</em> and Save.
                        </span>
                    ) : (
                        error
                    )}
                </div>
            )}
        </div>
    );
}
