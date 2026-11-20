"use client";
import {
  BookOpenIcon,
  HomeIcon,
  LogOutIcon,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { name: "Dashboard", href: "/admin", icon: HomeIcon },
  { name: "Teachers & Students", href: "/admin/users", icon: UsersIcon },
  { name: "Academic Structure", href: "/admin/academic", icon: BookOpenIcon },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        const data = await r.json();
        const role = data?.user?.role;
        if (!role) return router.replace("/login");
        if (role !== "admin" && role !== "superadmin") {
          if (role === "teacher") return router.replace("/teacher");
          return router.replace("/student");
        }
        setReady(true);
      })
      .catch(() => router.replace("/login"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen w-full bg-background">
      <aside className="fixed inset-y-0 left-0 flex w-20 flex-col items-center gap-4 border-r border-border bg-primary/10 py-6 md:w-64 md:items-stretch">
        <div className="mb-4 flex flex-col items-center justify-center px-2">
          <Image
            src="/images/clg-logo.png"
            alt="College Logo"
            width={50}
            height={50}
            className="mb-2 rounded-lg shadow-sm"
          />
          <div className="hidden flex-col items-center md:flex">
            <span className="text-xl font-bold text-primary">
              EDU-<span className="text-red-600">XIE</span>
            </span>
            <span className="text-xs font-medium text-primary/80">ADMIN</span>
          </div>
          <span className="text-xs font-bold text-primary md:hidden">AD</span>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {navLinks.map(({ name, href, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-muted-foreground transition hover:bg-primary hover:text-primary-foreground md:px-5 md:py-3",
              )}
            >
              <Icon className="size-6 shrink-0 opacity-80 group-hover:opacity-100" />
              <span className="hidden md:inline">{name}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex flex-col gap-2 px-2.5 md:px-5">
          <Button
            variant="secondary"
            className="w-full"
            size="sm"
            onClick={async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST" });
              } catch (error) {
                console.error("Logout error:", error);
              } finally {
                window.location.href = "/login";
              }
            }}
          >
            <LogOutIcon className="mr-2 size-5" />
            <span className="hidden md:inline">Logout</span>
          </Button>
        </div>
      </aside>
      <div className="ml-20 flex min-w-0 flex-col md:ml-64">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-8 py-4 font-sans backdrop-blur">
          <span className="hidden text-lg font-semibold tracking-tight text-muted-foreground md:inline">
            Admin Dashboard
          </span>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full border border-border bg-gradient-to-br from-blue-300 to-fuchsia-300 font-bold uppercase text-primary">
              A
            </div>
          </div>
        </header>
        <main className="flex-1 animate-fadeInUp bg-background px-2 py-8 font-sans md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
