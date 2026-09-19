// Kochi's Marine Drive skyline, photographed by Fsquares (The Ibrahims).
// Source and CC BY-SA 4.0 license: https://commons.wikimedia.org/wiki/File:Kochi_Skyline.jpg
export const KOCHI_CITY_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/8/8f/Kochi_Skyline.jpg";

export function tripImage(trip: { destination: string; image?: string }): string | undefined {
  // Existing trips copied the old New York stock photo into their saved data.
  // Correct only that known mismatch, preserving any other saved cover photo.
  if (trip.destination === "Kochi City" &&
      trip.image?.split("?")[0] === "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b") {
    return KOCHI_CITY_IMAGE;
  }
  return trip.image;
}
