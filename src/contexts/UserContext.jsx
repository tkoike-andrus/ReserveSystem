import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabaseClient';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      
      if (session?.user) {
        setLoading(true);
        try {
          // Supabase Edge Functionを呼び出してプロフィール情報を取得
          //console.log('UserContext: Invoking get-user-profile function for user:', session.user.id);
          const { data, error } = await supabase.functions.invoke('get-user-profile', {
            body: { user: session.user },
          });

          if (error) {
            throw error;
          }
          //console.log('UserContext: Profile data received from function:', data);
          setProfile(data);

        } catch (e) {
            console.error('UserContext: Failed to fetch profile from function:', e);
            setProfile(null);
        } finally {
            setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const value = {
    session,
    profile,
    loading,
    isRegistered: !!profile,
    userType: profile?.userType || null,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

