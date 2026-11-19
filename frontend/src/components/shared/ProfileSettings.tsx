import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/services/authApi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardDescription } from "@/components/ui/card";
import { User, Mail, Phone, Building2, Lock, Save, RotateCcw, Shield, Eye, EyeOff } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  citizen: "bg-primary/10 text-primary border-primary/20",
  authority: "bg-accent/10 text-accent-foreground border-accent/20",
  admin: "bg-destructive/10 text-destructive border-destructive/20",
};

const ROLE_LABELS: Record<string, string> = {
  citizen: "Citizen",
  authority: "Department",
  admin: "Admin",
};

interface PasswordFieldProps {
  label: string;
  value: string;
  field: "current" | "new_" | "confirm";
  show: boolean;
  onToggleShow: () => void;
  onChange: (value: string) => void;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  value,
  field,
  show,
  onToggleShow,
  onChange,
}) => {
  const inputId = `pw-${field}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-sm font-medium text-foreground">{label}</Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          id={inputId}
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pl-10 pr-10"
          placeholder="••••••••"
        />
        <button
          type="button"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

const ProfileSettings: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
  });

  const [passwords, setPasswords] = useState({ current: "", new_: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, new_: false, confirm: false });
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase();

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Validation Error", description: "Name cannot be empty.", variant: "destructive" });
      return;
    }
    const phoneTrimmed = form.phone.trim();
    if (phoneTrimmed && !/^\+?[0-9\s\-()]{7,20}$/.test(phoneTrimmed)) {
      toast({ title: "Validation Error", description: "Please enter a valid phone number (7-20 digits).", variant: "destructive" });
      return;
    }
    const payload: { name: string; phone?: string } = { name: form.name.trim() };
    if (phoneTrimmed) {
      payload.phone = phoneTrimmed;
    } else if (user.phone) {
      payload.phone = "";
    }
    setSaving(true);
    try {
      const res = await authApi.updateProfile(payload);
      updateProfile({ name: res.user.name, phone: res.user.phone });
      toast({ title: "Profile Updated", description: "Your changes have been saved successfully." });
    } catch (err: unknown) {
      toast({
        title: "Update Failed",
        description: err instanceof Error ? err.message : "Failed to update profile.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!passwords.current || !passwords.new_ || !passwords.confirm) {
      toast({ title: "Validation Error", description: "All password fields are required.", variant: "destructive" });
      return;
    }
    if (passwords.new_ !== passwords.confirm) {
      toast({ title: "Password Mismatch", description: "New password and confirm password do not match.", variant: "destructive" });
      return;
    }
    if (passwords.new_.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword({
        currentPassword: passwords.current,
        newPassword: passwords.new_,
      });
      setPasswords({ current: "", new_: "", confirm: "" });
      toast({ title: "Password Updated", description: "Your password has been changed successfully." });
    } catch (err: unknown) {
      toast({
        title: "Password Update Failed",
        description: err instanceof Error ? err.message : "Failed to change password.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({ name: user.name, phone: user.phone || "" });
    setPasswords({ current: "", new_: "", confirm: "" });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Profile Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account details and security preferences.</p>
      </div>

      {/* Profile Header */}
      <Card>
        <div className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-xl font-bold text-primary-foreground shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="outline" className={`mt-1 capitalize ${ROLE_COLORS[user.role]}`}>
                <Shield className="w-3 h-3 mr-1" />
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Editable Details */}
      <Card>
        <div>
          <h3 className="text-lg">Personal Information</h3>
          <CardDescription>Update your personal details below.</CardDescription>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-email" className="text-sm font-medium text-foreground">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="profile-email" value={user.email} disabled className="pl-10 opacity-60 cursor-not-allowed" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name" className="text-sm font-medium text-foreground">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="profile-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="pl-10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone" className="text-sm font-medium text-foreground">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="profile-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="pl-10" placeholder="+91 XXXXX XXXXX" />
            </div>
          </div>

          {user.role === "authority" && (
            <div className="space-y-2">
              <Label htmlFor="profile-dept" className="text-sm font-medium text-foreground">Assigned Department</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="profile-dept" value={user.department || "Unassigned"} disabled className="pl-10 opacity-60 cursor-not-allowed" />
              </div>
              <p className="text-xs text-muted-foreground">Department assignments are managed by system administrators.</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Password Update */}
      <Card>
        <div>
          <h3 className="text-lg">Security</h3>
          <CardDescription>Update your password to keep your account secure.</CardDescription>
        </div>
        <div className="space-y-4">
          <PasswordField
            label="Current Password"
            value={passwords.current}
            field="current"
            show={showPw.current}
            onToggleShow={() => setShowPw(s => ({ ...s, current: !s.current }))}
            onChange={val => setPasswords(p => ({ ...p, current: val }))}
          />
          <PasswordField
            label="New Password"
            value={passwords.new_}
            field="new_"
            show={showPw.new_}
            onToggleShow={() => setShowPw(s => ({ ...s, new_: !s.new_ }))}
            onChange={val => setPasswords(p => ({ ...p, new_: val }))}
          />
          <PasswordField
            label="Confirm New Password"
            value={passwords.confirm}
            field="confirm"
            show={showPw.confirm}
            onToggleShow={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
            onChange={val => setPasswords(p => ({ ...p, confirm: val }))}
          />
          <Button onClick={handlePasswordUpdate} disabled={saving} variant="secondary" className="gap-2 mt-2">
            <Lock className="w-4 h-4" />
            Update Password
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

export default ProfileSettings;
