export const VENUE = {
  name: 'Verdel',
  kind: 'Cervecería',
  tableCount: 30,
  timeZone: 'America/Argentina/Tucuman',
};

export const STATIONS = {
  pizzas: 'Cocina de pizzas y empanadas',
  house: 'Cocina de Verdel',
};

const pesos = (amount) => amount * 100;

export const SECTIONS = [
  {
    id: 'promos',
    title: 'Promos',
    hook: 'Comida y bebida juntas salen menos.',
    art: 'toast',
    items: [
      { code: 'cp', name: 'Pizza común + Norte de litro', kitchen: [{ station: 'pizzas', label: 'Pizza común' }], options: [{ label: '', priceCents: pesos(20000), listCents: pesos(25000) }] },
      { code: 'cd', name: '12 empanadas + Norte de litro', kitchen: [{ station: 'pizzas', label: '12 empanadas' }], options: [{ label: '', priceCents: pesos(25000), listCents: pesos(29000) }] },
      { code: 'c4', name: '4 empanadas + Coca 350 ml', kitchen: [{ station: 'pizzas', label: '4 empanadas' }], options: [{ label: '', priceCents: pesos(10500), listCents: pesos(11900) }] },
    ],
  },
  {
    id: 'beers',
    title: 'Cervezas',
    hook: 'De litro. Llevando 2 o 3 pagás menos.',
    art: 'bottle',
    items: [
      { code: 'no', name: 'Norte', options: [{ label: '1 litro', priceCents: pesos(8000) }, { label: '2 litros', priceCents: pesos(14000), listCents: pesos(16000) }, { label: '3 litros', priceCents: pesos(21000), listCents: pesos(24000) }] },
      { code: 'im', name: 'Imperial', note: 'IPA, Golden o Lager.', options: [{ label: '1 litro', priceCents: pesos(9000) }, { label: '2 litros', priceCents: pesos(16000), listCents: pesos(18000) }, { label: '3 litros', priceCents: pesos(24000), listCents: pesos(27000) }] },
      { code: 'he', name: 'Heineken', options: [{ label: '1 litro', priceCents: pesos(12000) }, { label: '2 litros', priceCents: pesos(22000), listCents: pesos(24000) }, { label: '3 litros', priceCents: pesos(33000), listCents: pesos(36000) }] },
      { code: 'sn', name: 'Salta Negra', note: 'De litro.', options: [{ label: '', priceCents: pesos(9000) }] },
      { code: 'nl', name: 'Norte en lata', options: [{ label: '', priceCents: pesos(3500) }] },
    ],
  },
  {
    id: 'snacks',
    title: 'Para picar',
    hook: 'Para el centro de la mesa.',
    art: 'fries',
    items: [
      { code: 'pa', name: 'Papas', station: 'house', options: [{ label: 'Clásicas', priceCents: pesos(10000) }, { label: 'Gratinadas', priceCents: pesos(12000) }, { label: 'Yankee', priceCents: pesos(13000), featured: true }] },
      { code: 'em', name: 'Empanadas', station: 'pizzas', options: [{ label: 'Unidad', priceCents: pesos(2100) }, { label: 'Docena', priceCents: pesos(21000), listCents: pesos(25200), featured: true }] },
      { code: 'sf', name: 'Sfija', note: 'Por unidad.', station: 'pizzas', options: [{ label: '', priceCents: pesos(2100) }] },
    ],
  },
  {
    id: 'pizzas',
    title: 'Pizzas',
    hook: 'Entera para compartir o media para vos.',
    art: 'pizza',
    station: 'pizzas',
    items: [
      { code: 'pc', name: 'Común', longName: 'Pizza común', options: [{ label: 'Entera', priceCents: pesos(17000) }, { label: 'Media', priceCents: pesos(8500) }] },
      { code: 'pn', name: 'Napolitana', longName: 'Pizza napolitana', options: [{ label: 'Entera', priceCents: pesos(18000) }, { label: 'Media', priceCents: pesos(9000) }] },
      { code: 'pe', name: 'Especial', longName: 'Pizza especial', options: [{ label: 'Entera', priceCents: pesos(19000), featured: true }, { label: 'Media', priceCents: pesos(9000) }] },
    ],
  },
  {
    id: 'sandwiches',
    title: 'Sándwiches y hamburguesas',
    shortTitle: 'Sándwiches',
    hook: 'Clásico, o especial si viniste con hambre.',
    art: 'burger',
    station: 'house',
    items: [
      { code: 'mi', name: 'Sándwich de milanesa', options: [{ label: 'Clásico', priceCents: pesos(12000) }, { label: 'Especial', priceCents: pesos(16000), featured: true }] },
      { code: 'lo', name: 'Sándwich de lomito', options: [{ label: 'Clásico', priceCents: pesos(12500) }, { label: 'Especial', priceCents: pesos(16500), featured: true }] },
      { code: 'ha', name: 'Hamburguesa', options: [{ label: 'Clásica', priceCents: pesos(12000) }, { label: 'Yankee', priceCents: pesos(14000) }, { label: 'Especial', priceCents: pesos(16000), featured: true }] },
    ],
  },
  {
    id: 'drinks',
    title: 'Tragos y vinos',
    shortTitle: 'Tragos',
    hook: 'Para el que hoy no toma cerveza.',
    art: 'highball',
    items: [
      { code: 'fe', name: 'Fernet con Coca', note: '500 ml.', options: [{ label: '', priceCents: pesos(6000) }] },
      { code: 'gi', name: 'Gin', note: 'Vaso de 500 ml.', options: [{ label: '', priceCents: pesos(6500) }] },
      { code: 'vo', name: 'Vodka', note: 'Vaso de 500 ml.', options: [{ label: '', priceCents: pesos(6500) }] },
      { code: 'dl', name: 'Dr. Lemon', note: '1 litro.', options: [{ label: '', priceCents: pesos(9000) }] },
      { code: 'vt', name: 'Vino tinto Canciller', options: [{ label: '', priceCents: pesos(12000) }] },
      { code: 'vb', name: 'Vino blanco Dilema', options: [{ label: '', priceCents: pesos(12000) }] },
    ],
  },
  {
    id: 'soft',
    title: 'Sin alcohol',
    hook: 'Gaseosas, agua y Aquarius.',
    art: 'can',
    items: [
      { code: 'ga', name: 'Gaseosa', options: [{ label: '350 ml', priceCents: pesos(3500) }, { label: '1 litro', priceCents: pesos(6000) }] },
      { code: 'ag', name: 'Agua o soda', note: '500 ml.', options: [{ label: '', priceCents: pesos(3500) }] },
      { code: 'aq', name: 'Aquarius', note: '500 ml.', options: [{ label: '', priceCents: pesos(3500) }] },
    ],
  },
];

export const TABLE_SUGGESTIONS = [
  { label: '2', keys: ['no1', 'pa2'] },
  { label: '3', keys: ['no2', 'pe0'] },
  { label: '4 o más', keys: ['no2', 'cp0', 'pa1'] },
];

export function buildOptionIndex(sections = SECTIONS) {
  const index = new Map();
  for (const section of sections) {
    for (const item of section.items) {
      item.options.forEach((option, position) => {
        const name = (item.longName || item.name) + (option.label ? ` · ${option.label}` : '');
        const station = item.station || section.station;
        const kitchen = item.kitchen || (station ? [{ station, label: name }] : []);
        index.set(`${item.code}${position}`, { key: `${item.code}${position}`, item, option, name, kitchen });
      });
    }
  }
  return index;
}

export function formatAmount(cents) {
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${String(fraction).padStart(2, '0')}` : grouped;
}
