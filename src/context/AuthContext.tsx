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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

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
            setUser(session?.user ?? null);
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

                if (error) throw error;

                if (isMounted && data) {
                    setAppUser({
                        uid: data.id,
                        name: data.name,
                        email: data.email,
                        role: data.role
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
            setLoading(true);
            fetchProfile(user.id);
        }
    }, [user]);
    
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
