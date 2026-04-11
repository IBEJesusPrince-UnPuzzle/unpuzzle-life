import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

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
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    defaultValue={u.role}
                    onValueChange={(role) => updateUser.mutate({ id: u.id, data: { role } })}
                    disabled={u.id === currentUser?.id}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    defaultValue={u.status}
                    onValueChange={(status) => updateUser.mutate({ id: u.id, data: { status } })}
                    disabled={u.id === currentUser?.id}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                </TableCell>
                <TableCell>
                  {u.id !== currentUser?.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => impersonate.mutate(u.id)}
                      disabled={impersonate.isPending}
                    >
                      Impersonate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-muted-foreground">Loading invitations...</p>
          ) : invitations.length === 0 ? (
            <p className="p-4 text-muted-foreground">No invitations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "pending" ? "secondary" : "outline"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">
                        {inv.token.slice(0, 12)}...
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-6 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(inv.token);
                          toast({ title: "Token copied to clipboard" });
                        }}
                      >
                        Copy
                      </Button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {inv.status === "pending" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteInvitation.mutate(inv.id)}
                          disabled={deleteInvitation.isPending}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
