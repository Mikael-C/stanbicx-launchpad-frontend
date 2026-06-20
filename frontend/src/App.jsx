import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import KillSwitchBanner from './components/KillSwitchBanner';
import { ToastProvider } from './components/Toast';
import { getKillSwitchStatus } from './services/api';

import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import BuyStablesPage from './pages/BuyStablesPage';
import LaunchpadPage from './pages/LaunchpadPage';
import MarketplacePage from './pages/MarketplacePage';
import ReferralPage from './pages/ReferralPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import JailbreakDashboardPage from './pages/JailbreakDashboardPage';
import VerificationPage from './pages/VerificationPage';
import AIChatPage from './pages/AIChatPage';
import SecurityDemoPage from './pages/SecurityDemoPage';
import EventsPage from './pages/EventsPage';

export default function App() {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const checkKillSwitch = async () => {
      try {
        const result = await getKillSwitchStatus();
        setIsPaused(result?.isPaused || false);
      } catch {
        // Silently ignore - kill switch check is non-critical
      }
    };

    checkKillSwitch();
    const interval = setInterval(checkKillSwitch, 5000); // 5s for responsive demo
    return () => clearInterval(interval);
  }, []);

  return (
    <ToastProvider>
      <div className="app">
        <KillSwitchBanner isPaused={isPaused} />
        <Navbar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<DashboardPage isPaused={isPaused} />} />
            <Route path="/buy-stables" element={<BuyStablesPage />} />
            <Route path="/launchpad" element={<LaunchpadPage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/referrals" element={<ReferralPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/jailbreak" element={<JailbreakDashboardPage />} />
            <Route path="/verification" element={<VerificationPage />} />
            <Route path="/ai-chat" element={<AIChatPage />} />
            <Route path="/security-demo" element={<SecurityDemoPage />} />
            <Route path="/events" element={<EventsPage />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
