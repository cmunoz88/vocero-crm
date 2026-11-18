"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";

export function SalirButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut().catch(() => {});
        router.push("/login");
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-text-2 hover:bg-accent hover:text-foreground"
    >
      <LogOut className="h-4 w-4" />
      Salir
    </button>
  );
}
