import { describe, expect, it, vi } from 'vitest';

describe('Google reverse geocoding', () => {
  it('uses the most precise result (building / door) and fills area, town and PIN from the others', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.resetModules();
    const { reverseGeocode } = await import('../src/services/geo.service');
    const comp = (long_name: string, ...types: string[]) => ({ long_name, types });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            { types: ['plus_code'], formatted_address: 'Q8R4+2X Tanuku', address_components: [comp('Q8R4+2X', 'plus_code')], geometry: { location: { lat: 16.756, lng: 81.683 } } },
            {
              types: ['route'],
              formatted_address: 'Main Road, Venkatarayapuram, Tanuku, Andhra Pradesh 534211, India',
              address_components: [comp('Main Road', 'route'), comp('Venkatarayapuram', 'sublocality_level_1', 'sublocality'), comp('Tanuku', 'locality'), comp('West Godavari', 'administrative_area_level_2'), comp('Andhra Pradesh', 'administrative_area_level_1'), comp('534211', 'postal_code')],
              geometry: { location: { lat: 16.7561, lng: 81.6831 }, location_type: 'GEOMETRIC_CENTER' },
            },
            {
              types: ['premise'],
              formatted_address: '7-21, Sai Residency, Main Road, Tanuku',
              address_components: [comp('Sai Residency', 'premise'), comp('7-21', 'street_number'), comp('Main Road', 'route')],
              geometry: { location: { lat: 16.756, lng: 81.683 }, location_type: 'ROOFTOP' },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const a = await reverseGeocode(16.75601, 81.68302);
    expect(a).toMatchObject({
      houseNo: 'Sai Residency, 7-21',
      street: 'Main Road',
      area: 'Venkatarayapuram',
      villageTown: 'Tanuku',
      pincode: '534211',
      formatted: '7-21, Sai Residency, Main Road, Tanuku',
      latitude: 16.75601,
      longitude: 81.68302,
    });
    vi.restoreAllMocks();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});
