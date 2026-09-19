import { randomUUID } from 'node:crypto';

export function exampleProfile() {
  return {
    name: 'Alex', city: 'Kochi', country: 'India', currency: 'INR',
    personality: 'Peace-seeking', interests: ['Nature', 'Culture', 'Food'],
    group: 'Couple', transport: 'Car', budget: 'Balanced', language: 'English',
    notifications: { trips: true, vehicle: true, fuel: true, weather: false, maintenance: true, social: false, recommendations: false }, visibility: 'private',
  };
}

export function exampleEntities() {
  const tripId = randomUUID();
  return {
    trips: [{
      id: tripId, destination: 'Munnar', country: 'India', image: 'https://images.unsplash.com/photo-1491497895121-1334fc14d8c9?auto=format&fit=crop&w=1200&q=85',
      startDate: '2026-10-10', days: 3, people: 2, budget: 12000,
      currency: 'INR', group: 'Couple', personality: 'Peace-seeking', transport: 'Car',
      status: 'Upcoming', distanceKm: 0, isExample: true, provenance: 'EXAMPLE',
      itinerary: [
        { day: 1, title: 'Into the tea hills', activities: [
          { time: '08:00', title: 'A gentle drive from Kochi', category: 'Nature', description: 'An example journey with room for breaks. Check the route and current road conditions before setting out.', cost: 900, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Low', isExample: true, provenance: 'EXAMPLE' },
          { time: '13:00', title: 'A relaxed Kerala lunch', category: 'Food', description: 'Settle into Munnar with an unhurried meal. This amount is a sample budget for two, not a restaurant quote.', cost: 400, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Moderate', isExample: true, provenance: 'EXAMPLE' },
          { time: '16:00', title: 'Tea-country views', category: 'Nature', description: 'Pause at a permitted public viewpoint. Check access and weather locally; do not enter private plantations without permission.', cost: 0, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Low', isExample: true, provenance: 'EXAMPLE' },
        ] },
        { day: 2, title: 'A little nature, a slower pace', activities: [
          { time: '08:00', title: 'A morning among the hills', category: 'Nature', description: 'Choose an accessible local walk after checking current conditions and any required permissions.', cost: 200, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Low', isExample: true, provenance: 'EXAMPLE' },
          { time: '13:00', title: 'Lunch and a tea break', category: 'Food', description: 'Leave the afternoon flexible. Sample budget allocation for two travellers.', cost: 400, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Moderate', isExample: true, provenance: 'EXAMPLE' },
          { time: '15:30', title: 'Mattupetty scenery', category: 'Nature', description: 'Consider a scenic stop if access and local conditions suit your plans. Activities and actual prices are unverified.', cost: 200, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Moderate', isExample: true, provenance: 'EXAMPLE' },
        ] },
        { day: 3, title: 'One last slow morning', activities: [
          { time: '08:30', title: 'A quiet breakfast in Munnar', category: 'Food', description: 'Enjoy an easy start before checking out. Example allowance for two travellers.', cost: 400, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Low', isExample: true, provenance: 'EXAMPLE' },
          { time: '10:00', title: 'Tea and local stories', category: 'Culture', description: 'Explore a local tea stop after confirming opening hours, access, and admission.', cost: 200, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Moderate', isExample: true, provenance: 'EXAMPLE' },
          { time: '13:00', title: 'The scenic way home', category: 'Nature', description: 'Head back to Kochi with time for rest stops. Check current route information before leaving.', cost: 900, currency: 'INR', costLabel: 'Estimated budget allocation', crowd: 'Low', isExample: true, provenance: 'EXAMPLE' },
        ] },
      ],
    }],
    vehicles: [{
      id: randomUUID(), name: 'My Tata Nexon', type: 'Car', fuelType: 'Petrol',
      tankCapacity: 44, mileage: 17, odometer: 28450, fuelLevel: 62,
      isExample: true, provenance: 'EXAMPLE',
    }],
    expenses: [
      { id: randomUUID(), tripId, title: 'Fuel for the hills', category: 'Fuel', amount: 1800, currency: 'INR', date: '2026-10-10', people: 2, isExample: true, provenance: 'EXAMPLE' },
      { id: randomUUID(), tripId, title: 'A hillside stay', category: 'Hotel', amount: 4200, currency: 'INR', date: '2026-10-10', people: 2, isExample: true, provenance: 'EXAMPLE' },
      { id: randomUUID(), tripId, title: 'Local meals and tea', category: 'Food', amount: 1200, currency: 'INR', date: '2026-10-11', people: 2, isExample: true, provenance: 'EXAMPLE' },
      { id: randomUUID(), tripId, title: 'Little discoveries', category: 'Activities', amount: 600, currency: 'INR', date: '2026-10-11', people: 2, isExample: true, provenance: 'EXAMPLE' },
    ],
    savedPlaces: [],
  };
}
