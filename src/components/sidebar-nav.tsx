
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
  Settings,
  FolderKanban,
  ClipboardCheck,
  Briefcase,
  GraduationCap,
  UserCheck, // Added for Session Attendance
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: User['role'][];
}

const generalNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'caja', 'student'] },
  { href: '/attendance-log', label: 'Log Group Attendance', icon: ClipboardEdit, roles: ['admin', 'teacher', 'caja'] },
  { href: '/attendance-records', label: 'Records', icon: BookUser, roles: ['admin', 'teacher', 'caja', 'student'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'teacher', 'caja', 'student'] },
  { href: '/student-grades', label: 'Student Grades View', icon: ClipboardCheck, roles: ['admin', 'teacher'] },
  { href: '/ai-analysis', label: 'AI Analysis', icon: Brain, roles: ['admin', 'teacher'] },
];

const managementNavItems: NavItem[] = [
   { href: '/student-management', label: 'Student Management', icon: GraduationCap, roles: ['admin', 'teacher'] },
   { href: '/group-management', label: 'Groups', icon: FolderKanban, roles: ['admin', 'teacher'] },
   { href: '/grades-management', label: 'Grades Management', icon: ClipboardCheck, roles: ['admin', 'teacher'] },
   { href: '/teacher-session-attendance', label: 'Session Attendance', icon: UserCheck, roles: ['admin', 'teacher'] },
];

const adminNavItems: NavItem[] = [
   { href: '/user-management', label: 'Staff Management', icon: Briefcase, roles: ['admin'] },
   { href: '/app-settings', label: 'Settings', icon: Settings, roles: ['admin'] },
   { href: '/qr-login-setup', label: 'QR Session Login', icon: QrCode, roles: ['admin', 'teacher', 'caja'] },
];


export function SidebarNav() {
  const pathname = usePathname();
  const { firestoreUser, loading } = useAuth();
  const userRole = firestoreUser?.role;

  if (loading && !userRole) {
    return null;
  }

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    if (!userRole) return [];
    return items.filter(item => {
      if (!item.roles) return true;
      return item.roles.includes(userRole);
    });
  };

  const visibleGeneralNavItems = filterNavItems(generalNavItems);
  const visibleManagementNavItems = filterNavItems(managementNavItems);
  const visibleAdminNavItems = filterNavItems(adminNavItems);

  const renderNavItem = (item: NavItem) => (
    <SidebarMenuItem key={item.href}>
      <Link href={item.href}>
        <SidebarMenuButton
          className={cn(
            'w-full justify-start',
            pathname === item.href
              ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              : 'text-sidebar-foreground hover:bg-muted/30 hover:text-sidebar-foreground'
          )}
          isActive={pathname === item.href}
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
        {visibleGeneralNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            {visibleGeneralNavItems.map(renderNavItem)}
          </SidebarGroup>
        )}

        {visibleManagementNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            {visibleManagementNavItems.map(renderNavItem)}
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
