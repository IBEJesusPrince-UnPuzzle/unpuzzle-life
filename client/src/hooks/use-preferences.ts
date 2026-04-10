import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function usePreferences() {
  return useQuery<{ displayName: string; timeFormat: "12h" | "24h" }>({
    queryKey: ["/api/preferences"],
    queryFn: () => apiRequest("GET", "/api/preferences").then(r => r.json()),
  });
}
