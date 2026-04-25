// Placeholder until a real marine/oceanography API is integrated.
// TODO: replace mock with actual waves & currents API call.

export interface MarineData {
  waves: number;       // significant wave height in metres
  currents: number;    // surface current speed in m/s
  currents_dir: string; // cardinal direction e.g. 'NE'
}

const MOCK_MARINE: MarineData = {
  waves: 1.2,
  currents: 0.8,
  currents_dir: 'NE',
};

export function useMarine(): MarineData {
  // When a real API is ready, fetch here and store in state.
  return MOCK_MARINE;
}
