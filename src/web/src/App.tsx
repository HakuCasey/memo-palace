import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Memory from './pages/Memory';
import Collection from './pages/Collection';
import Observation from './pages/Observation';
import Evolution from './pages/Evolution';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="memory" element={<Memory />} />
        <Route path="collection" element={<Collection />} />
        <Route path="observation" element={<Observation />} />
        <Route path="evolution" element={<Evolution />} />
      </Route>
    </Routes>
  );
}
