import { fetchApi } from './fetchApi.js';

export async function apiCall(url, options = {}) {
  const API_BASE_URL = localStorage.getItem('apiBaseUrl') || '';
  if (API_BASE_URL === '') {
    const finalUrl = url.startsWith('/') ? url : `/${url}`;
    return fetchApi(finalUrl, options);
  }
  return fetch(API_BASE_URL + url, options);
}