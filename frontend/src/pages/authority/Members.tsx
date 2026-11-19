import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { membersApi, MemberRecord, LinkedUserRecord } from "@/services/complaintsApi";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX, Link2, ShieldCheck, User } from "lucide-react";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";

interface EligibleUser {
  id: string;
  name: string;
  email: string;
  department: string;
  status: string;
  isLinked: boolean;
  linkedMember: { memberId: string; memberName: string } | null;
}

const Members: React.FC = () => {
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [name, setName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [linkingMemberId, setLinkingMemberId] = useState<string | null>(null);
  const [linkingTargetUserId, setLinkingTargetUserId] = useState<string>("");

  const loadData = async () => {
    try {
      const [membersData, eligibleData] = await Promise.all([
        membersApi.list(),
        membersApi.listEligibleUsers(),
      ]);
      setMembers(membersData);
      setEligibleUsers(Array.isArray(eligibleData) ? eligibleData : []);
      setLoadError(null);
    } catch (requestError) {
      setLoadError(requestError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, []);

  const handleSelectEligible = (userId: string) => {
    setSelectedUserId(userId);
    if (userId) {
      const found = eligibleUsers.find((u) => u.id === userId);
      if (found && !name.trim()) {
        setName(found.name);
      }
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Please enter an officer name.", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const newMember = await membersApi.create(name.trim(), selectedUserId || null);
      setMembers((current) => [newMember, ...current]);
      setName("");
      setSelectedUserId("");
      await loadData();
      toast({
        title: "Officer added",
        description: newMember.userId
          ? `${newMember.name} is now available and mapped to their application account.`
          : `${newMember.name} is now available for assignments.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create officer.";
      toast({
        title: "Unable to add officer",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (member: MemberRecord) => {
    try {
      setSaving(true);
      const updated = await membersApi.update(member.id, { unlinkUser: true });
      setMembers((current) => current.map((m) => (m.id === member.id ? updated : m)));
      await loadData();
      toast({
        title: "Account unlinked",
        description: `${member.name} is now an unlinked roster member.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not unlink account.";
      toast({
        title: "Failed to unlink account",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLink = async (memberId: string) => {
    if (!linkingTargetUserId) {
      toast({ title: "Select account", description: "Please select an account to link.", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const updated = await membersApi.update(memberId, { userId: linkingTargetUserId });
      setMembers((current) => current.map((m) => (m.id === memberId ? updated : m)));
      setLinkingMemberId(null);
      setLinkingTargetUserId("");
      await loadData();
      toast({
        title: "Account mapped",
        description: "Officer is now linked and will receive assignment notifications.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not link account.";
      toast({
        title: "Failed to link account",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const availableUsers = eligibleUsers.filter((u) => !u.isLinked);

  if (loadError) return <ApiErrorPanel error={loadError} onRetry={() => { setLoading(true); setLoadError(null); void loadData(); }} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Department Officers</h1>
        <p className="text-muted-foreground text-sm">
          Manage department members and link them to active user accounts for real-time complaint notifications.
        </p>
      </div>

      <Card className="p-5 glass-card">
        <div className="pb-3">
          <h3 className="text-sm font-heading font-semibold text-foreground">Add New Officer</h3>
          <p className="text-xs text-muted-foreground">
            Enter a roster name or link directly to an approved department user account.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr_auto] items-end">
          <div>
            <label htmlFor="officer-name" className="text-xs font-medium text-muted-foreground mb-1 block">Officer Name</label>
            <Input
              id="officer-name"
              placeholder="e.g. Officer Sharma"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="link-user-account" className="text-xs font-medium text-muted-foreground mb-1 block">
              Link User Account (Optional)
            </label>
            <select
              id="link-user-account"
              aria-label="Link User Account"
              value={selectedUserId}
              onChange={(e) => handleSelectEligible(e.target.value)}
              disabled={saving}
              className="w-full h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">No linked account (Roster only)</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleAdd} disabled={saving} className="h-10">
            {saving ? "Adding..." : "Add Member"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 glass-card">
        <div className="pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-heading font-semibold text-foreground">Active Officers</h3>
            <p className="text-xs text-muted-foreground">
              Officers available for complaint triage and assignment in this department.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {members.length} {members.length === 1 ? "Officer" : "Officers"}
          </Badge>
        </div>

        <div className="space-y-3">
          {loading && <div className="text-sm text-muted-foreground py-6 text-center">Loading officers...</div>}
          {!loading && members.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No officers found. Add an officer above to begin assignments.
            </div>
          )}
          {members.map((member) => {
            const linkedUser = typeof member.userId === "object" && member.userId !== null
              ? (member.userId as LinkedUserRecord)
              : null;
            const isLinkingThis = linkingMemberId === member.id;

            return (
              <div
                key={member.id}
                className="p-4 rounded-xl border border-border bg-card/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">{member.name}</span>
                    <Badge variant="secondary" className="text-[11px]">
                      {member.department}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {linkedUser ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Linked: {linkedUser.email}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <UserX className="w-3.5 h-3.5" />
                        Unlinked (Roster only — no direct login notifications)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {linkedUser ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlink(member)}
                      disabled={saving}
                      className="text-xs h-8 text-muted-foreground hover:text-destructive"
                    >
                      Unlink
                    </Button>
                  ) : isLinkingThis ? (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Select account to link"
                        value={linkingTargetUserId}
                        onChange={(e) => setLinkingTargetUserId(e.target.value)}
                        className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                      >
                        <option value="">Select account...</option>
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => handleSaveLink(member.id)}
                        disabled={saving || !linkingTargetUserId}
                        className="text-xs h-8"
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLinkingMemberId(null);
                          setLinkingTargetUserId("");
                        }}
                        className="text-xs h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLinkingMemberId(member.id);
                        setLinkingTargetUserId("");
                      }}
                      disabled={saving || availableUsers.length === 0}
                      className="text-xs h-8 inline-flex items-center gap-1"
                    >
                      <Link2 className="w-3 h-3" />
                      Link Account
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default Members;
