import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ROLES = [
  { value: 'comercio', emoji: '🏪', label: 'Comercio',  desc: 'Gestioná tus envíos y pedidos desde tu negocio' },
  { value: 'cadete',   emoji: '🚴', label: 'Cadete',    desc: 'Tomá pedidos y gestioná tu jornada de trabajo' },
  { value: 'privado',  emoji: '👤', label: 'Privado',   desc: 'Enviá algo o hacé un mandado personal' },
];

export default function AuthPage() {
  const [mode,    setMode]    = useState('login');   // login | register
  const [step,    setStep]    = useState('select');  // solo register: select | form
  const [rol,     setRol]     = useState('');
  const [form,    setForm]    = useState({ nombre: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function f(name) {
    return { value: form[name], onChange: e => { setForm(p => ({...p, [name]: e.target.value})); setError(''); } };
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!form.email.trim()) return setError('Ingresá tu email');
    if (!form.password)     return setError('Ingresá tu contraseña');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: form.email.trim(), password: form.password,
      });
      if (err) {
        if (err.message.includes('Invalid login')) throw new Error('Email o contraseña incorrectos');
        if (err.message.includes('Email not confirmed')) throw new Error('Confirmá tu email antes de ingresar');
        throw err;
      }
      // onAuthStateChange en useAuth.js se encarga del redirect
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim())           return setError('Ingresá tu nombre');
    if (!form.email.trim())            return setError('Ingresá tu email');
    if (form.password.length < 6)      return setError('La contraseña debe tener al menos 6 caracteres');
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { nombre: form.nombre.trim(), perfil: rol } }
      });
      if (err) throw err;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchToRegister() { setMode('register'); setStep('select'); setError(''); setForm({ nombre: '', email: '', password: '', confirm: '' }); }
  function switchToLogin()    { setMode('login');    setError(''); setForm(p => ({...p, password: '', confirm: '' })); }

  // ── LOGIN: solo email + password ────────────────────────────────────────────
  if (mode === 'login') return (
    <Page>
      <Card>
        <Logo />
        <h2 className="text-xl font-bold text-gray-900 mt-4 mb-1">Iniciar sesión</h2>
        <p className="text-sm text-gray-400 mb-5">Accedé a tu cuenta de Yendo</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="Email"      type="email"    placeholder="tu@email.com"  {...f('email')} />
          <Input label="Contraseña" type="password" placeholder="••••••••"      {...f('password')} />
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-60 transition-colors">
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-400 mt-4">
          ¿No tenés cuenta?{' '}
          <button onClick={switchToRegister} className="text-green-600 font-semibold hover:underline">
            Registrate
          </button>
        </p>
      </Card>
    </Page>
  );

  // ── REGISTRO: elegir rol ────────────────────────────────────────────────────
  if (step === 'select') return (
    <Page>
      <Card>
        <Logo />
        <h2 className="text-xl font-bold text-gray-900 mt-4 mb-1">Crear cuenta</h2>
        <p className="text-sm text-gray-400 mb-5">¿Cómo querés usar Yendo?</p>
        <div className="space-y-3">
          {ROLES.map(r => (
            <button key={r.value} onClick={() => { setRol(r.value); setStep('form'); }}
              className="w-full flex items-center gap-4 p-4 border-2 border-gray-100 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left">
              <span className="text-2xl">{r.emoji}</span>
              <div className="flex-1">
                <p className="font-bold text-gray-900">{r.label}</p>
                <p className="text-xs text-gray-500">{r.desc}</p>
              </div>
              <span className="text-gray-300">→</span>
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-4">
          ¿Ya tenés cuenta?{' '}
          <button onClick={switchToLogin} className="text-green-600 font-semibold hover:underline">
            Iniciá sesión
          </button>
        </p>
      </Card>
    </Page>
  );

  // ── REGISTRO: formulario ─────────────────────────────────────────────────────
  const rolData = ROLES.find(r => r.value === rol);
  return (
    <Page>
      <Card>
        <button onClick={() => setStep('select')} className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1">
          ← Volver
        </button>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{rolData?.emoji}</span>
          <h2 className="text-lg font-bold text-gray-900">Registrarme como {rolData?.label}</h2>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <Input label="Nombre completo"   type="text"     placeholder="Tu nombre"          {...f('nombre')} />
          <Input label="Email"             type="email"    placeholder="tu@email.com"        {...f('email')} />
          <Input label="Contraseña"        type="password" placeholder="Mínimo 6 caracteres" {...f('password')} />
          <Input label="Confirmar contraseña" type="password" placeholder="Repetí la contraseña" {...f('confirm')} />
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-60 transition-colors">
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-400 mt-4">
          ¿Ya tenés cuenta?{' '}
          <button onClick={switchToLogin} className="text-green-600 font-semibold hover:underline">
            Iniciá sesión
          </button>
        </p>
      </Card>
    </Page>
  );
}

function Page({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
function Card({ children }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">{children}</div>;
}
function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9C17 7.6 19.1 6 21.7 6 25 6 28 8.5 28 12.5 28 19 24 25 16 29Z" fill="#2ECC71"/>
        <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9V29Z" fill="#1A7A3C"/>
      </svg>
      <span className="text-2xl font-bold text-gray-900">Yendo</span>
    </div>
  );
}
function Input({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input {...props} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
    </div>
  );
}
