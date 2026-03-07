import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import SkillPage from './pages/SkillPage';
import SharePage from './pages/SharePage';
import Docs from './pages/Docs';

function App() {
  return (
    <div className="min-h-screen bg-white">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/s/:token" element={<SkillPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/docs" element={<Docs />} />
      </Routes>
    </div>
  );
}

export default App;
