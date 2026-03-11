import { useState, useEffect, useRef } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  Zap, Globe, Server, Clock, Check, X, Loader2, 
  ArrowRight, RefreshCw, Copy, TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const InstantPing = () => {
  const { token } = useAuth();
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [results, setResults] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [history, setHistory] = useState([]);
  const pollingRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Poll for results
  useEffect(() => {
    if (requestId && !completed) {
      const pollResults = async () => {
        try {
          const response = await axios.get(`${API}/instant-ping/${requestId}`, { headers });
          setResults(response.data.results);
          setCompleted(response.data.completed);
          
          if (response.data.completed) {
            // Add to history
            const avgLatency = response.data.results
              .filter(r => r.latency_ms !== null)
              .reduce((sum, r) => sum + r.latency_ms, 0) / 
              response.data.results.filter(r => r.latency_ms !== null).length || 0;
            
            setHistory(prev => [{
              hostname: response.data.results[0]?.hostname || hostname,
              timestamp: new Date().toLocaleTimeString(),
              results: response.data.results,
              avgLatency: avgLatency.toFixed(1)
            }, ...prev.slice(0, 9)]);
            
            setLoading(false);
            toast.success("Ping completed from all agents");
          }
        } catch (error) {
          console.error("Failed to fetch results:", error);
        }
      };

      pollingRef.current = setInterval(pollResults, 500);
      return () => clearInterval(pollingRef.current);
    }
  }, [requestId, completed]);

  const handlePing = async () => {
    if (!hostname.trim()) {
      toast.error("Please enter a hostname or IP address");
      return;
    }

    setLoading(true);
    setCompleted(false);
    setResults([]);

    try {
      const response = await axios.post(`${API}/instant-ping`, { hostname: hostname.trim() }, { headers });
      setRequestId(response.data.request_id);
      toast.info(`Pinging ${hostname} from ${response.data.agents_count} agents...`);
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to send ping request";
      toast.error(message);
      setLoading(false);
    }
  };

  const getStatusBadge = (result) => {
    if (result.status === "pending") {
      return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Pending</Badge>;
    }
    if (result.status === "success" && result.latency_ms !== null) {
      return <Badge className="badge-success">Success</Badge>;
    }
    if (result.status === "timeout") {
      return <Badge className="badge-warning">Timeout</Badge>;
    }
    return <Badge className="badge-danger">Error</Badge>;
  };

  const getLatencyColor = (latency) => {
    if (latency === null) return "text-muted-foreground";
    if (latency < 50) return "text-green-400";
    if (latency < 100) return "text-yellow-400";
    if (latency < 200) return "text-orange-400";
    return "text-red-400";
  };

  const copyResults = () => {
    const text = results.map(r => 
      `${r.agent_name}: ${r.latency_ms !== null ? `${r.latency_ms.toFixed(1)}ms` : 'N/A'} (${r.status})`
    ).join('\n');
    navigator.clipboard.writeText(text);
    toast.success("Results copied to clipboard");
  };

  return (
    <div className="space-y-6" data-testid="instant-ping-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Instant Ping</h1>
        <p className="text-muted-foreground text-sm mt-1">Test connectivity from all agents to any host</p>
      </div>

      {/* Ping Input */}
      <Card className="glass-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Ping Test
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter a hostname or IP address to ping from all connected agents simultaneously
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !loading && handlePing()}
                placeholder="e.g., 8.8.8.8 or google.com"
                className="bg-secondary border-border font-mono h-12 text-lg"
                disabled={loading}
                data-testid="instant-ping-input"
              />
            </div>
            <Button
              onClick={handlePing}
              disabled={loading || !hostname.trim()}
              className="h-12 px-8 bg-blue-600 hover:bg-blue-700 gap-2 text-lg font-medium"
              data-testid="instant-ping-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Pinging...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Ping
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {results.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                Results for <span className="font-mono text-cyan-400">{results[0]?.hostname}</span>
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyResults}
                  className="gap-1.5"
                  data-testid="copy-results-btn"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table className="data-table">
              <TableHeader>
                <TableRow className="border-b border-white/5 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Agent</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground text-right">Latency</TableHead>
                  <TableHead className="text-muted-foreground text-right">Packet Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <TableRow 
                    key={result.agent_id} 
                    className="border-b border-white/5"
                    data-testid={`ping-result-${result.agent_id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground font-medium">{result.agent_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(result)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-lg font-bold ${getLatencyColor(result.latency_ms)}`}>
                        {result.latency_ms !== null ? `${result.latency_ms.toFixed(1)}` : '--'}
                        <span className="text-sm text-muted-foreground ml-1">ms</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono ${result.packet_loss > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {result.packet_loss.toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Summary */}
            {completed && (
              <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Latency</p>
                  <p className="text-2xl font-mono font-bold text-foreground">
                    {(results.filter(r => r.latency_ms !== null).reduce((sum, r) => sum + r.latency_ms, 0) / 
                      results.filter(r => r.latency_ms !== null).length || 0).toFixed(1)}
                    <span className="text-sm text-muted-foreground ml-1">ms</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Min Latency</p>
                  <p className="text-2xl font-mono font-bold text-green-400">
                    {Math.min(...results.filter(r => r.latency_ms !== null).map(r => r.latency_ms)).toFixed(1) || '--'}
                    <span className="text-sm text-muted-foreground ml-1">ms</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Max Latency</p>
                  <p className="text-2xl font-mono font-bold text-red-400">
                    {Math.max(...results.filter(r => r.latency_ms !== null).map(r => r.latency_ms)).toFixed(1) || '--'}
                    <span className="text-sm text-muted-foreground ml-1">ms</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Success Rate</p>
                  <p className="text-2xl font-mono font-bold text-cyan-400">
                    {((results.filter(r => r.status === 'success').length / results.length) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Recent Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((item, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                  onClick={() => {
                    setHostname(item.hostname);
                    setResults(item.results);
                    setCompleted(true);
                  }}
                >
                  <div className="flex items-center gap-4">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span className="font-mono text-cyan-400">{item.hostname}</span>
                    <span className="text-muted-foreground text-sm">{item.timestamp}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {item.results.length} agents
                    </span>
                    <Badge variant="outline" className="font-mono">
                      avg {item.avgLatency}ms
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {results.length === 0 && !loading && (
        <Card className="glass-card">
          <CardContent className="p-12">
            <div className="text-center">
              <Zap className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Ready to Test</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Enter any hostname or IP address above to instantly test connectivity from all your monitoring agents.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {['8.8.8.8', 'google.com', 'cloudflare.com', '1.1.1.1'].map(suggestion => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => setHostname(suggestion)}
                    className="font-mono"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InstantPing;
