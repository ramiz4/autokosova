export interface CatalogPlace {
  readonly aliases: readonly string[];
  readonly id: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
}

// These are the same source-checked GeoNames reference points seeded by db/catalog.mjs.
// They identify municipalities, not a workshop entrance or a route calculation.
export const CATALOG_PLACES: readonly CatalogPlace[] = [
  {
    aliases: ['Pristina', 'Prishtinë', 'Prishtine'],
    id: 'xk-pristina',
    label: 'Prishtina',
    latitude: 42.67272,
    longitude: 21.16688,
  },
  {
    aliases: ['Prizreni'],
    id: 'xk-prizren',
    label: 'Prizren',
    latitude: 42.21389,
    longitude: 20.73972,
  },
  {
    aliases: ['Peja', 'Pec', 'Peć'],
    id: 'xk-peja',
    label: 'Pejë',
    latitude: 42.65913,
    longitude: 20.28828,
  },
  {
    aliases: ['Gjakova', 'Djakovica', 'Đakovica'],
    id: 'xk-gjakova',
    label: 'Gjakovë',
    latitude: 42.38028,
    longitude: 20.43083,
  },
  {
    aliases: ['Uroševac', 'Ferizovic'],
    id: 'xk-ferizaj',
    label: 'Ferizaj',
    latitude: 42.37056,
    longitude: 21.15528,
  },
  {
    aliases: ['Gnjilane', 'Gilan'],
    id: 'xk-gjilan',
    label: 'Gjilan',
    latitude: 42.46045,
    longitude: 21.46986,
  },
  {
    aliases: ['Mitrovica', 'Kosovska Mitrovica'],
    id: 'xk-mitrovica',
    label: 'Mitrovicë',
    latitude: 42.88333,
    longitude: 20.86667,
  },
];

export const SERVICE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'elektronik-diagnose': 'Elektronik und Diagnose',
  bremsen: 'Bremsen',
  getriebe: 'Getriebe',
  karosserie: 'Karosserie',
  klima: 'Klimaanlage',
  motor: 'Motor',
  reifen: 'Reifen',
  'service-inspektion': 'Service und Inspektion',
};

export const VEHICLE_MAKE_LABELS: Readonly<Record<string, string>> = {
  audi: 'Audi',
  bmw: 'BMW',
  'mercedes-benz': 'Mercedes-Benz',
  opel: 'Opel',
  renault: 'Renault',
  skoda: 'Škoda',
  toyota: 'Toyota',
  volkswagen: 'Volkswagen',
};

export function getCatalogPlace(placeId: string): CatalogPlace | undefined {
  return CATALOG_PLACES.find((place) => place.id === placeId);
}
