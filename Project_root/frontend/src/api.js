// Use same-origin when served by FastAPI; fallback to backend dev URL when on React dev server
const API_BASE = (typeof window !== "undefined" && window.location && window.location.port === "3000")
  ? "http://localhost:8000/api"
  : "/api";

// Generic helper that always includes credentials for cookie-based auth
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(typeof data === 'string' ? data : data?.detail || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function generateAssessment(course) {
  return request(`/assessment/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course }),
  });
}

export async function checkAssessment(course, answers, questions) {
  return request(`/assessment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course, answers, questions }),
  });
}

export async function checkSimilarity(course, file) {
  const formData = new FormData();
  formData.append("course", course);
  formData.append("file", file);
  return request(`/similarity/check`, { method: "POST", body: formData });
}

export async function getVideos() {
  return request(`/similarity/videos`);
}

export async function getMyVideos() {
  return request(`/similarity/videos/mine`);
}

export async function getAllVideos() {
  return request(`/similarity/videos/all`);
}

export async function deleteMyVideo(id) {
  return request(`/similarity/videos/${id}`, { method: 'DELETE' });
}

export async function getAuthConfig() {
  return request(`/auth/config`);
}

// Auth API
export async function signupApi({ fullName, email, password }) {
  return request(`/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email, password }),
  });
}

export async function loginApi({ email, password }) {
  return request(`/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function meApi() {
  return request(`/auth/me`);
}

export async function logoutApi() {
  return request(`/auth/logout`, { method: 'POST' });
}

export async function loginGoogleApi({ idToken }) {
  return request(`/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
}

// Purchase API
export async function listMyPurchases() {
  return request(`/purchase/mine`);
}

export async function hasPurchased(videoId) {
  return request(`/purchase/has/${videoId}`);
}

export async function buyVideo(videoId) {
  return request(`/purchase/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: Number(videoId) }),
  });
}

// AI Assistant API
export async function chatAi(messages) {
  return request(`/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

// AI Chat Logs API
export async function getMyChatLogs() {
  return request(`/ai/logs/mine`);
}

export async function clearMyChatLogs() {
  return request(`/ai/logs/mine`, { method: 'DELETE' });
}