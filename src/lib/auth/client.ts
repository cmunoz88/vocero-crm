"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient(), usernameClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
