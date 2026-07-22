import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import CategoryPage from './pages/CategoryPage';
import SubCategoryPage from './pages/SubCategoryPage';
import ProfilePage from './pages/ProfilePage';
import MessagesPage from './pages/MessagesPage';
import CourtsPage from './pages/CourtsPage';
import VenuesPage from './pages/VenuesPage';
import AdminPage from './pages/AdminPage';
import ArchivePage from './pages/ArchivePage';
import MusicPage from './pages/MusicPage';
import CinemaPage from './pages/CinemaPage';
import TheaterPage from './pages/TheaterPage';
import ActivityFeedPage from './pages/ActivityFeedPage';
import BusinessHomePage from './pages/BusinessHomePage';
import FriendFindingPage from './pages/FriendFindingPage';
import ChessPage from './pages/games/ChessPage';
import TavlaPage from './pages/games/TavlaPage';
import OkeyPage from './pages/games/OkeyPage';
import BatakPage from './pages/games/BatakPage';
import AiRefereePage from './pages/games/AiRefereePage';
import MyReservationsPage from './pages/MyReservationsPage';

function App() {
  const token = useSelector(state => state.auth.token);
  const lang  = useSelector(state => state.lang.lang);
  const { i18n } = useTranslation();

  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang]);

  return (
    <Routes>
      <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/home" />} />
      <Route path="/register" element={!token ? <RegisterPage /> : <Navigate to="/home" />} />
      <Route path="/home" element={token ? <HomePage /> : <Navigate to="/login" />} />
      <Route path="/category/:category" element={token ? <CategoryPage /> : <Navigate to="/login" />} />
      <Route path="/category/:category/:sub" element={token ? <SubCategoryPage /> : <Navigate to="/login" />} />
      <Route path="/profile" element={token ? <ProfilePage /> : <Navigate to="/login" />} />
      <Route path="/profile/:userId" element={token ? <ProfilePage /> : <Navigate to="/login" />} />
      <Route path="/messages" element={token ? <MessagesPage /> : <Navigate to="/login" />} />
      <Route path="/messages/:userId" element={token ? <MessagesPage /> : <Navigate to="/login" />} />
      <Route path="/courts" element={token ? <CourtsPage /> : <Navigate to="/login" />} />
      <Route path="/venues" element={token ? <VenuesPage /> : <Navigate to="/login" />} />
      <Route path="/admin" element={token ? <AdminPage /> : <Navigate to="/login" />} />
      <Route path="/archive" element={token ? <ArchivePage /> : <Navigate to="/login" />} />
      <Route path="/music" element={token ? <MusicPage /> : <Navigate to="/login" />} />
      <Route path="/cinema" element={token ? <CinemaPage /> : <Navigate to="/login" />} />
      <Route path="/theater" element={token ? <TheaterPage /> : <Navigate to="/login" />} />
      <Route path="/activity" element={token ? <ActivityFeedPage /> : <Navigate to="/login" />} />
      <Route path="/business" element={token ? <BusinessHomePage /> : <Navigate to="/login" />} />
      <Route path="/friend-finding" element={token ? <FriendFindingPage /> : <Navigate to="/login" />} />
      <Route path="/games/chess" element={token ? <ChessPage /> : <Navigate to="/login" />} />
      <Route path="/games/tavla" element={token ? <TavlaPage /> : <Navigate to="/login" />} />
      <Route path="/games/okey" element={token ? <OkeyPage /> : <Navigate to="/login" />} />
      <Route path="/games/batak" element={token ? <BatakPage /> : <Navigate to="/login" />} />
      <Route path="/games/ai-referee" element={token ? <AiRefereePage /> : <Navigate to="/login" />} />
      <Route path="/reservations" element={token ? <MyReservationsPage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={token ? "/home" : "/login"} />} />
    </Routes>
  );
}

export default App;