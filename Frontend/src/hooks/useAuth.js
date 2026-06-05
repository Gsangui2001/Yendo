import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [user,    setUser]    = useState(undefined); // undefined = cargando
  const [perfil,  setPerfil]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchPerfil(session.user.id);
      else setLoading(false);
    });

    // Cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchPerfil(session.user.id);
      else { setPerfil(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchPerfil(uid) {
    setLoading(true);
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', uid)
      .single();
    setPerfil(data ?? null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { user, perfil, loading, signOut };
}
