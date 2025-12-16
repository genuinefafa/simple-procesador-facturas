import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  try {
    // Traer los últimos 10 emisores (los más recientes por ID)
    const response = await fetch('/api/emisores?limit=10');
    const data = await response.json();

    return {
      recentEmitters: data.emitters || [],
    };
  } catch (e) {
    console.error('Error loading recent emitters:', e);
    return {
      recentEmitters: [],
    };
  }
};
