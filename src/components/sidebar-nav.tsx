
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
  SidebarGroup,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  ClipboardEdit,
  BookUser,
  BarChart3,
  Brain,
  QrCode,
  Users,
  Settings,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/attendance-log', label: 'Log Attendance', icon: ClipboardEdit },
  { href: '/attendance-records', label: 'Records', icon: BookUser },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/ai-analysis', label: 'AI Analysis', icon: Brain },
];

const adminNavItems = [
   { href: '/user-management', label: 'Users', icon: Users },
   { href: '/app-settings', label: 'Settings', icon: Settings },
];


export function SidebarNav() {
  const pathname = usePathname();

  return (
    <div className="flex-1 overflow-auto">
      <SidebarMenu>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  variant="ghost"
                  className={cn(
                    'w-full justify-start',
                    pathname === item.href
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  )}
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
           {adminNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  variant="ghost"
                  className={cn(
                    'w-full justify-start',
                    pathname === item.href
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  )}
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
             <Link href="/qr-login-setup">
                <SidebarMenuButton
                    variant="ghost"
                    className={cn(
                        'w-full justify-start',
                        pathname === "/qr-login-setup"
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    )}
                    isActive={pathname === "/qr-login-setup"}
                    tooltip={{ children: "QR Session Login" }}
                    >
                    <QrCode className="mr-2 h-4 w-4" />
                    <span>QR Session Login</span>
                </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarGroup>
      </SidebarMenu>
    </div>
  );
}
