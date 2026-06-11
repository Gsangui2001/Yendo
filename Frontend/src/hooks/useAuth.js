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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) { setPerfil(null); setLoading(false); return; }
      // El refresh de token (~cada hora) no cambia el perfil: si volvemos a
      // poner loading acá, la app entera se desmonta con el spinner y el
      // usuario pierde la página en la que estaba.
      if (event === 'TOKEN_REFRESHED') return;
      fetchPerfil(session.user.id);
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
