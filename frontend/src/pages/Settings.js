import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Mail, Clock, Save, Eye, EyeOff,
  Plus, X, AlertTriangle, Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const SettingsPage = () => {
  const { token } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`, { headers });
      setSettings(response.data);
    } catch (error) {
      toast.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings`, settings, { headers });
      toast.success("Settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    if (!newEmail.trim()) return;
    if (!newEmail.includes("@")) {
      toast.error("Invalid email address");
      return;
    }
    if (settings.smtp.alert_emails.includes(newEmail)) {
      toast.error("Email already added");
      return;
    }
    
    setSettings({
      ...settings,
      smtp: {
        ...settings.smtp,
        alert_emails: [...settings.smtp.alert_emails, newEmail]
      }
    });
    setNewEmail("");
  };

  const removeEmail = (email) => {
    setSettings({
      ...settings,
      smtp: {
        ...settings.smtp,
        alert_emails: settings.smtp.alert_emails.filter(e => e !== email)
      }
    });
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure monitoring and notification settings</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          data-testid="save-settings-btn"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Monitoring Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Clock className="w-5 h-5 text-blue-400" />
            Monitoring Settings
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure default monitoring parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="form-group">
              <Label htmlFor="ping_interval" className="form-label">Ping Interval (seconds)</Label>
              <Input
                id="ping_interval"
                type="number"
                value={settings.ping_interval_seconds}
                onChange={(e) => setSettings({ ...settings, ping_interval_seconds: parseInt(e.target.value) || 30 })}
                className="bg-secondary border-border font-mono"
                data-testid="ping-interval-input"
              />
              <p className="text-xs text-muted-foreground mt-1">How often agents should ping targets</p>
            </div>
            <div className="form-group">
              <Label htmlFor="default_threshold" className="form-label">Default Latency Threshold (ms)</Label>
              <Input
                id="default_threshold"
                type="number"
                value={settings.default_threshold_ms}
                onChange={(e) => setSettings({ ...settings, default_threshold_ms: parseInt(e.target.value) || 100 })}
                className="bg-secondary border-border font-mono"
                data-testid="threshold-input"
              />
              <p className="text-xs text-muted-foreground mt-1">Default threshold for new targets</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Mail className="w-5 h-5 text-cyan-400" />
                Email Notifications (SMTP)
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Configure email alerts for monitoring events
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="smtp_enabled" className="text-sm text-muted-foreground">Enable</Label>
              <Switch
                id="smtp_enabled"
                checked={settings.smtp.enabled}
                onCheckedChange={(checked) => setSettings({
                  ...settings,
                  smtp: { ...settings.smtp, enabled: checked }
                })}
                data-testid="smtp-enabled-toggle"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="form-group">
              <Label htmlFor="smtp_host" className="form-label">SMTP Host</Label>
              <Input
                id="smtp_host"
                value={settings.smtp.smtp_host}
                onChange={(e) => setSettings({
                  ...settings,
                  smtp: { ...settings.smtp, smtp_host: e.target.value }
                })}
                placeholder="smtp.gmail.com"
                className="bg-secondary border-border"
                data-testid="smtp-host-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="smtp_port" className="form-label">SMTP Port</Label>
              <Input
                id="smtp_port"
                type="number"
                value={settings.smtp.smtp_port}
                onChange={(e) => setSettings({
                  ...settings,
                  smtp: { ...settings.smtp, smtp_port: parseInt(e.target.value) || 587 }
                })}
                placeholder="587"
                className="bg-secondary border-border font-mono"
                data-testid="smtp-port-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="smtp_user" className="form-label">SMTP Username</Label>
              <Input
                id="smtp_user"
                value={settings.smtp.smtp_user}
                onChange={(e) => setSettings({
                  ...settings,
                  smtp: { ...settings.smtp, smtp_user: e.target.value }
                })}
                placeholder="your-email@gmail.com"
                className="bg-secondary border-border"
                data-testid="smtp-user-input"
              />
            </div>
            <div className="form-group">
              <Label htmlFor="smtp_pass" className="form-label">SMTP Password</Label>
              <div className="relative">
                <Input
                  id="smtp_pass"
                  type={showPassword ? "text" : "password"}
                  value={settings.smtp.smtp_pass}
                  onChange={(e) => setSettings({
                    ...settings,
                    smtp: { ...settings.smtp, smtp_pass: e.target.value }
                  })}
                  placeholder="••••••••"
                  className="bg-secondary border-border pr-10"
                  data-testid="smtp-pass-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="form-group md:col-span-2">
              <Label htmlFor="smtp_from" className="form-label">From Address</Label>
              <Input
                id="smtp_from"
                value={settings.smtp.smtp_from}
                onChange={(e) => setSettings({
                  ...settings,
                  smtp: { ...settings.smtp, smtp_from: e.target.value }
                })}
                placeholder="noreply@yourdomain.com"
                className="bg-secondary border-border"
                data-testid="smtp-from-input"
              />
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Alert Recipients */}
          <div>
            <Label className="form-label mb-3 block">Alert Recipients</Label>
            <div className="flex gap-2 mb-3">
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                placeholder="Add email address"
                className="bg-secondary border-border"
                data-testid="new-email-input"
              />
              <Button
                onClick={addEmail}
                variant="outline"
                className="gap-1.5"
                data-testid="add-email-btn"
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.smtp.alert_emails.length > 0 ? (
                settings.smtp.alert_emails.map(email => (
                  <Badge
                    key={email}
                    variant="secondary"
                    className="pl-3 pr-1 py-1.5 gap-2"
                  >
                    {email}
                    <button
                      onClick={() => removeEmail(email)}
                      className="p-0.5 hover:bg-white/10 rounded"
                      data-testid={`remove-email-${email}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recipients added</p>
              )}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-blue-400 mb-1">Gmail Users</p>
                <p>For Gmail, use an App Password instead of your regular password. Enable 2FA and generate an app password from your Google Account settings.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
