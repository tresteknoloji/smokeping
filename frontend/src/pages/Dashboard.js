import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, API, BACKEND_URL } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  Activity, Server, Globe, AlertTriangle, RefreshCw, Clock,
  TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

const Dashboard = () => {
  const { token } = useAuth();
  const [agents, setAgents] = useState([]);
  const [targets, setTargets] = useState([]);
  const [pingResults, setPingResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("1");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterTarget, setFilterTarget] = useState("all");
  const wsRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      console.log('Dashboard fetching for timeRange:', timeRange);
      const [agentsRes, targetsRes, pingRes] = await Promise.all([
        axios.get(`${API}/agents`, { headers }),
        axios.get(`${API}/targets`, { headers }),
        axios.get(`${API}/ping-results?hours=${timeRange}`, { headers })
      ]);
      
      console.log('Dashboard received ping results:', pingRes.data.length);
      setAgents(agentsRes.data);
      setTargets(targetsRes.data);
      setPingResults(pingRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [token, timeRange]);

  // Fetch data when timeRange changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);
    
  // WebSocket connection (only once)
  useEffect(() => {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/api/ws/frontend`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ping_result") {
        setPingResults(prev => [data.data, ...prev.slice(0, 9999)]);
      }
    };
    
    wsRef.current = ws;
    return () => ws?.close();
  }, []);

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
          timestamp: uniqueKey 
        };
      }
      if (result.latency_ms !== null) {
        grouped[uniqueKey].values.push(result.latency_ms);
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
        max: g.values.length > 0 ? Math.round(Math.max(...g.values) * 100) / 100 : null
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-maxPoints);
  };

  // Calculate statistics for agent-target
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
    const loss = (lossCount / totalResults.length) * 100;
    
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
            <p className="text-blue-400">
              Avg: <span className="font-mono font-bold">{data.latency?.toFixed(2) || 'N/A'}</span> ms
            </p>
            {data.min !== null && (
              <p className="text-green-400">
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

  // Generate all agent-target combinations with filters
  const combinations = [];
  targets.forEach(target => {
    if (!target.enabled) return;
    if (filterTarget !== "all" && target.id !== filterTarget) return;
    agents.forEach(agent => {
      if (filterAgent !== "all" && agent.id !== filterAgent) return;
      combinations.push({ agent, target });
    });
  });

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
          <p className="text-muted-foreground text-sm mt-1">
            {agents.filter(a => a.status === 'online').length}/{agents.length} agents online • {targets.length} targets
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Agent Filter */}
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-[140px]" data-testid="agent-filter-select">
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
            <SelectTrigger className="w-[140px]" data-testid="target-filter-select">
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
          {/* Time Range */}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px]" data-testid="time-range-select">
              <Clock className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Son 1 saat</SelectItem>
              <SelectItem value="6">Son 6 saat</SelectItem>
              <SelectItem value="24">Son 24 saat</SelectItem>
              <SelectItem value="72">Son 3 gün</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchData} variant="outline" className="gap-2" data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4" />
            Yenile
          </Button>
        </div>
      </div>

      {/* Graphs Grid */}
      {combinations.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {combinations.map(({ agent, target }) => {
            const chartData = getChartData(agent.id, target.id);
            const stats = getStats(agent.id, target.id);
            const isOnline = agent.status === 'online';
            
            return (
              <Card 
                key={`${agent.id}-${target.id}`} 
                className="glass-card"
                data-testid={`graph-${agent.id}-${target.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="font-medium text-foreground">{agent.name}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-cyan-500 font-medium">{target.name || target.hostname}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{target.hostname}</p>
                    </div>
                    {stats.current !== null && (
                      <div className="text-right">
                        <p className="text-2xl font-mono font-bold text-foreground">
                          {stats.current}
                          <span className="text-sm text-muted-foreground ml-1">ms</span>
                        </p>
                        {stats.loss > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {stats.loss}% loss
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Chart */}
                  <div className="h-[200px] mb-4">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id={`gradient-${agent.id}-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4}/>
                              <stop offset="50%" stopColor="#22c55e" stopOpacity={0.15}/>
                              <stop offset="100%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id={`line-gradient-${agent.id}-${target.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4ade80"/>
                              <stop offset="100%" stopColor="#22c55e"/>
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
                              label={{ value: 'avg', fontSize: 9, fill: '#3b82f6', position: 'right' }}
                            />
                          )}
                          <Area
                            type="monotone"
                            dataKey="latency"
                            stroke="#22c55e"
                            strokeWidth={2}
                            fill={`url(#gradient-${agent.id}-${target.id})`}
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
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Min</p>
                      <p className="text-sm font-mono font-semibold text-green-500">
                        {stats.min !== null ? `${stats.min}ms` : '--'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg</p>
                      <p className="text-sm font-mono font-semibold text-blue-500">
                        {stats.avg !== null ? `${stats.avg}ms` : '--'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">95th</p>
                      <p className="text-sm font-mono font-semibold text-yellow-500">
                        {stats.p95 !== null ? `${stats.p95}ms` : '--'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Max</p>
                      <p className="text-sm font-mono font-semibold text-red-500">
                        {stats.max !== null ? `${stats.max}ms` : '--'}
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
            <div className="text-center">
              <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Monitoring Data</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Add agents and targets to start monitoring. Each agent will ping all targets and display results here.
              </p>
              <div className="flex justify-center gap-3 mt-6">
                <Button variant="outline" onClick={() => window.location.href = '/agents'}>
                  <Server className="w-4 h-4 mr-2" />
                  Add Agent
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/targets'}>
                  <Globe className="w-4 h-4 mr-2" />
                  Add Target
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
