import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await fetch('/api/emisores?limit=200');
    const data = await response.json();

    return {
      emitters: data.emitters || [],
    };
  } catch (e) {
    console.error('Error loading emitters:', e);
    return {
      emitters: [],
    };
  }
};
