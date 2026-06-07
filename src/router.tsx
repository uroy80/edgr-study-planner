import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { StudyCornerPage } from './pages/StudyCornerPage';
import { AnalyzerPage } from './pages/AnalyzerPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <StudyCornerPage /> },
      { path: 'analyzer', element: <AnalyzerPage /> },
    ],
  },
]);
