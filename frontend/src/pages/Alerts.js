import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  AlertTriangle, Check, Clock, Filter, RefreshCw,
  Wifi, Globe, TrendingUp, Route
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const Alerts = () => {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const headers = { Authorization: `Bearer ${token}` };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = filter === "all" ? {} : { resolved: filter === "resolved" };
      const response = await axios.get(`${API}/alerts`, { headers, params: { ...params, limit: 200 } });
      setAlerts(response.data);
    } catch (error) {
      toast.error("Failed to fetch alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const handleResolve = async (alertId) => {
    try {
      await axios.put(`${API}/alerts/${alertId}/resolve`, {}, { headers });
      setAlerts(alerts.map(a => a.id === alertId ? { ...a, resolved: true } : a));
      toast.success("Alert resolved");
    } catch (error) {
      toast.error("Failed to resolve alert");
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case "high_latency":
        return <TrendingUp className="w-5 h-5" />;
      case "packet_loss":
        return <Wifi className="w-5 h-5" />;
      case "route_change":
        return <Route className="w-5 h-5" />;
      case "agent_down":
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical":
        return "text-red-400 bg-red-500/10";
      case "warning":
        return "text-yellow-400 bg-yellow-500/10";
      case "info":
        return "text-blue-400 bg-blue-500/10";
      default:
        return "text-slate-400 bg-slate-500/10";
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case "high_latency":
        return "High Latency";
      case "packet_loss":
        return "Packet Loss";
      case "route_change":
        return "Route Change";
      case "agent_down":
        return "Agent Down";
      default:
        return type;
    }
  };

  // Stats
  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === "critical" && !a.resolved).length,
    warning: alerts.filter(a => a.severity === "warning" && !a.resolved).length,
    resolved: alerts.filter(a => a.resolved).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="alerts-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Alerts</h1>
          <p className="text-slate-400 text-sm mt-1">Monitor and manage system alerts</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700" data-testid="alert-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alerts</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={fetchAlerts}
            variant="outline"
            className="gap-2"
            data-testid="refresh-alerts-btn"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total</p>
                <p className="text-2xl font-mono font-bold text-white">{stats.total}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-slate-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Critical</p>
                <p className="text-2xl font-mono font-bold text-red-400">{stats.critical}</p>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Warning</p>
                <p className="text-2xl font-mono font-bold text-yellow-400">{stats.warning}</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="w-6 h-6 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Resolved</p>
                <p className="text-2xl font-mono font-bold text-green-400">{stats.resolved}</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10">
                <Check className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-white">Alert History</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length > 0 ? (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border transition-all ${
                      alert.resolved 
                        ? 'bg-slate-800/30 border-slate-700/50 opacity-60' 
                        : 'bg-slate-800/50 border-slate-700'
                    } ${!alert.resolved && alert.severity === 'critical' ? 'border-l-4 border-l-red-500' : ''}
                    ${!alert.resolved && alert.severity === 'warning' ? 'border-l-4 border-l-yellow-500' : ''}
                    ${!alert.resolved && alert.severity === 'info' ? 'border-l-4 border-l-blue-500' : ''}`}
                    data-testid={`alert-item-${alert.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                        {getAlertIcon(alert.alert_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(alert.alert_type)}
                          </Badge>
                          <Badge 
                            className={`text-xs ${
                              alert.severity === 'critical' ? 'badge-danger' :
                              alert.severity === 'warning' ? 'badge-warning' : 'badge-info'
                            }`}
                          >
                            {alert.severity}
                          </Badge>
                          {alert.resolved && (
                            <Badge className="badge-success text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="text-white font-medium">{alert.message}</p>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-400">
                          {alert.agent_name && (
                            <span className="flex items-center gap-1">
                              <Wifi className="w-3.5 h-3.5" />
                              {alert.agent_name}
                            </span>
                          )}
                          {alert.target_hostname && (
                            <span className="flex items-center gap-1 font-mono text-cyan-400">
                              <Globe className="w-3.5 h-3.5" />
                              {alert.target_hostname}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(alert.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {!alert.resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResolve(alert.id)}
                          className="gap-1.5 shrink-0"
                          data-testid={`resolve-alert-${alert.id}`}
                        >
                          <Check className="w-4 h-4" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No alerts found</p>
              <p className="text-sm mt-1">Your system is running smoothly</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Alerts;
