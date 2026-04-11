import { createContext, useContext } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";

interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  impersonating?: boolean;
  originalUserId?: number;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  loginMutation: ReturnType<typeof useLoginMutation>;
  registerMutation: ReturnType<typeof useRegisterMutation>;
  logoutMutation: ReturnType<typeof useLogoutMutation>;
}

function useLoginMutation() {
  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries();
    },
  });
}

function useRegisterMutation() {
  return useMutation({
    mutationFn: async (data: { email: string; password: string; displayName?: string; token: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return await res.json();
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries();
    },
  });
}

function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useAuthProvider(): AuthContextType {
  const {
    data: user,
    isLoading,
  } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const logoutMutation = useLogoutMutation();

  return {
    user: user ?? null,
    isLoading,
    loginMutation,
    registerMutation,
    logoutMutation,
  };
}
