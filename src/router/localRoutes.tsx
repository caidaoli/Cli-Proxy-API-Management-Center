import { Navigate } from 'react-router-dom';
import { MonitorPage } from '@/pages/MonitorPage';
import { OAuthPage } from '@/pages/OAuthPage';

export const localRoutes = [
  { path: '/oauth', element: <OAuthPage /> },
  { path: '/usage', element: <Navigate to="/monitor" replace /> },
  { path: '/monitor', element: <MonitorPage /> },
];
