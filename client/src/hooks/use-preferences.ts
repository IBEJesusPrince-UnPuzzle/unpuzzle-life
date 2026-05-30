import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Preferences {
  displayName: string;
  timeFormat: "12h" | "24h";
  claritySkipRitual: boolean;
  showResponsibility: boolean;
  showProjectTask: boolean;
  showStandalone: boolean;
  // Notification preferences
  notificationsEnabled: boolean;
  taskReminderMinutes: number;
  dailyReviewEnabled: boolean;
  dailyReviewTime: string;
  projectDeadlineAlertsEnabled: boolean;
  projectDeadlineDaysBefore: number;
  stalledProjectAlertsEnabled: boolean;
  stalledProjectDaysThreshold: number;
}

export function usePreferences() {
  return useQuery<Preferences>({
    queryKey: ["/api/preferences"],
    queryFn: () => apiRequest("GET", "/api/preferences").then(r => r.json()),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Preferences>) =>
      apiRequest("PUT", "/api/preferences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
    },
  });
}
