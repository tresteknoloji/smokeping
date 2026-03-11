import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
import {
  Activity, Server, Globe, AlertTriangle, Wifi, WifiOff,
  Clock, TrendingUp, RefreshCw, ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from "recharts";

const API = `${BACKEND_URL}/api`;

const PublicStatus = () => {
  const [data, setData] = useState({ agents: [], targets: [], latest_results: [] });
  const [pingResults, setPingResults] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedTarget, setSelectedTarget] = useState("all");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, pingRes, alertsRes] = await Promise.all([
        axios.get(`${API}/public/status`),
        axios.get(`${API}/public/ping-results?hours=24`),
        axios.get(`${API}/public/alerts?limit=20`)
      ]);
      
      setData(statusRes.data);
      setPingResults(pingRes.data);
      setAlerts(alertsRes.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filter and process chart data
  const getChartData = () => {
    let filtered = pingResults;
    
    if (selectedAgent !== "all") {
      filtered = filtered.filter(r => r.agent_id === selectedAgent);
    }
    if (selectedTarget !== "all") {
      filtered = filtered.filter(r => r.target_id === selectedTarget);
    }
    
    // Group by timestamp
    const grouped = {};
    filtered.forEach(result => {
      const time = new Date(result.timestamp);
      const key = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
      
      if (!grouped[key]) {
        grouped[key] = { time: key, latency: [], loss: [] };
      }
      if (result.latency_ms !== null) {
        grouped[key].latency.push(result.latency_ms);
      }
      grouped[key].loss.push(result.packet_loss || 0);
    });
    
    return Object.values(grouped)
      .map(g => ({
        time: g.time,
        latency: g.latency.length > 0 
          ? Math.round(g.latency.reduce((a, b) => a + b, 0) / g.latency.length * 10) / 10 
          : null,
        loss: g.loss.length > 0 
          ? Math.round(g.loss.reduce((a, b) => a + b, 0) / g.loss.length * 10) / 10 
          : 0
      }))
      .slice(-50)
      .reverse();
  };

  const chartData = getChartData();

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="label font-medium mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="value">{entry.value?.toFixed(1) || 'N/A'}</span>
              {entry.name === 'Latency' ? 'ms' : '%'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Calculate stats
  const onlineAgents = data.agents.filter(a => a.status === 'online').length;
  const avgLatency = pingResults.length > 0 && pingResults.some(r => r.latency_ms)
    ? Math.round(pingResults.filter(r => r.latency_ms).reduce((a, b) => a + b.latency_ms, 0) / pingResults.filter(r => r.latency_ms).length)
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="public-status-page">
      {/* Header */}
      <header className="public-header">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Activity className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground tracking-tight">Network Status</h1>
              <p className="text-xs text-muted-foreground">Public Monitoring Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
            <Button
              onClick={fetchData}
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="refresh-public-btn"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Agents Online</p>
                  <p className="text-3xl font-mono font-bold text-foreground mt-1">
                    {onlineAgents}/{data.agents.length}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <Server className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Targets</p>
                  <p className="text-3xl font-mono font-bold text-foreground mt-1">{data.targets.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-cyan-500/10">
                  <Globe className="w-6 h-6 text-cyan-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Alerts</p>
                  <p className={`text-3xl font-mono font-bold mt-1 ${alerts.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {alerts.length}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${alerts.length > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                  <AlertTriangle className={`w-6 h-6 ${alerts.length > 0 ? 'text-red-400' : 'text-green-400'}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Latency</p>
                  <p className="text-3xl font-mono font-bold text-foreground mt-1">
                    {avgLatency || '--'}
                    <span className="text-lg text-muted-foreground">ms</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg font-semibold text-foreground">Latency (Last 24 Hours)</CardTitle>
              <div className="flex gap-2">
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-[150px] bg-secondary border-border">
                    <SelectValue placeholder="All Agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {data.agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger className="w-[150px] bg-secondary border-border">
                    <SelectValue placeholder="All Targets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Targets</SelectItem>
                    {data.targets.map(target => (
                      <SelectItem key={target.id} value={target.id}>{target.name || target.hostname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="latencyGradientPublic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748b" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}ms`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="latency"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#latencyGradientPublic)"
                      name="Latency"
                      dot={false}
                      activeDot={{ r: 6, fill: '#3b82f6' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No data available</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bottom Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Agents */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-foreground">Monitoring Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.agents.length > 0 ? (
                  data.agents.map(agent => (
                    <div key={agent.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`status-dot ${agent.status === 'online' ? 'online' : 'offline'}`} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.description || 'No description'}</p>
                        </div>
                      </div>
                      <Badge 
                        variant={agent.status === 'online' ? 'default' : 'destructive'}
                        className={agent.status === 'online' ? 'badge-success' : 'badge-danger'}
                      >
                        {agent.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No agents configured</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Alerts */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-foreground">Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.length > 0 ? (
                  alerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className={`alert-item ${alert.severity}`}>
                      <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                        alert.severity === 'critical' ? 'text-red-400' :
                        alert.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {alert.agent_name && `${alert.agent_name} • `}
                          {new Date(alert.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                      All Systems Operational
                    </div>
                    <p className="text-sm">No active alerts</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-4 md:p-8 border-t border-white/5">
        <div className="text-center text-sm text-muted-foreground">
          <p>NetPing • Real-time Network Monitoring</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicStatus;
