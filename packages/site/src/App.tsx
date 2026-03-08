import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import SkillPage from './pages/SkillPage';
import SharePage from './pages/SharePage';
import Docs from './pages/Docs';
import PackPage from './pages/PackPage';
import ClaimPage from './pages/ClaimPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/s/:token" element={<SkillPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/p/:token" element={<PackPage />} />
        <Route path="/claim" element={<ClaimPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
