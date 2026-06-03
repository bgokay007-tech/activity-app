import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';

function App() {
  const token = useSelector(state => state.auth.token);

  return (
    <Routes>
      <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/home" />} />
      <Route path="/register" element={!token ? <RegisterPage /> : <Navigate to="/home" />} />
      <Route path="/home" element={token ? <HomePage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={token ? "/home" : "/login"} />} />
    </Routes>
  );
}

export default App;