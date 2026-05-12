import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('sl_user');
        const token  = await AsyncStorage.getItem('sl_token');
        if (stored && token) setUser(JSON.parse(stored));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const signIn = async (userData, token) => {
    await AsyncStorage.setItem('sl_token', token);
    await AsyncStorage.setItem('sl_user', JSON.stringify(userData));
    setUser(userData);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('sl_token');
    await AsyncStorage.removeItem('sl_user');
    setUser(null);
  };

  const updateUser = async (userData) => {
    const merged = { ...user, ...userData };
    await AsyncStorage.setItem('sl_user', JSON.stringify(merged));
    setUser(merged);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
