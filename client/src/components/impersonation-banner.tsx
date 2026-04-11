import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { user } = useAuth();

  const stopImpersonating = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stop-impersonating");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  if (!user?.impersonating) return null;

  return (
    <div className="bg-yellow-500 text-yellow-950 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3">
      <span>
        Impersonating <strong>{user.displayName}</strong> ({user.email})
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-yellow-950/30 bg-yellow-400 hover:bg-yellow-300 text-yellow-950"
        onClick={() => stopImpersonating.mutate()}
        disabled={stopImpersonating.isPending}
      >
        {stopImpersonating.isPending ? "Stopping..." : "Stop Impersonating"}
      </Button>
    </div>
  );
}
