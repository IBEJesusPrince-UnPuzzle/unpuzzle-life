import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Preferences {
  displayName: string;
  timeFormat: "12h" | "24h";
  claritySkipRitual: boolean;
}

export function usePreferences() {
  return useQuery<Preferences>({
    queryKey: ["/api/preferences"],
    queryFn: () => apiRequest("GET", "/api/preferences").then(r => r.json()),
  });
}
