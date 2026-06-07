import dotenv from 'dotenv';
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3100', 10),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://studyplanner:studyplanner@localhost:5432/studyplanner',
  ollamaHost: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5:3b',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  studyMaterialsDir: process.env.STUDY_MATERIALS_DIR ?? './data/study-materials',
};
