import { createContext, useContext, useState, useCallback, useRef } from 'react';

// Sistema de feedback propio de Yendo: toasts animados + diálogo de confirmación.
// Reemplaza alert() / confirm() / prompt() nativos para que se sienta una app.
//
// Uso:
//   const toast = useToast();
//   toast.success('Guardado');  toast.error('Falló');  toast.info('...');
//
//   const confirm = useConfirm();
//   if (await confirm({ title: 'Eliminar', message: '¿Seguro?', danger: true })) { ... }

const ToastCtx   = createContext(null);
const ConfirmCtx = createContext(null);

const ICON = {
  success: 'M20 6 9 17l-5-5',
  error:   'M18 6 6 18 M6 6l12 12',
  info:    'M12 16v-4 M12 8h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
};

const STYLE = {
  success: { ring: 'border-green-200', icon: 'bg-green-100 text-green-600', bar: 'bg-green-500' },
  error:   { ring: 'border-red-200',   icon: 'bg-red-100 text-red-500',     bar: 'bg-red-500' },
  info:    { ring: 'border-blue-200',  icon: 'bg-blue-100 text-blue-500',   bar: 'bg-blue-500' },
};

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const push = useCallback((type, message, opts = {}) => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, type, message }]);
    const dur = opts.duration ?? (type === 'error' ? 5000 : 3500);
    setTimeout(() => remove(id), dur);
    return id;
  }, [remove]);

  // Identidad estable para poder usar `toast` en dependencias sin re-render.
  const toast = useRef({
    success: (m, o) => push('success', m, o),
    error:   (m, o) => push('error', m, o),
    info:    (m, o) => push('info', m, o),
  }).current;

  const [confirmState, setConfirmState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => {
    setConfirmState({ resolve, ...opts });
  }), []);
  const closeConfirm = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}

        {/* Stack de toasts */}
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2.5 w-[min(92vw,360px)] pointer-events-none">
          {toasts.map((t) => {
            const s = STYLE[t.type] ?? STYLE.info;
            return (
              <div key={t.id}
                className={`pointer-events-auto flex items-start gap-3 bg-white border ${s.ring} rounded-2xl shadow-lift-lg px-4 py-3 animate-slide-in-right overflow-hidden`}>
                <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${s.icon}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    {ICON[t.type].split(' M').map((d, i) => <path key={i} d={i === 0 ? d : 'M' + d} />)}
                  </svg>
                </span>
                <p className="flex-1 text-sm font-semibold text-gray-800 leading-snug py-0.5">{t.message}</p>
                <button onClick={() => remove(t.id)}
                  className="text-gray-300 hover:text-gray-600 transition-colors text-lg leading-none -mr-1">×</button>
              </div>
            );
          })}
        </div>

        {/* Diálogo de confirmación */}
        {confirmState && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in-fast" onClick={() => closeConfirm(false)} />
            <div className="relative bg-white rounded-2xl shadow-lift-lg w-full max-w-sm p-6 animate-bounce-in">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${confirmState.danger ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  {confirmState.danger
                    ? <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>
                    : <><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" /><path d="M12 8v4 M12 16h.01" /></>}
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{confirmState.title ?? '¿Confirmás?'}</h3>
              {confirmState.message && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{confirmState.message}</p>}
              <div className="flex gap-3 mt-6">
                <button onClick={() => closeConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors active:scale-95">
                  {confirmState.cancelLabel ?? 'Cancelar'}
                </button>
                <button onClick={() => closeConfirm(true)}
                  className={`flex-[1.4] py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 ${confirmState.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}>
                  {confirmState.confirmLabel ?? 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

export const useToast   = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);
