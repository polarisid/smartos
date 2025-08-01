
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
    User, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
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
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setUser(user);
            if (!user) {
                setAppUser(null);
                setLoading(false);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const unsubscribeFirestore = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    setAppUser({ uid: doc.id, ...doc.data() } as AppUser);
                } else {
                    setAppUser(null); // User exists in Auth but not in Firestore users collection
                }
                setLoading(false);
            });
            return () => unsubscribeFirestore();
        }
    }, [user]);
    
    const signup = async (email: string, pass: string, name: string, role: AppUser['role'] = 'technician') => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const { user } = userCredential;

        // Create user document in Firestore
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            name: name,
            email: user.email,
            role: role
        });
        
        return userCredential;
    }
    
    const login = (email: string, pass: string) => {
        return signInWithEmailAndPassword(auth, email, pass);
    }

    const logout = () => {
        return signOut(auth);
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
