import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { 
  Activity, Server, Globe, AlertTriangle, Settings, 
  LogOut, Menu, X, Plus, Trash2, Eye, Copy, Check,
  Wifi, WifiOff, Clock, TrendingUp, Bell, Shield,
  ChevronRight, RefreshCw, Download, ExternalLink, Zap
} from "lucide-react";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Agents from "@/pages/Agents";
import Targets from "@/pages/Targets";
import Alerts from "@/pages/Alerts";
import SettingsPage from "@/pages/Settings";
import PublicStatus from "@/pages/PublicStatus";
import InstantPing from "@/pages/InstantPing";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
        } catch (error) {
          localStorage.removeItem("token");
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    verifyToken();
  }, [token]);

  const login = async (username, password) => {
    const response = await axios.post(`${API}/auth/login`, { username, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const register = async (username, password) => {
    const response = await axios.post(`${API}/auth/register`, { username, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="spinner"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Sidebar Component
const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const links = [
    { path: "/dashboard", icon: Activity, label: "Dashboard" },
    { path: "/instant-ping", icon: Zap, label: "Instant Ping" },
    { path: "/agents", icon: Server, label: "Agents" },
    { path: "/targets", icon: Globe, label: "Targets" },
    { path: "/alerts", icon: AlertTriangle, label: "Alerts" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full z-50 w-64
        bg-[#0a0f1a] border-r border-white/8
        transform transition-transform duration-300 ease-in-out
        md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white tracking-tight">SmokePing</h1>
                <p className="text-xs text-slate-400">Network Monitor</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {links.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setIsOpen(false)}
                className={`sidebar-link ${location.pathname === path ? 'active' : ''}`}
                data-testid={`nav-${label.toLowerCase()}`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            ))}
            
            {/* Public Link */}
            <a
              href="/public"
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-link mt-4"
              data-testid="nav-public"
            >
              <ExternalLink className="w-5 h-5" />
              <span>Public Status</span>
            </a>
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-white/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {user?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-slate-300">{user?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                data-testid="logout-btn"
              >
                <LogOut className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

// Main Layout
const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#020617]">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      {/* Main content */}
      <div className="md:ml-64">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-30 bg-[#0a0f1a] border-b border-white/8 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-white/5 rounded-lg"
              data-testid="mobile-menu-btn"
            >
              <Menu className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-500" />
              <span className="font-bold text-white">SmokePing</span>
            </div>
            <div className="w-10" />
          </div>
        </header>
        
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster 
          position="top-right" 
          theme="dark"
          toastOptions={{
            style: {
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f8fafc'
            }
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/public" element={<PublicStatus />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Agents />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/targets"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Targets />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Alerts />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instant-ping"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <InstantPing />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <SettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
export { API, BACKEND_URL };
