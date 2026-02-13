export interface User {
  id: number;
  username: string;
  name?: string;
  role: string;
}

const CURRENT_USER_KEY = "currentUser";

export function getCurrentUser(): User | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user && typeof user.username === "string") {
      // Coerce numeric id strings to numbers to handle different backends
      if (typeof user.id === 'string' && !Number.isNaN(Number(user.id))) {
        user.id = Number(user.id);
      }
      if (typeof user.id === 'number') return user as User;
    }
    console.warn("currentUser in localStorage has invalid shape");
    return null;
  } catch (error) {
    console.error("Failed to parse currentUser:", error);
    return null;
  }
}

export function getCurrentUserId(): number | null {
  const user = getCurrentUser();
  return user?.id ?? null;
}

export function getCurrentUserName(): string {
  const user = getCurrentUser();
  return user?.name || user?.username || "";
}

export function getCurrentUserRole(): string | null {
  const user = getCurrentUser();
  return user?.role ?? null;
}
