'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Package,
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { NAV, canSee } from './nav';
import Notifications from './Notifications';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? '';
  if (!user) return null;

  const items = NAV.filter((i) => canSee(i, user.role));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-4 w-4" />
          </div>
          <span className="font-semibold">Inventory</span>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const isActive =
              item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Notifications />
            <button
              onClick={toggle}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-sm font-medium leading-tight">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.role}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-lg animate-fade-in">
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {user.business?.name}
                  </div>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main key={pathname} className="flex-1 p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
