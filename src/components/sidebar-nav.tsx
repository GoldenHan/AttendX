
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
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
  FolderKanban,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: User['role'][]; // Roles that can see this item. If undefined, all authenticated users can see.
}

const allNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'caja', 'student'] },
  { href: '/attendance-log', label: 'Log Attendance', icon: ClipboardEdit, roles: ['admin', 'teacher', 'caja'] },
  { href: '/attendance-records', label: 'Records', icon: BookUser, roles: ['admin', 'teacher', 'caja', 'student'] }, // Students might see their own
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'teacher', 'caja', 'student'] }, // Students might see their own
  { href: '/ai-analysis', label: 'AI Analysis', icon: Brain, roles: ['admin', 'teacher'] },
];

const adminNavItems: NavItem[] = [
   { href: '/user-management', label: 'Users', icon: Users, roles: ['admin'] },
   { href: '/group-management', label: 'Groups', icon: FolderKanban, roles: ['admin', 'teacher'] },
   { href: '/app-settings', label: 'Settings', icon: Settings, roles: ['admin'] },
   { href: '/qr-login-setup', label: 'QR Session Login', icon: QrCode, roles: ['admin', 'teacher', 'caja'] },
];


export function SidebarNav() {
  const pathname = usePathname();
  const { firestoreUser, loading } = useAuth();
  const userRole = firestoreUser?.role;

  if (loading && !userRole) {
    // Optionally show skeletons or a compact loader here
    return null; 
  }

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    if (!userRole) return []; // Or some default for non-logged-in/loading states
    return items.filter(item => {
      if (!item.roles) return true; // No specific roles defined, show to all authenticated
      return item.roles.includes(userRole);
    });
  };

  const visibleNavItems = filterNavItems(allNavItems);
  const visibleAdminNavItems = filterNavItems(adminNavItems);

  const renderNavItem = (item: NavItem) => (
    <SidebarMenuItem key={item.href}>
      <Link href={item.href}>
        <SidebarMenuButton
          // variant prop is not directly used here for custom hover, styling is via cn
          className={cn(
            'w-full justify-start',
            pathname === item.href
              ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground' // Active item
              : 'text-sidebar-foreground hover:bg-muted/30 hover:text-sidebar-foreground' // Non-active item with new hover
          )}
          isActive={pathname === item.href} // isActive is passed for data-active attribute
          tooltip={{ children: item.label }}
        >
          <item.icon className="mr-2 h-4 w-4" />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  );

  return (
    <div className="flex-1 overflow-auto">
      <SidebarMenu>
        {visibleNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            {visibleNavItems.map(renderNavItem)}
          </SidebarGroup>
        )}
        
        {visibleAdminNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            {visibleAdminNavItems.map(renderNavItem)}
          </SidebarGroup>
        )}
      </SidebarMenu>
    </div>
  );
}
