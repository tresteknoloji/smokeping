import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  Globe, Plus, Trash2, Edit2, Check, X, Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Targets = () => {
  const { token } = useAuth();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    hostname: "",
    name: "",
    threshold_ms: 100,
    enabled: true
  });

  const headers = { Authorization: `Bearer ${token}` };

  const fetchTargets = async () => {
    try {
      const response = await axios.get(`${API}/targets`, { headers });
      setTargets(response.data);
    } catch (error) {
      toast.error("Failed to fetch targets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets();
  }, []);

  const handleAddTarget = async () => {
    if (!formData.hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }

    try {
      const response = await axios.post(`${API}/targets`, formData, { headers });
      setTargets([...targets, response.data]);
      setShowAddDialog(false);
      setFormData({ hostname: "", name: "", threshold_ms: 100, enabled: true });
      toast.success("Target added successfully");
    } catch (error) {
      toast.error("Failed to add target");
    }
  };

  const handleUpdateTarget = async (target) => {
    try {
      await axios.put(`${API}/targets/${target.id}`, {
        hostname: target.hostname,
        name: target.name,
        threshold_ms: target.threshold_ms,
        enabled: target.enabled
      }, { headers });
      
      setTargets(targets.map(t => t.id === target.id ? target : t));
      setEditingId(null);
      toast.success("Target updated");
    } catch (error) {
      toast.error("Failed to update target");
    }
  };

  const handleDeleteTarget = async () => {
    if (!selectedTarget) return;

    try {
      await axios.delete(`${API}/targets/${selectedTarget.id}`, { headers });
      setTargets(targets.filter(t => t.id !== selectedTarget.id));
      setShowDeleteDialog(false);
      setSelectedTarget(null);
      toast.success("Target deleted successfully");
    } catch (error) {
      toast.error("Failed to delete target");
    }
  };

  const toggleEnabled = async (target) => {
    const updated = { ...target, enabled: !target.enabled };
    await handleUpdateTarget(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="targets-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Targets</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage hosts to monitor across all agents</p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          data-testid="add-target-btn"
        >
          <Plus className="w-4 h-4" />
          Add Target
        </Button>
      </div>

      {/* Targets Table */}
      {targets.length > 0 ? (
        <Card className="glass-card">
          <CardContent className="p-0">
            <Table className="data-table">
              <TableHeader>
                <TableRow className="border-b border-white/5 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Hostname/IP</TableHead>
                  <TableHead className="text-muted-foreground">Threshold</TableHead>
                  <TableHead className="text-muted-foreground">Created</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map(target => (
                  <TableRow key={target.id} className="border-b border-white/5" data-testid={`target-row-${target.id}`}>
                    <TableCell>
                      <Switch
                        checked={target.enabled}
                        onCheckedChange={() => toggleEnabled(target)}
                        data-testid={`toggle-target-${target.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      {editingId === target.id ? (
                        <Input
                          value={target.name}
                          onChange={(e) => setTargets(targets.map(t => 
                            t.id === target.id ? { ...t, name: e.target.value } : t
                          ))}
                          className="bg-secondary border-border h-8 w-40"
                        />
                      ) : (
                        <span className="text-foreground font-medium">{target.name || target.hostname}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === target.id ? (
                        <Input
                          value={target.hostname}
                          onChange={(e) => setTargets(targets.map(t => 
                            t.id === target.id ? { ...t, hostname: e.target.value } : t
                          ))}
                          className="bg-secondary border-border h-8 w-40 font-mono"
                        />
                      ) : (
                        <span className="font-mono text-cyan-400">{target.hostname}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === target.id ? (
                        <Input
                          type="number"
                          value={target.threshold_ms}
                          onChange={(e) => setTargets(targets.map(t => 
                            t.id === target.id ? { ...t, threshold_ms: parseInt(e.target.value) || 0 } : t
                          ))}
                          className="bg-secondary border-border h-8 w-24 font-mono"
                        />
                      ) : (
                        <Badge variant="outline" className="font-mono">
                          {target.threshold_ms}ms
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(target.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {editingId === target.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUpdateTarget(target)}
                              className="text-green-400 hover:text-green-300"
                              data-testid={`save-target-${target.id}`}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingId(null);
                                fetchTargets();
                              }}
                              className="text-muted-foreground"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingId(target.id)}
                              data-testid={`edit-target-${target.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedTarget(target);
                                setShowDeleteDialog(true);
                              }}
                              className="text-red-400 hover:text-red-300"
                              data-testid={`delete-target-${target.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="p-12">
            <div className="text-center">
              <Globe className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Targets Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Add hosts to monitor. All connected agents will ping these targets.
              </p>
              <Button
                onClick={() => setShowAddDialog(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Your First Target
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Target Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add New Target</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Add a host to monitor. All agents will ping this target.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="form-group">
              <Label htmlFor="hostname" className="form-label">Hostname or IP Address</Label>
              <Input
                id="hostname"
                value={formData.hostname}
                onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                placeholder="e.g., 8.8.8.8 or google.com"
                className="bg-secondary border-border font-mono"
                data-testid="target-hostname-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="name" className="form-label">Display Name (optional)</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Google DNS"
                className="bg-secondary border-border"
                data-testid="target-name-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="threshold" className="form-label">Latency Threshold (ms)</Label>
              <Input
                id="threshold"
                type="number"
                value={formData.threshold_ms}
                onChange={(e) => setFormData({ ...formData, threshold_ms: parseInt(e.target.value) || 0 })}
                placeholder="100"
                className="bg-secondary border-border font-mono"
                data-testid="target-threshold-input"
              />
              <p className="text-xs text-muted-foreground mt-1">Alert when latency exceeds this value</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTarget} className="bg-blue-600 hover:bg-blue-700" data-testid="create-target-btn">
              Add Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Target</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete "{selectedTarget?.name || selectedTarget?.hostname}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-border hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTarget}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-target-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Targets;
