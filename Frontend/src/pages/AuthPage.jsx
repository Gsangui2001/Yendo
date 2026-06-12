import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ROLES = [
  { value: 'comercio', emoji: '🏪', label: 'Comercio',  desc: 'Gestioná tus envíos y pedidos desde tu negocio' },
  { value: 'cadete',   emoji: '🚴', label: 'Cadete',    desc: 'Tomá pedidos y gestioná tu jornada de trabajo' },
  { value: 'privado',  emoji: '👤', label: 'Privado',   desc: 'Enviá algo o hacé un mandado personal' },
];

const DEMO_ACCOUNTS = [
  { rol: 'comercio', label: 'Comercio', email: 'comercio@yendo.com', password: 'Yendo2026!' },
  { rol: 'cadete', label: 'Cadete', email: 'cadete@yendo.com', password: 'Yendo2026!' },
  { rol: 'privado', label: 'Privado', email: 'privado@yendo.com', password: 'Yendo2026!' },
  { rol: 'admin', label: 'Admin', email: 'admin@yendo.com', password: 'Yendo2026!' },
];

export default function AuthPage() {
  const [mode,    setMode]    = useState('login');
  const [step,    setStep]    = useState('select');
  const [rol,     setRol]     = useState('');
  const [form,    setForm]    = useState({ nombre: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState('');
  const [error,   setError]   = useState('');

  function f(name) {
    return { value: form[name], onChange: e => { setForm(p => ({...p, [name]: e.target.value})); setError(''); } };
  }

  async function handleLogin(e) {
    e.preventDefault();
    await signIn(form.email, form.password);
  }

  async function signIn(email, password, demoRol = '') {
    setError('');
    if (!email.trim()) return setError('Ingresá tu email');
    if (!password)     return setError('Ingresá tu contraseña');
    setLoading(true);
    if (demoRol) setDemoLoading(demoRol);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      });
      if (err) {
        if (err.message.includes('Invalid login')) throw new Error('Email o contraseña incorrectos');
        if (err.message.includes('Email not confirmed')) throw new Error('Confirmá tu email antes de ingresar');
        throw err;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setDemoLoading('');
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim())            return setError('Ingresá tu nombre');
    if (!form.email.trim())             return setError('Ingresá tu email');
    if (form.password.length < 6)       return setError('La contraseña debe tener al menos 6 caracteres');
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

  function switchToRegister() {
    setMode('register'); setStep('select'); setError('');
    setForm({ nombre: '', email: '', password: '', confirm: '' });
  }
  function switchToLogin() {
    setMode('login'); setError('');
    setForm(p => ({...p, password: '', confirm: '' }));
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (mode === 'login') return (
    <Page>
      <AuthCard key="login">
        <Logo />
        <h2 className="text-xl font-bold text-gray-900 mt-5 mb-1">Bienvenido de vuelta</h2>
        <p className="text-sm text-gray-400 mb-6">Accedé a tu cuenta de Yendo</p>

        {/* Llegó acá porque el backend rechazó su token (apiFetch redirige) */}
        {new URLSearchParams(window.location.search).get('sesion') === 'vencida' && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 animate-bounce-in">
            <span>⏰</span> Tu sesión venció. Volvé a iniciar sesión.
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <AuthInput label="Email" type="email" placeholder="tu@email.com" {...f('email')} />
          <AuthInput label="Contraseña" type="password" placeholder="••••••••" {...f('password')} />

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl animate-bounce-in">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full py-3 font-bold rounded-xl text-white
              bg-gradient-to-r from-green-600 to-green-500
              transition-all duration-200
              hover:-translate-y-0.5 hover:shadow-glow-md hover:from-green-700 hover:to-green-600
              active:translate-y-0 active:scale-95
              disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0
              relative overflow-hidden
            "
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Ingresando...
              </span>
            ) : 'Iniciar sesión'}
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">Ingresar como</p>
              <p className="text-xs text-gray-500">Accesos rápidos para probar la beta</p>
            </div>
            <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-bold text-green-700">Demo</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map(account => (
              <button
                key={account.rol}
                type="button"
                disabled={loading}
                onClick={() => signIn(account.email, account.password, account.rol)}
                className="rounded-xl border border-white bg-white px-3 py-2.5 text-left text-sm font-bold text-gray-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-200 hover:bg-green-50 disabled:opacity-60"
              >
                {demoLoading === account.rol ? 'Ingresando...' : account.label}
                <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-400">{account.email}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">o</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <p className="text-center text-sm text-gray-500">
          ¿No tenés cuenta?{' '}
          <button
            onClick={switchToRegister}
            className="text-green-600 font-bold hover:text-green-700 underline-offset-2 hover:underline transition-colors"
          >
            Registrate gratis
          </button>
        </p>
      </AuthCard>
    </Page>
  );

  // ── REGISTRO: elegir rol ───────────────────────────────────────────────────
  if (step === 'select') return (
    <Page>
      <AuthCard key="select">
        <Logo />
        <h2 className="text-xl font-bold text-gray-900 mt-5 mb-1">Crear cuenta</h2>
        <p className="text-sm text-gray-400 mb-5">¿Cómo querés usar Yendo?</p>

        <div className="space-y-3 stagger">
          {ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => { setRol(r.value); setStep('form'); }}
              className="
                w-full flex items-center gap-4 p-4
                border-2 border-gray-100 rounded-xl text-left
                transition-all duration-200 ease-out
                hover:border-green-400 hover:bg-green-50 hover:-translate-y-0.5 hover:shadow-md
                active:translate-y-0 active:scale-98
                group animate-slide-up
              "
            >
              <span className="text-2xl transition-transform duration-200 group-hover:scale-110">
                {r.emoji}
              </span>
              <div className="flex-1">
                <p className="font-bold text-gray-900">{r.label}</p>
                <p className="text-xs text-gray-500">{r.desc}</p>
              </div>
              <span className="
                text-gray-300 text-lg
                transition-all duration-200
                group-hover:text-green-500 group-hover:translate-x-1
              ">→</span>
            </button>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          ¿Ya tenés cuenta?{' '}
          <button onClick={switchToLogin} className="text-green-600 font-bold hover:underline transition-colors">
            Iniciá sesión
          </button>
        </p>
      </AuthCard>
    </Page>
  );

  // ── REGISTRO: formulario ───────────────────────────────────────────────────
  const rolData = ROLES.find(r => r.value === rol);
  return (
    <Page>
      <AuthCard key="form">
        <button
          onClick={() => setStep('select')}
          className="
            text-sm text-gray-400 hover:text-gray-700 mb-4
            flex items-center gap-1 transition-all duration-150
            hover:-translate-x-0.5
          "
        >
          ← Volver
        </button>

        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">{rolData?.emoji}</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Registrarme como {rolData?.label}</h2>
            <p className="text-xs text-gray-400">{rolData?.desc}</p>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <AuthInput label="Nombre completo"      type="text"     placeholder="Tu nombre"              {...f('nombre')} />
          <AuthInput label="Email"                type="email"    placeholder="tu@email.com"            {...f('email')} />
          <AuthInput label="Contraseña"           type="password" placeholder="Mínimo 6 caracteres"    {...f('password')} />
          <AuthInput label="Confirmar contraseña" type="password" placeholder="Repetí la contraseña"   {...f('confirm')} />

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl animate-bounce-in">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full py-3 font-bold rounded-xl text-white
              bg-gradient-to-r from-green-600 to-green-500
              transition-all duration-200
              hover:-translate-y-0.5 hover:shadow-glow-md hover:from-green-700 hover:to-green-600
              active:translate-y-0 active:scale-95
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Creando cuenta...
              </span>
            ) : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          ¿Ya tenés cuenta?{' '}
          <button onClick={switchToLogin} className="text-green-600 font-bold hover:underline transition-colors">
            Iniciá sesión
          </button>
        </p>
      </AuthCard>
    </Page>
  );
}

function Page({ children }) {
  return (
    <div className="min-h-screen auth-bg flex items-center justify-center p-4">
      {/* Decoración de fondo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-green-100/60 to-transparent" />
      </div>
      <div className="w-full max-w-md relative">
        {children}
      </div>
    </div>
  );
}

function AuthCard({ children }) {
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lift border border-gray-100/80 p-6 animate-slide-up">
      {children}
    </div>
  );
}

function Logo() {
  return (
    <a
      href="https://yendo-landing.netlify.app"
      className="flex items-center gap-2.5 hover:opacity-80 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
      title="Ir al inicio"
    >
      <svg viewBox="0 0 32 32" fill="none" className="w-9 h-9 drop-shadow-sm">
        <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9C17 7.6 19.1 6 21.7 6 25 6 28 8.5 28 12.5 28 19 24 25 16 29Z" fill="#22C55E"/>
        <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9V29Z" fill="#15803D"/>
      </svg>
      <span className="text-2xl font-extrabold text-gray-900 tracking-tight">Yendo</span>
    </a>
  );
}

function AuthInput({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        {...props}
        className="
          w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent focus:shadow-glow
          placeholder:text-gray-400
          hover:border-gray-300
        "
      />
    </div>
  );
}
