"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { type AppUser } from '@/lib/data';

interface AuthContextType {
    user: User | null;
    appUser: AppUser | null;
    loading: boolean;
    signup: (email: string, pass: string, name: string, role?: AppUser['role']) => Promise<any>;
    login: (email: string, pass: string) => Promise<any>;
    logout: () => Promise<void>;
    /** Unidade que o master escolheu "entrar" pra ver como se fosse o admin dela. Null = todas as unidades. Sempre null pra quem não é master. */
    activeUnidadeId: string | null;
    setActiveUnidadeId: (id: string | null) => void;
}

const MASTER_ACTIVE_UNIDADE_KEY = 'masterActiveUnidadeId';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeUnidadeId, setActiveUnidadeIdState] = useState<string | null>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(MASTER_ACTIVE_UNIDADE_KEY);
            if (saved) setActiveUnidadeIdState(saved);
        } catch {}
    }, []);

    const setActiveUnidadeId = (id: string | null) => {
        setActiveUnidadeIdState(id);
        try {
            if (id) localStorage.setItem(MASTER_ACTIVE_UNIDADE_KEY, id);
            else localStorage.removeItem(MASTER_ACTIVE_UNIDADE_KEY);
        } catch {}
    };

    useEffect(() => {
        // Initial session check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (!session?.user) {
                setAppUser(null);
                setLoading(false);
            }
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser((prevUser) => {
                // If the user ID is the same, don't update the state reference to avoid re-renders
                if (prevUser?.id === session?.user?.id) {
                    return prevUser;
                }
                return session?.user ?? null;
            });
            if (!session?.user) {
                setAppUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        let isMounted = true;

        const fetchProfile = async (userId: string) => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) {
                    // PGRST116 means no rows were found. The user exists in Auth but has no Profile.
                    if (error.code === 'PGRST116') {
                        // Desde a RLS multi-unidade, só admin/master pode inserir em `profiles`
                        // (mesmo a primeira conta) - esse auto-heal não vai mais conseguir se
                        // inserir sozinho, só fica como fallback que falha de forma segura.
                        // Criação de usuário (inclusive o primeiro master) passa a ser via SQL
                        // direto (bootstrap) ou pela API com service role (bypassa RLS).
                        console.warn("AuthContext: Profile not found. Attempting to auto-create...");
                        const { data: authData } = await supabase.auth.getUser();
                        
                        if (authData.user) {
                            // Check if this is the very first profile in the database
                            const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
                            const isFirstUser = count === 0;

                            const { data: newProfile, error: insertError } = await supabase.from('profiles').insert({
                                id: userId,
                                email: authData.user.email,
                                name: authData.user.user_metadata?.name || authData.user.email?.split('@')[0] || 'Usuário',
                                role: isFirstUser ? 'admin' : 'technician'
                            }).select().single();

                            if (!insertError && newProfile) {
                                if (isMounted) {
                                    setAppUser({
                                        uid: newProfile.id,
                                        name: newProfile.name,
                                        email: newProfile.email,
                                        role: newProfile.role,
                                        unidadeId: newProfile.unidade_id ?? null
                                    });
                                }
                                return; // Successfully auto-healed
                            } else {
                                console.error("AuthContext: Failed to auto-create profile:", insertError);
                            }
                        }
                    }
                    throw error;
                }

                if (isMounted && data) {
                    setAppUser({
                        uid: data.id,
                        name: data.name,
                        email: data.email,
                        role: data.role,
                        unidadeId: data.unidade_id ?? null
                    });
                } else if (isMounted) {
                    setAppUser(null);
                }
            } catch (error) {
                console.error("AuthContext: Error fetching profile:", error);
                if (isMounted) setAppUser(null);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        if (user) {
            // Only set loading if we don't already have the user's profile
            setLoading(prev => appUser?.uid !== user.id ? true : prev);
            fetchProfile(user.id);
        }
    }, [user?.id]); // Depend on user ID, not the object reference
    
    const signup = async (email: string, pass: string, name: string, role: AppUser['role'] = 'technician') => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: pass,
        });

        if (error) throw error;
        
        if (data.user) {
            const { error: profileError } = await supabase.from('profiles').insert({
                id: data.user.id,
                name: name,
                email: data.user.email,
                role: role
            });
            if (profileError) {
                console.error("Error creating profile:", profileError);
                throw profileError;
            }
        }
        
        return data;
    }
    
    const login = async (email: string, pass: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        if (error) throw error;
        return data;
    }

    const logout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }

    const value: AuthContextType = {
        user,
        appUser,
        loading,
        signup,
        login,
        logout,
        activeUnidadeId: appUser?.role === 'master' ? activeUnidadeId : null,
        setActiveUnidadeId,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
