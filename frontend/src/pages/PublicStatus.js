import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Activity, Server, Globe, AlertTriangle, Clock, RefreshCw, Sun, Moon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PublicStatus = () => {
  const [agents, setAgents] = useState([]);
  const [targets, setTargets] = useState([]);
  const [pingResults, setPingResults] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [timeRange, setTimeRange] = useState("1");
  const [theme, setTheme] = useState(() => localStorage.getItem("public-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("public-theme", theme);
  }, [theme]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, pingRes, alertsRes] = await Promise.all([
        axios.get(`${API}/public/status`),
        axios.get(`${API}/public/ping-results?hours=${timeRange}`),
        axios.get(`${API}/public/alerts?limit=20`)
      ]);
      
      setAgents(statusRes.data.agents);
      setTargets(statusRes.data.targets);
      setPingResults(pingRes.data);
      setAlerts(alertsRes.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Get chart data for specific agent-target combination
  const getChartData = (agentId, targetId) => {
    const filtered = pingResults.filter(r => 
      r.agent_id === agentId && r.target_id === targetId
    );
    
    const grouped = {};
    filtered.forEach(result => {
      const time = new Date(result.timestamp);
      const key = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
      
      if (!grouped[key]) {
        grouped[key] = { time: key, values: [] };
      }
      if (result.latency_ms !== null) {
        grouped[key].values.push(result.latency_ms);
      }
    });
    
    return Object.values(grouped)
      .map(g => ({
        time: g.time,
        latency: g.values.length > 0 
          ? Math.round(g.values.reduce((a, b) => a + b, 0) / g.values.length * 100) / 100
          : null,
        min: g.values.length > 0 ? Math.min(...g.values) : null,
        max: g.values.length > 0 ? Math.max(...g.values) : null
      }))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-60);
  };

  // Calculate statistics
  const getStats = (agentId, targetId) => {
    const data = pingResults.filter(r => 
      r.agent_id === agentId && r.target_id === targetId && r.latency_ms !== null
    );
    
    if (data.length === 0) {
      return { avg: null, min: null, max: null, p95: null, current: null, loss: 0 };
    }
    
    const latencies = data.map(r => r.latency_ms).sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);
    const avg = sum / latencies.length;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Index] || latencies[latencies.length - 1];
    
    const totalResults = pingResults.filter(r => r.agent_id === agentId && r.target_id === targetId);
    const lossCount = totalResults.filter(r => r.latency_ms === null || r.status !== 'success').length;
    const loss = totalResults.length > 0 ? (lossCount / totalResults.length) * 100 : 0;
    
    return {
      avg: Math.round(avg * 100) / 100,
      min: Math.round(Math.min(...latencies) * 100) / 100,
      max: Math.round(Math.max(...latencies) * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      current: Math.round(latencies[latencies.length - 1] * 100) / 100,
      loss: Math.round(loss * 10) / 10
    };
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <p className="text-green-400">
              Avg: <span className="font-mono font-bold">{data.latency?.toFixed(2) || 'N/A'}</span> ms
            </p>
            {data.min !== null && (
              <p className="text-emerald-400">
                Min: <span className="font-mono">{data.min?.toFixed(2)}</span> ms
              </p>
            )}
            {data.max !== null && (
              <p className="text-red-400">
                Max: <span className="font-mono">{data.max?.toFixed(2)}</span> ms
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Generate combinations - sorted by TARGET first, then agent
  const combinations = [];
  targets.forEach(target => {
    agents.forEach(agent => {
      combinations.push({ agent, target });
    });
  });

  const onlineAgents = agents.filter(a => a.status === 'online').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]" data-testid="public-status-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[hsl(var(--sidebar-bg))] border-b border-[hsl(var(--border))] px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-[hsl(var(--foreground))] tracking-tight">NetPing</h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {onlineAgents}/{agents.length} agents • {targets.length} targets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[130px]">
                <Clock className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 1 hour</SelectItem>
                <SelectItem value="6">Last 6 hours</SelectItem>
                <SelectItem value="24">Last 24 hours</SelectItem>
                <SelectItem value="72">Last 3 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button onClick={fetchData} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* Graphs Grid - 3 columns on large screens */}
        {combinations.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {combinations.map(({ agent, target }) => {
              const chartData = getChartData(agent.id, target.id);
              const stats = getStats(agent.id, target.id);
              const isOnline = agent.status === 'online';
              
              return (
                <Card 
                  key={`${agent.id}-${target.id}`} 
                  className="glass-card"
                >
                  <CardHeader className="pb-1 pt-3 px-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="font-medium text-sm text-foreground">{agent.name}</span>
                          <span className="text-muted-foreground text-xs">→</span>
                          <span className="text-cyan-500 font-medium text-sm">{target.name || target.hostname}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">{target.hostname}</p>
                      </div>
                      {stats.current !== null && (
                        <div className="text-right">
                          <p className="text-lg font-mono font-bold text-foreground">
                            {stats.current}
                            <span className="text-xs text-muted-foreground ml-0.5">ms</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {/* Chart */}
                    <div className="h-[120px] mb-3">
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                            <defs>
                              <linearGradient id={`pub-gradient-${agent.id}-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4}/>
                                <stop offset="50%" stopColor="#22c55e" stopOpacity={0.15}/>
                                <stop offset="100%" stopColor="#22c55e" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid 
                              strokeDasharray="1 3" 
                              stroke="hsl(var(--border))" 
                              strokeOpacity={0.3}
                              vertical={false}
                            />
                            <XAxis 
                              dataKey="time" 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              interval="preserveStartEnd"
                              minTickGap={30}
                            />
                            <YAxis 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={10}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `${v}`}
                              width={40}
                              domain={['dataMin - 1', 'dataMax + 1']}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {stats.avg && (
                              <ReferenceLine 
                                y={stats.avg} 
                                stroke="#3b82f6" 
                                strokeDasharray="4 4" 
                                strokeOpacity={0.5}
                              />
                            )}
                            <Area
                              type="monotone"
                              dataKey="latency"
                              stroke="#22c55e"
                              strokeWidth={2}
                              fill={`url(#pub-gradient-${agent.id}-${target.id})`}
                              dot={chartData.length < 10 ? { r: 3, fill: '#22c55e' } : false}
                              activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                              connectNulls={true}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Waiting for data...</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Stats Legend */}
                    <div className="grid grid-cols-4 gap-1 pt-2 border-t border-border">
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Min</p>
                        <p className="text-xs font-mono font-semibold text-green-500">
                          {stats.min !== null ? `${stats.min}` : '--'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Avg</p>
                        <p className="text-xs font-mono font-semibold text-blue-500">
                          {stats.avg !== null ? `${stats.avg}` : '--'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">95th</p>
                        <p className="text-xs font-mono font-semibold text-yellow-500">
                          {stats.p95 !== null ? `${stats.p95}` : '--'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground uppercase">Max</p>
                        <p className="text-xs font-mono font-semibold text-red-500">
                          {stats.max !== null ? `${stats.max}` : '--'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-12">
              <div className="text-center text-muted-foreground">
                <Activity className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold mb-2">No Monitoring Data</h3>
                <p>Waiting for agents and targets to be configured.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Alerts */}
        {alerts.length > 0 && (
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.slice(0, 5).map(alert => (
                  <div key={alert.id} className={`alert-item ${alert.severity}`}>
                    <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                      alert.severity === 'critical' ? 'text-red-400' :
                      alert.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {alert.agent_name && `${alert.agent_name} • `}
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-4 md:p-8 border-t border-[hsl(var(--border))]">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>NetPing Network Monitor</p>
          <p>Last updated: {lastUpdate.toLocaleTimeString()}</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicStatus;
