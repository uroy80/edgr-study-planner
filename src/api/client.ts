import type {
  ApiResponse,
  StudySubjectsResponse,
  StudySubjectDetail,
  AnalyzerSubjectCard,
  SubjectRoadmap,
  ChatResponse,
} from './types';

const BASE = ''; // same-origin
const TIMEOUT_MS = 20_000;
const LONG_TIMEOUT_MS = 180_000; // roadmap/chat generation can be slow on local LLM

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; timeout?: number } = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, timeout = TIMEOUT_MS } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (json && typeof json === 'object' && 'success' in json) return json as ApiResponse<T>;
    if (!res.ok) {
      return { success: false, error: { code: String(res.status), message: 'Request failed' }, timestamp: Date.now() };
    }
    return { success: true, data: json as T, timestamp: Date.now() };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return {
      success: false,
      error: { code: aborted ? 'TIMEOUT' : 'NETWORK', message: aborted ? 'Timed out' : 'Network error' },
      timestamp: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Study Corner
  studySemesters: () => request<{ semesters: number[] }>('/api/study/semesters'),
  studySubjects: (semester: number) =>
    request<StudySubjectsResponse>(`/api/study/subjects?semester=${semester}`),
  studySubject: (id: string) => request<StudySubjectDetail>(`/api/study/subjects/${id}`),

  // Analyzer
  analyzerSubjects: (semester?: number) =>
    request<{ subjects: AnalyzerSubjectCard[] }>(
      `/api/analyzer/subjects${semester ? `?semester=${semester}` : ''}`,
    ),
  roadmap: (subjectId: string) =>
    request<SubjectRoadmap>(`/api/analyzer/subject/${subjectId}/roadmap`),
  generateRoadmap: (subjectId: string) =>
    request<SubjectRoadmap>(`/api/analyzer/subject/${subjectId}/roadmap`, {
      method: 'POST',
      timeout: LONG_TIMEOUT_MS,
    }),
  chat: (subjectId: string, message: string) =>
    request<ChatResponse>(`/api/analyzer/subject/${subjectId}/chat`, {
      method: 'POST',
      body: { message },
      timeout: LONG_TIMEOUT_MS,
    }),
};
