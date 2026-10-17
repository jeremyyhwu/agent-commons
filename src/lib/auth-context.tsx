"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider, testConnection } from "./firebase";
import {
  getUserProfile,
  upsertUserProfile,
  createOrganization,
  getOrganization,
  registerAgent,
  listAgents,
  type UserProfile,
  type OrganizationRecord,
  type AgentRecord,
} from "./firestore-service";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  org: OrganizationRecord | null;
  agents: AgentRecord[];
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [org, setOrg] = useState<OrganizationRecord | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Test Firestore connection on initial mount
  useEffect(() => {
    testConnection().catch((err) => console.warn("Firestore connection check:", err));
  }, []);

  const loadUserData = async (currentUser: User) => {
    try {
      let prof = await getUserProfile(currentUser.uid);
      if (!prof) {
        prof = await upsertUserProfile(currentUser.uid, {
          displayName: currentUser.displayName || currentUser.email?.split("@")[0] || "User",
          email: currentUser.email,
          defaultOrgId: `org_${currentUser.uid.slice(0, 8)}`,
        });
      }
      setProfile(prof);

      // Check or create default organization
      const orgId = prof.defaultOrgId || `org_${currentUser.uid.slice(0, 8)}`;
      let userOrg = await getOrganization(orgId);
      if (!userOrg) {
        userOrg = await createOrganization({
          id: orgId,
          name: `${prof.displayName}'s Organization`,
          sector: "retail",
          businessType: "buyer",
          countryCode: "PH",
          defaultCurrency: "USD",
          status: "active",
          ownerUid: currentUser.uid,
        });
      }
      setOrg(userOrg);

      // Check or register default agent
      let orgAgents = await listAgents(orgId);
      if (orgAgents.length === 0) {
        const newAgent = await registerAgent({
          id: `agent_${currentUser.uid.slice(0, 8)}`,
          ownerOrgId: orgId,
          createdByUid: currentUser.uid,
          name: `${prof.displayName} Purchasing Agent`,
          businessRole: "buyer",
          sector: "retail",
          agentCardUrl: `https://agentcommons.org/agents/agent_${currentUser.uid.slice(0, 8)}/card.json`,
          protocolVersion: "1.0",
          status: "active",
          claims: [
            { field: "businessRole", state: "self_reported" },
            { field: "sector", state: "unverified" },
          ],
        });
        orgAgents = [newAgent];
      }
      setAgents(orgAgents);
    } catch (e) {
      console.error("Failed to load user data from Firestore:", e);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadUserData(firebaseUser);
      } else {
        setProfile(null);
        setOrg(null);
        setAgents([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogleAction = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await loadUserData(cred.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmailAction = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (cred.user) {
        await loadUserData(cred.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmailAction = async (email: string, pass: string, name: string) => {
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (cred.user) {
        await updateProfile(cred.user, { displayName: name });
        await upsertUserProfile(cred.user.uid, {
          displayName: name,
          email,
          defaultOrgId: `org_${cred.user.uid.slice(0, 8)}`,
        });
        await loadUserData(cred.user);
      }
    } finally {
      setLoading(false);
    }
  };

  const logoutAction = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setOrg(null);
    setAgents([]);
  };

  const refreshUserData = async () => {
    if (user) {
      await loadUserData(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        org,
        agents,
        loading,
        signInWithGoogle: signInWithGoogleAction,
        signInWithEmail: signInWithEmailAction,
        signUpWithEmail: signUpWithEmailAction,
        logout: logoutAction,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
