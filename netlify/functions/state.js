// Netlify Function: shared state storage for Family Meal Planner
// Uses Netlify Blobs to persist a single JSON document.
// Endpoints:
//   GET  /.netlify/functions/state  -> returns JSON or null
//   PUT  /.netlify/functions/state  -> accepts JSON and stores it

import { getStore } from '@netlify/blobs';

export async function handler(event) {
  const store = getStore('meal-planner');
  const key = 'state.json';

  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(key, { type: 'json' });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          // Prevent CDN/browser caching of state so all devices see updates immediately
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
        body: JSON.stringify(data ?? null),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
        body: 'null',
      };
    }
  }

  if (event.httpMethod === 'PUT') {
    try {
      const body = JSON.parse(event.body || '{}');
      if (typeof body !== 'object' || Array.isArray(body)) {
        return { statusCode: 400, body: 'Invalid JSON' };
      }
      await store.set(key, JSON.stringify(body), { contentType: 'application/json' });
      return {
        statusCode: 204,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
        body: ''
      };
    } catch (e) {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
}
