import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, API, BACKEND_URL } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  Activity, Server, Globe, AlertTriangle, Wifi, WifiOff,
  Clock, TrendingUp, RefreshCw, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from "recharts";

const Dashboard = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState({ total_agents: 0, online_agents: 0, total_targets: 0, active_alerts: 0 });
  const [agents, setAgents] = useState([]);
  const [targets, setTargets] = useState([]);
  const [pingResults, setPingResults] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedTarget, setSelectedTarget] = useState("all");
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, agentsRes, targetsRes, pingRes, alertsRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`, { headers }),
        axios.get(`${API}/agents`, { headers }),
        axios.get(`${API}/targets`, { headers }),
        axios.get(`${API}/ping-results?hours=24`, { headers }),
        axios.get(`${API}/alerts?limit=10`, { headers })
      ]);
      
      setStats(statsRes.data);
      setAgents(agentsRes.data);
      setTargets(targetsRes.data);
      setPingResults(pingRes.data);
      setRecentAlerts(alertsRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    
    // WebSocket connection for real-time updates
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/api/ws/frontend`);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "ping_result") {
        setPingResults(prev => [data.data, ...prev.slice(0, 999)]);
      } else if (data.type === "alert") {
        setRecentAlerts(prev => [data.data, ...prev.slice(0, 9)]);
        toast.warning(data.data.message);
      } else if (data.type === "agent_status") {
        setAgents(prev => prev.map(a => 
          a.id === data.agent_id ? { ...a, status: data.status } : a
        ));
        fetchData(); // Refresh stats
      }
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    wsRef.current = ws;
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
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
    
    // Group by timestamp (every 30 seconds)
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
    
    // Average values
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time network monitoring overview</p>
        </div>
        <Button
          onClick={fetchData}
          variant="outline"
          className="gap-2"
          data-testid="refresh-btn"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card" data-testid="stat-agents">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Agents</p>
                <p className="text-3xl font-mono font-bold mt-1">
                  {stats.online_agents}/{stats.total_agents}
                </p>
                <p className="text-xs text-muted-foreground mt-1">online / total</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Server className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="stat-targets">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Targets</p>
                <p className="text-3xl font-mono font-bold mt-1">{stats.total_targets}</p>
                <p className="text-xs text-muted-foreground mt-1">monitored hosts</p>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10">
                <Globe className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="stat-alerts">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p className={`text-3xl font-mono font-bold mt-1 ${stats.active_alerts > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {stats.active_alerts}
                </p>
                <p className="text-xs text-muted-foreground mt-1">unresolved</p>
              </div>
              <div className={`p-3 rounded-lg ${stats.active_alerts > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                <AlertTriangle className={`w-6 h-6 ${stats.active_alerts > 0 ? 'text-red-400' : 'text-green-400'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="stat-uptime">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Latency</p>
                <p className="text-3xl font-mono font-bold mt-1">
                  {pingResults.length > 0 && pingResults.some(r => r.latency_ms)
                    ? Math.round(pingResults.filter(r => r.latency_ms).reduce((a, b) => a + b.latency_ms, 0) / pingResults.filter(r => r.latency_ms).length)
                    : '--'
                  }
                  <span className="text-lg text-muted-foreground">ms</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">last 24h</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Chart */}
      <Card className="glass-card" data-testid="latency-chart">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-lg font-semibold">Latency Overview</CardTitle>
            <div className="flex gap-2">
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[150px]" data-testid="agent-filter">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                <SelectTrigger className="w-[150px]" data-testid="target-filter">
                  <SelectValue placeholder="All Targets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Targets</SelectItem>
                  {targets.map(target => (
                    <SelectItem key={target.id} value={target.id}>{target.name || target.hostname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#latencyGradient)"
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
                  <p className="text-sm mt-1">Connect agents to start collecting metrics</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Agents Status */}
        <Card className="glass-card" data-testid="agents-status">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Agents Status</CardTitle>
              <a href="/agents" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agents.length > 0 ? (
                agents.slice(0, 5).map(agent => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-[hsl(var(--secondary))] rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`status-dot ${agent.status === 'online' ? 'online' : 'offline'}`} />
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{agent.ip_address || 'No IP'}</p>
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

        {/* Recent Alerts */}
        <Card className="glass-card" data-testid="recent-alerts">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent Alerts</CardTitle>
              <a href="/alerts" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentAlerts.length > 0 ? (
                recentAlerts.slice(0, 5).map(alert => (
                  <div key={alert.id} className={`alert-item ${alert.severity}`}>
                    <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                      alert.severity === 'critical' ? 'text-red-400' :
                      alert.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {alert.agent_name && `${alert.agent_name} • `}
                        {new Date(alert.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No recent alerts</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
