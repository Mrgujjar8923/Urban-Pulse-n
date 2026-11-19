import React from "react";
import { Camera, LogOut, Save, Shield } from "lucide-react";
import { User } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ProfilePopupProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: { name: string; avatar?: string }) => void;
  onLogout: () => void;
}

const ROLE_LABELS: Record<User["role"], string> = {
  admin: "Admin",
  authority: "Department",
  citizen: "Citizen",
};

export const ProfilePopup: React.FC<ProfilePopupProps> = ({
  user,
  open,
  onOpenChange,
  onSave,
  onLogout,
}) => {
  const { toast } = useToast();
  const [name, setName] = React.useState(user.name);
  const [avatarUrl, setAvatarUrl] = React.useState(user.avatar || "");

  React.useEffect(() => {
    if (!open) return;
    setName(user.name);
    setAvatarUrl(user.avatar || "");
  }, [open, user.name, user.avatar]);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSave = () => {
    const cleanedName = name.trim();
    if (!cleanedName) {
      toast({
        title: "Name is required",
        description: "Please enter your full name before saving.",
        variant: "destructive",
      });
      return;
    }

    const cleanedAvatar = avatarUrl.trim();
    onSave({
      name: cleanedName,
      avatar: cleanedAvatar || undefined,
    });
    toast({
      title: "Profile updated",
      description: "Your dashboard profile has been updated.",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          overlayClassName="bg-black/10 backdrop-blur-md dark:bg-black/25"
        className="w-[min(960px,calc(100%-1.5rem))] max-w-4xl overflow-hidden border border-slate-200/80 bg-white/95 p-0 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-[#080f1e]/95 dark:text-slate-100"
      >
        <DialogTitle className="sr-only">Profile settings</DialogTitle>
        <DialogDescription className="sr-only">Update your visible profile information</DialogDescription>

        <div className="grid gap-0 md:grid-cols-[260px_1fr]">
          <aside className="border-b border-slate-200/80 bg-gradient-to-b from-blue-500/10 via-sky-500/5 to-transparent p-6 md:border-b-0 md:border-r dark:border-white/10">
            <div className="rounded-3xl border border-slate-200 bg-white/70 p-6 text-center shadow-[0_15px_40px_rgba(30,64,175,0.18)] dark:border-blue-100/40 dark:bg-white/5 dark:shadow-[0_15px_40px_rgba(30,64,175,0.22)]">
              <Avatar className="mx-auto h-24 w-24 border border-blue-200/80 shadow-[0_0_40px_rgba(56,189,248,0.35)] dark:border-blue-200/60">
                <AvatarImage src={avatarUrl || user.avatar} alt={name || user.name} />
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-sky-400 text-3xl font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <p className="mt-4 truncate text-xl font-semibold">{name || user.name}</p>
              <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
              <Badge variant="secondary" className="mt-4 border border-slate-200 bg-white/70 text-slate-700 dark:border-white/20 dark:bg-white/10 dark:text-slate-100">
                <Shield className="mr-1 h-3 w-3" />
                {ROLE_LABELS[user.role]}
              </Badge>
            </div>
          </aside>

          <section className="p-6 md:p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">Profile settings</p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight text-slate-900 dark:text-slate-100">Read and update your details</h2>
            <p className="mt-3 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              Keep your visible identity up to date. Changes here reflect immediately across dashboard profile icons.
            </p>

            <div className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="profile-name" className="text-xs uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">Full name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-12 border-slate-300 bg-white/80 text-base text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email" className="text-xs uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">Email address</Label>
                <Input
                  id="profile-email"
                  value={user.email}
                  disabled
                  className="h-12 border-slate-300 bg-white/80 text-base text-slate-600 opacity-80 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-avatar" className="text-xs uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">Profile image url</Label>
                <div className="relative">
                  <Camera className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                  <Input
                    id="profile-avatar"
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                    className="h-12 border-slate-300 bg-white/80 pl-11 text-base text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="https://example.com/avatar.jpg"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={handleSave} className="h-11 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 text-white hover:from-indigo-400 hover:to-sky-400">
                <Save className="h-4 w-4" />
                Save changes
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-full border-slate-300 bg-white px-6 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">
                Close
              </Button>
              <Button variant="ghost" onClick={onLogout} className="h-11 rounded-full px-5 text-rose-600 hover:bg-rose-100 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-200">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfilePopup;
