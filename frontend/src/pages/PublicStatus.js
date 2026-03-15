import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  Activity, Server, Globe, AlertTriangle, RefreshCw, Sun, Moon, Clock, Calendar
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Scatter, ComposedChart
} from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Time range presets
const TIME_PRESETS = [
  { label: "1 Saat", value: "1", hours: 1 },
  { label: "3 Saat", value: "3", hours: 3 },
  { label: "6 Saat", value: "6", hours: 6 },
  { label: "12 Saat", value: "12", hours: 12 },
  { label: "1 Gün", value: "24", hours: 24 },
  { label: "3 Gün", value: "72", hours: 72 },
  { label: "7 Gün", value: "168", hours: 168 },
];

const PublicStatus = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState([]);
  const [targets, setTargets] = useState([]);
  const [pingResults, setPingResults] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [theme, setTheme] = useState(() => localStorage.getItem("public-theme") || "dark");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterTarget, setFilterTarget] = useState("all");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  
  // Get time range from URL or default to 2 hours
  const timeRange = searchParams.get("range") || "2";
  const customFromParam = searchParams.get("from");
  const customToParam = searchParams.get("to");
  
  const setTimeRange = (value) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("range", value);
    newParams.delete("from");
    newParams.delete("to");
    setSearchParams(newParams);
    setShowCustomRange(false);
  };
  
  const applyCustomRange = () => {
    if (customFrom && customTo) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("range", "custom");
      newParams.set("from", customFrom.toISOString());
      newParams.set("to", customTo.toISOString());
      setSearchParams(newParams);
      setShowCustomRange(false);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("public-theme", theme);
  }, [theme]);

  const fetchData = useCallback(async () => {
    try {
      let pingUrl = `${API}/public/ping-results`;
      
      if (timeRange === "custom" && customFromParam && customToParam) {
        pingUrl += `?from=${customFromParam}&to=${customToParam}`;
      } else {
        pingUrl += `?hours=${timeRange}`;
      }
      
      const [statusRes, pingRes, alertsRes] = await Promise.all([
        axios.get(`${API}/public/status`),
        axios.get(pingUrl),
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
  }, [timeRange, customFromParam, customToParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Get chart data for specific agent-target combination
  const getChartData = (agentId, targetId) => {
    const filtered = pingResults
      .filter(r => r.agent_id === agentId && r.target_id === targetId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (filtered.length === 0) return [];
    
    // Determine grouping interval based on data span
    const firstTime = new Date(filtered[0].timestamp).getTime();
    const lastTime = new Date(filtered[filtered.length - 1].timestamp).getTime();
    const spanHours = (lastTime - firstTime) / (1000 * 60 * 60);
    
    // Group interval: 1 min for <3h, 5 min for <12h, 15 min for <48h, 30 min for rest
    let intervalMinutes = 1;
    if (spanHours > 48) intervalMinutes = 30;
    else if (spanHours > 12) intervalMinutes = 15;
    else if (spanHours > 3) intervalMinutes = 5;
    
    const grouped = {};
    filtered.forEach(result => {
      const time = new Date(result.timestamp);
      // Round to nearest interval
      const roundedMinutes = Math.floor(time.getMinutes() / intervalMinutes) * intervalMinutes;
      const groupTime = new Date(time);
      groupTime.setMinutes(roundedMinutes, 0, 0);
      
      const uniqueKey = groupTime.getTime();
      const timeKey = `${groupTime.getHours().toString().padStart(2, '0')}:${groupTime.getMinutes().toString().padStart(2, '0')}`;
      
      if (!grouped[uniqueKey]) {
        grouped[uniqueKey] = { 
          time: timeKey, 
          values: [], 
          losses: [],
          timestamp: uniqueKey 
        };
      }
      if (result.latency_ms !== null) {
        grouped[uniqueKey].values.push(result.latency_ms);
      }
      if (result.packet_loss !== undefined) {
        grouped[uniqueKey].losses.push(result.packet_loss);
      }
    });
    
    const maxPoints = 120;
    
    return Object.values(grouped)
      .map(g => ({
        time: g.time,
        timestamp: g.timestamp,
        latency: g.values.length > 0 
          ? Math.round(g.values.reduce((a, b) => a + b, 0) / g.values.length * 100) / 100
          : null,
        min: g.values.length > 0 ? Math.round(Math.min(...g.values) * 100) / 100 : null,
        max: g.values.length > 0 ? Math.round(Math.max(...g.values) * 100) / 100 : null,
        loss: g.losses.length > 0 ? Math.max(...g.losses) : 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-maxPoints);
  };

  // Calculate statistics
  const getStats = (agentId, targetId) => {
    const data = pingResults.filter(r => 
      r.agent_id === agentId && r.target_id === targetId && r.latency_ms !== null
    );
    
    if (data.length === 0) {
      return { avg: null, min: null, max: null, p95: null, current: null, loss: 0 };
    }
    
    // Sort by timestamp to get the latest value
    const sortedByTime = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const latestValue = sortedByTime[sortedByTime.length - 1]?.latency_ms;
    
    // Sort by latency for statistics
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
      current: latestValue ? Math.round(latestValue * 100) / 100 : null,
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
            {data.loss > 0 && (
              <p className="text-orange-500 font-bold">
                Loss: <span className="font-mono">{data.loss}%</span>
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Generate combinations - sorted by TARGET first, then agent
  // Apply filters
  const combinations = [];
  targets.forEach(target => {
    if (filterTarget !== "all" && target.id !== filterTarget) return;
    agents.forEach(agent => {
      if (filterAgent !== "all" && agent.id !== filterAgent) return;
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-[hsl(var(--foreground))] tracking-tight">
                NetPing <span className="text-muted-foreground font-normal">- Netlen Latency Monitor</span>
              </h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Public Monitor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Agent Filter */}
            <Select value={filterAgent} onValueChange={setFilterAgent}>
              <SelectTrigger className="w-[140px]">
                <Server className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Kaynak" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kaynaklar</SelectItem>
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Target Filter */}
            <Select value={filterTarget} onValueChange={setFilterTarget}>
              <SelectTrigger className="w-[140px]">
                <Globe className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Hedef" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Hedefler</SelectItem>
                {targets.map(target => (
                  <SelectItem key={target.id} value={target.id}>{target.name || target.hostname}</SelectItem>
                ))}
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
              <span className="hidden sm:inline">Yenile</span>
            </Button>
          </div>
        </div>
        
        {/* Time Range Selector - Grafana Style - Right Aligned */}
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[hsl(var(--border))] flex-wrap">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-1">
            {TIME_PRESETS.map(preset => (
              <Button
                key={preset.value}
                variant={timeRange === preset.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTimeRange(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
            
            {/* Custom Range Button */}
            <Popover open={showCustomRange} onOpenChange={setShowCustomRange}>
              <PopoverTrigger asChild>
                <Button
                  variant={timeRange === "custom" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Calendar className="w-3 h-3" />
                  {timeRange === "custom" && customFromParam && customToParam ? (
                    <span>
                      {new Date(customFromParam).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })} - {new Date(customToParam).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  ) : (
                    "Özel Aralık"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="end">
                <div className="flex gap-6">
                  {/* From Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Başlangıç</label>
                    <CalendarComponent
                      mode="single"
                      selected={customFrom}
                      onSelect={(date) => {
                        if (date) {
                          const newDate = new Date(date);
                          if (customFrom) {
                            newDate.setHours(customFrom.getHours(), customFrom.getMinutes());
                          } else {
                            newDate.setHours(0, 0, 0, 0);
                          }
                          setCustomFrom(newDate);
                        }
                      }}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                    <div className="flex gap-2 items-center">
                      <label className="text-sm">Saat:</label>
                      <input 
                        type="time" 
                        className="bg-background border border-border rounded px-2 py-1 text-sm"
                        value={customFrom ? `${customFrom.getHours().toString().padStart(2,'0')}:${customFrom.getMinutes().toString().padStart(2,'0')}` : '00:00'}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':');
                          const newDate = customFrom ? new Date(customFrom) : new Date();
                          newDate.setHours(parseInt(hours), parseInt(minutes));
                          setCustomFrom(newDate);
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* To Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bitiş</label>
                    <CalendarComponent
                      mode="single"
                      selected={customTo}
                      onSelect={(date) => {
                        if (date) {
                          const newDate = new Date(date);
                          if (customTo) {
                            newDate.setHours(customTo.getHours(), customTo.getMinutes());
                          } else {
                            newDate.setHours(23, 59, 59, 999);
                          }
                          setCustomTo(newDate);
                        }
                      }}
                      disabled={(date) => date > new Date() || (customFrom && date < customFrom)}
                    />
                    <div className="flex gap-2 items-center">
                      <label className="text-sm">Saat:</label>
                      <input 
                        type="time" 
                        className="bg-background border border-border rounded px-2 py-1 text-sm"
                        value={customTo ? `${customTo.getHours().toString().padStart(2,'0')}:${customTo.getMinutes().toString().padStart(2,'0')}` : '23:59'}
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(':');
                          const newDate = customTo ? new Date(customTo) : new Date();
                          newDate.setHours(parseInt(hours), parseInt(minutes));
                          setCustomTo(newDate);
                        }}
                      />
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={applyCustomRange} 
                  disabled={!customFrom || !customTo}
                  className="w-full mt-4"
                >
                  Uygula
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 md:p-6 space-y-6">
        {/* Graphs Grid - 3 columns on large screens */}
        {combinations.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {combinations.map(({ agent, target }) => {
              const chartData = getChartData(agent.id, target.id);
              const stats = getStats(agent.id, target.id);
              const isOnline = agent.status === 'online';
              const LATENCY_THRESHOLD = 100; // ms
              const isHealthy = stats.current === null || stats.current < LATENCY_THRESHOLD;
              
              return (
                <Card 
                  key={`${agent.id}-${target.id}`} 
                  className="glass-card"
                >
                  <CardHeader className="pb-1 pt-3 px-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="font-medium text-sm text-foreground">{agent.name}</span>
                          <span className="text-muted-foreground text-xs">→</span>
                          <span className="text-cyan-500 font-medium text-sm">{target.name || target.hostname}</span>
                        </div>
                      </div>
                      {stats.current !== null && (
                        <div className="text-right">
                          <p className={`text-lg font-mono font-bold ${isHealthy ? 'text-foreground' : 'text-red-500'}`}>
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
                          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                              tickFormatter={(v) => v?.toFixed(2)}
                              width={45}
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
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                // Only show red dot for actual packet loss > 0
                                if (payload && payload.loss && payload.loss > 0) {
                                  return (
                                    <circle 
                                      cx={cx} 
                                      cy={cy} 
                                      r={5} 
                                      fill="#ef4444" 
                                      stroke="#fff" 
                                      strokeWidth={2}
                                    />
                                  );
                                }
                                return null;
                              }}
                              activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                              connectNulls={true}
                              isAnimationActive={false}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Veri bekleniyor...</p>
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

        {/* Active Alerts - Only show threshold and packet loss alerts */}
        {(() => {
          const filteredAlerts = alerts.filter(alert => 
            alert.type === 'threshold' || 
            alert.type === 'packet_loss' || 
            alert.type === 'latency'
          );
          return filteredAlerts.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Aktif Uyarılar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredAlerts.slice(0, 5).map(alert => (
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
          );
        })()}
      </main>

      {/* Footer */}
      <footer className="p-4 md:p-6 border-t border-[hsl(var(--border))]">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>NetPing Network Monitor</p>
          <p>Last updated: {lastUpdate.toLocaleTimeString()}</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicStatus;
