import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  Server, Plus, Trash2, Copy, Check, Download, Eye, 
  Wifi, WifiOff, Clock, X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const Agents = () => {
  const { token } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showScriptDialog, setShowScriptDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentScript, setAgentScript] = useState("");
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: ""
  });

  const headers = { Authorization: `Bearer ${token}` };

  const fetchAgents = async () => {
    try {
      const response = await axios.get(`${API}/agents`, { headers });
      setAgents(response.data);
    } catch (error) {
      toast.error("Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleAddAgent = async () => {
    if (!formData.name.trim()) {
      toast.error("Agent name is required");
      return;
    }

    try {
      const response = await axios.post(`${API}/agents`, formData, { headers });
      setAgents([...agents, response.data]);
      setShowAddDialog(false);
      setFormData({ name: "", description: "" });
      toast.success("Agent created successfully");
      
      // Show script dialog
      setSelectedAgent(response.data);
      await fetchAgentScript(response.data.id);
    } catch (error) {
      toast.error("Failed to create agent");
    }
  };

  const fetchAgentScript = async (agentId) => {
    try {
      const response = await axios.get(`${API}/agents/${agentId}/script`, { headers });
      setAgentScript(response.data.script);
      setShowScriptDialog(true);
    } catch (error) {
      toast.error("Failed to fetch agent script");
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent) return;

    try {
      await axios.delete(`${API}/agents/${selectedAgent.id}`, { headers });
      setAgents(agents.filter(a => a.id !== selectedAgent.id));
      setShowDeleteDialog(false);
      setSelectedAgent(null);
      toast.success("Agent deleted successfully");
    } catch (error) {
      toast.error("Failed to delete agent");
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const downloadScript = () => {
    const blob = new Blob([agentScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smokeping_agent_${selectedAgent?.name.replace(/\s+/g, '_')}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Script downloaded");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="agents-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Agents</h1>
          <p className="text-slate-400 text-sm mt-1">Manage monitoring agents across your infrastructure</p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          data-testid="add-agent-btn"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </Button>
      </div>

      {/* Agents Grid */}
      {agents.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <Card key={agent.id} className="glass-card hover-lift" data-testid={`agent-card-${agent.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${agent.status === 'online' ? 'bg-green-500/10' : 'bg-slate-700/50'}`}>
                      {agent.status === 'online' ? (
                        <Wifi className="w-5 h-5 text-green-400" />
                      ) : (
                        <WifiOff className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{agent.name}</h3>
                      <p className="text-xs text-slate-400 font-mono">{agent.ip_address || 'Not connected'}</p>
                    </div>
                  </div>
                  <Badge 
                    variant={agent.status === 'online' ? 'default' : 'secondary'}
                    className={agent.status === 'online' ? 'badge-success' : ''}
                  >
                    {agent.status}
                  </Badge>
                </div>

                {agent.description && (
                  <p className="text-sm text-slate-400 mb-4">{agent.description}</p>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                  <Clock className="w-3.5 h-3.5" />
                  {agent.last_seen ? (
                    <span>Last seen: {new Date(agent.last_seen).toLocaleString()}</span>
                  ) : (
                    <span>Never connected</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      setSelectedAgent(agent);
                      fetchAgentScript(agent.id);
                    }}
                    data-testid={`view-script-btn-${agent.id}`}
                  >
                    <Eye className="w-4 h-4" />
                    Script
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowDeleteDialog(true);
                    }}
                    data-testid={`delete-agent-btn-${agent.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass-card">
          <CardContent className="p-12">
            <div className="text-center">
              <Server className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <h3 className="text-xl font-semibold text-white mb-2">No Agents Yet</h3>
              <p className="text-slate-400 mb-6 max-w-md mx-auto">
                Add your first monitoring agent to start collecting network metrics from your servers.
              </p>
              <Button
                onClick={() => setShowAddDialog(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Your First Agent
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Agent Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#0f172a] border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Add New Agent</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new monitoring agent. You'll receive a script to run on your server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="form-group">
              <Label htmlFor="name" className="form-label">Agent Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Production Server 1"
                className="bg-slate-800/50 border-slate-700"
                data-testid="agent-name-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="description" className="form-label">Description (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Located in US-East datacenter"
                className="bg-slate-800/50 border-slate-700"
                data-testid="agent-description-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAgent} className="bg-blue-600 hover:bg-blue-700" data-testid="create-agent-btn">
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Script Dialog */}
      <Dialog open={showScriptDialog} onOpenChange={setShowScriptDialog}>
        <DialogContent className="bg-[#0f172a] border-slate-700 max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white">Agent Script - {selectedAgent?.name}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Run this script on your Ubuntu server to start collecting metrics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-lg border border-slate-700">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                <span className="text-sm text-slate-400 font-mono">smokeping_agent.py</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(agentScript)}
                    className="gap-1.5"
                    data-testid="copy-script-btn"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={downloadScript}
                    className="gap-1.5"
                    data-testid="download-script-btn"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[400px]">
                <pre className="p-4 text-sm font-mono text-slate-300 whitespace-pre-wrap">
                  {agentScript}
                </pre>
              </ScrollArea>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <h4 className="font-medium text-blue-400 mb-2">Installation Instructions</h4>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                <li>Install dependencies: <code className="bg-slate-800 px-1.5 py-0.5 rounded">pip install websockets</code></li>
                <li>Save the script to your server</li>
                <li>Install mtr: <code className="bg-slate-800 px-1.5 py-0.5 rounded">sudo apt install mtr-tiny</code></li>
                <li>Run: <code className="bg-slate-800 px-1.5 py-0.5 rounded">python3 smokeping_agent.py</code></li>
                <li>For background: <code className="bg-slate-800 px-1.5 py-0.5 rounded">nohup python3 smokeping_agent.py &</code></li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScriptDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#0f172a] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Agent</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{selectedAgent?.name}"? This will also delete all associated metrics and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAgent}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Agents;
