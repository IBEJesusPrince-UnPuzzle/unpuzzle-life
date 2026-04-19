import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface Invitation {
  id: number;
  email: string;
  token: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function AdminPage() {
  const { user } = useAuth();

  if (user?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Admin Panel</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AdminUser> }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to update user", description: error.message });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ id, newPassword }: { id: number; newPassword: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/reset-password`, { newPassword });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setResetTarget(null);
      setNewPassword("");
      setShowNewPassword(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to reset password", description: error.message.replace(/^\d+:\s*/, "") });
    },
  });

  const impersonate = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      window.location.hash = "#/";
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to impersonate", description: error.message });
    },
  });

  if (isLoading) return <p className="py-4 text-muted-foreground">Loading users...</p>;

  return (
    <>
      <div className="space-y-3">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.displayName}</div>
                  <div className="text-sm text-muted-foreground truncate">{u.email}</div>
                </div>
                <div className="text-xs text-muted-foreground text-right shrink-0">
                  {u.lastLoginAt ? `Last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : "Never logged in"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  defaultValue={u.role}
                  onValueChange={(role) => updateUser.mutate({ id: u.id, data: { role } })}
                  disabled={u.id === currentUser?.id}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  defaultValue={u.status}
                  onValueChange={(status) => updateUser.mutate({ id: u.id, data: { status } })}
                  disabled={u.id === currentUser?.id}
                >
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>

                {u.id !== currentUser?.id && (
                  <div className="flex gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setResetTarget(u);
                        setNewPassword("");
                        setShowNewPassword(false);
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1" />
                      Reset PW
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => impersonate.mutate(u.id)}
                      disabled={impersonate.isPending}
                    >
                      Impersonate
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(""); setShowNewPassword(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a new password for <span className="font-medium text-foreground">{resetTarget?.displayName}</span> ({resetTarget?.email})
          </p>
          <div className="space-y-2">
            <Label htmlFor="admin-new-pw">New Password</Label>
            <div className="relative">
              <Input
                id="admin-new-pw"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                minLength={8}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              disabled={newPassword.length < 8 || resetPassword.isPending}
              onClick={() => { if (resetTarget) resetPassword.mutate({ id: resetTarget.id, newPassword }); }}
            >
              {resetPassword.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvitationsTab() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: invitations = [], isLoading } = useQuery<Invitation[]>({
    queryKey: ["/api/admin/invitations"],
  });

  const createInvitation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/admin/invitations", { email });
      return await res.json();
    },
    onSuccess: (inv: Invitation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
      setInviteEmail("");
      toast({
        title: "Invitation created",
        description: `Token: ${inv.token}`,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to create invitation", description: error.message.replace(/^\d+:\s*/, "") });
    },
  });

  const deleteInvitation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/invitations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite a User</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail) createInvitation.mutate(inviteEmail);
            }}
          >
            <Input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="max-w-sm"
            />
            <Button type="submit" disabled={createInvitation.isPending}>
              {createInvitation.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="py-4 text-muted-foreground">Loading invitations...</p>
      ) : invitations.length === 0 ? (
        <p className="py-4 text-muted-foreground">No invitations yet.</p>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</div>
                  </div>
                  <Badge variant={inv.status === "pending" ? "secondary" : "outline"}>
                    {inv.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const link = `${window.location.origin}/#/register?token=${inv.token}`;
                      navigator.clipboard.writeText(link);
                      toast({ title: "Invite link copied to clipboard" });
                    }}
                  >
                    Copy Invite Link
                  </Button>
                  {inv.status === "pending" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => deleteInvitation.mutate(inv.id)}
                      disabled={deleteInvitation.isPending}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
