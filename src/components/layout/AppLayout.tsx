'use client';
import { useState } from 'react';
import { GlobalStorePicker } from '@/components/StorePicker';
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
  ChevronRight,
  KeyRound,
} from 'lucide-react';
import { NAV_GROUPS, canSee } from './nav';
import Notifications from './Notifications';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pathname = usePathname() ?? '';

  if (!user) return null;

  // Build the visible groups for this role (skip groups with no items).
  const groups = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => canSee(i, user.role)),
  })).filter((g) => g.items.length > 0);

  // Which group holds the current page (the active group stays expanded).
  const activeLabel = groups.find((g) =>
    g.items.some((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to))),
  )?.label;

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
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-4 overflow-y-auto p-3">
          {groups.map((group) => {
            const isOverview = group.label === 'Overview';
            // The active group stays expanded even if the user collapsed it.
            const isCollapsed =
              !isOverview &&
              group.label !== activeLabel &&
              collapsed[group.label] === true;
            return (
              <div key={group.label} className="flex flex-col gap-1">
                {isOverview ? (
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </p>
                ) : (
                  <button
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [group.label]: !(c[group.label] === true && group.label !== activeLabel) }))
                    }
                    className="flex w-full items-center rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {group.label}
                    {isCollapsed ? (
                      <ChevronRight className="ml-auto h-4 w-4" />
                    ) : (
                      <ChevronDown className="ml-auto h-4 w-4" />
                    )}
                  </button>
                )}
                {!isCollapsed && (
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => {
                      const isActive =
                        item.to === '/'
                          ? pathname === '/'
                          : pathname.startsWith(item.to);
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
                  </div>
                )}
              </div>
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
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {/* Switching here moves the whole app to that branch. */}
            <GlobalStorePicker />
            <Notifications />
            <Tooltip content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              <button
                onClick={toggle}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </Tooltip>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account menu for ${user.name}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(user.name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-sm font-medium leading-tight">{user.name ?? user.email}</div>
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
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMenuOpen(false);
                      setPwOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                  >
                    <KeyRound className="h-4 w-4" /> Change password
                  </button>
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

        <main className="flex-1 p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
