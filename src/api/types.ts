// ── API envelope ─────────────────────────────────────────────────────
export interface ApiSuccess<T> {
  success: true;
  data: T;
  timestamp: number;
}
export interface ApiError {
  success: false;
  error: { code: string; message: string };
  timestamp: number;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Study Corner ─────────────────────────────────────────────────────
export interface StudyPlaylist {
  label: string;
  url: string;
}
export interface StudySubjectSummary {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  youtubePlaylist: string | null;
  playlists?: StudyPlaylist[];
  materialCount?: number;
  pyqCount?: number;
  noteCount?: number;
}
export interface StudySubjectsResponse {
  semester: number;
  subjects: StudySubjectSummary[];
}
export interface StudyMaterialView {
  id: string;
  category: 'notes' | 'pyq' | 'syllabus' | 'other';
  unit: number | null;
  unitLabel: string | null;
  examSession: string | null;
  title: string;
  status: string;
  hasFile: boolean;
  previewable: boolean;
  kind: string;
  sources: { site: string; url?: string; driveId?: string }[];
  fileUrl: string | null;
  downloadUrl: string | null;
  externalUrl: string | null;
}
export interface StudySubjectDetail {
  subject: {
    id: string;
    semester: number;
    name: string;
    code: string | null;
    youtubePlaylist: string | null;
    playlists?: StudyPlaylist[];
  };
  materials: {
    syllabus: StudyMaterialView[];
    notes: StudyMaterialView[];
    pyqs: StudyMaterialView[];
    other: StudyMaterialView[];
  };
  counts: { total: number; syllabus: number; notes: number; pyqs: number };
}

// ── Analyzer ─────────────────────────────────────────────────────────
export interface AnalyzerSubjectCard {
  id: string;
  name: string;
  semester: number;
  code: string | null;
  noteCount: number;
  chunks: number;
  indexed: boolean;
  hasRoadmap: boolean;
}
export interface RoadmapTopic {
  title: string;
  subtopics: string[];
}
export interface RoadmapUnit {
  title: string;
  summary: string;
  topics: RoadmapTopic[];
}
export interface SubjectRoadmap {
  subject: { id: string; name: string; semester: number; code: string | null };
  units: RoadmapUnit[];
  generatedAt: string | number | null;
  model: string | null;
  status: 'ready' | 'pending' | 'none';
}
export interface ChatCitation {
  materialId: string;
  title: string;
  unit: number | null;
  snippet: string;
}
export interface ChatResponse {
  answer: string;
  citations: ChatCitation[];
}
