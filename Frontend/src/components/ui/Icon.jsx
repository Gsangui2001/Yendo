// Set de iconos de línea (SVG) de Yendo. Reemplazan a los emojis para un
// look más profesional. Heredan el color del texto (currentColor) y el tamaño
// se controla con className (ej: className="w-5 h-5").
//
// Uso: <Icon name="bike" className="w-5 h-5 text-green-600" />

const PATHS = {
  // Navegación / acciones
  plus:      ['M12 5v14', 'M5 12h14'],
  check:     ['M20 6 9 17l-5-5'],
  x:         ['M18 6 6 18', 'M6 6l12 12'],
  arrowRight:['M5 12h14', 'm12 5 7 7-7 7'],
  list:      ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  power:     ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.77.04'],
  navigate:  ['m3 11 19-9-9 19-2-8-8-2z'],

  // Entidades
  box:       ['m21 16-9 5-9-5V8l9-5 9 5z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
  store:     ['M3 9l1.5-5h15L21 9', 'M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9', 'M4 9h16'],
  bike:      ['M18.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M5.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M15 15l-3-7-2 3h-3'],
  user:      ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  users:     ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  pin:       ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  phone:     ['M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.09 4.18 2 2 0 0 1 4.08 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],

  // Dinero / métricas
  wallet:    ['M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7', 'M16 12h.01'],
  money:     ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  chart:     ['M3 3v18h18', 'm7 15 4-4 3 3 5-6'],
  clock:     ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  star:      ['M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z'],
  zap:       ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  gift:      ['M20 12v10H4V12', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
};

export function Icon({ name, className = 'w-5 h-5', fill = false, strokeWidth = 2 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
