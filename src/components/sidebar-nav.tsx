
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
  ClipboardList,
  Award,
  Building,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: User['role'][];
  excludeRoles?: User['role'][]; // New property to explicitly exclude roles
}

const navItems: NavItem[] = [
  // General & Core
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'caja', 'student', 'supervisor'] },
  { href: '/attendance-log', label: 'Log Group Attendance', icon: ClipboardEdit, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
  { href: '/attendance-records', label: 'Attendance Records', icon: BookUser, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
  { href: '/reports', label: 'Attendance Reports', icon: BarChart3, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
  { href: '/student-grades', label: 'My Grades', icon: ClipboardCheck, roles: ['student'] },
  { href: '/student-grades', label: 'Student Grades View', icon: ClipboardCheck, roles: ['admin', 'teacher', 'supervisor'], excludeRoles: ['student'] },
  { href: '/ai-analysis', label: 'AI Analysis', icon: Brain, roles: ['admin', 'teacher', 'supervisor'] },

  // Management (for Admin, Supervisor, Teacher)
  { href: '/student-management', label: 'Student Management', icon: GraduationCap, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/group-management', label: 'Group Management', icon: FolderKanban, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/grades-management', label: 'Grades Management', icon: ClipboardCheck, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/partial-grades-report', label: 'Partial Grades Report', icon: ClipboardList, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/certificate-management', label: 'Certificate Records', icon: Award, roles: ['admin', 'teacher', 'supervisor'] },

  // Administration (for Admin, Supervisor)
  { href: '/user-management', label: 'Staff Management', icon: Briefcase, roles: ['admin', 'supervisor'] },
  { href: '/sede-management', label: 'Sede Management', icon: Building, roles: ['admin'] },
  { href: '/app-settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  { href: '/qr-login-setup', label: 'QR Session Setup', icon: QrCode, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
];


export function SidebarNav() {
  const pathname = usePathname();
  const { firestoreUser, loading } = useAuth();
  const userRole = firestoreUser?.role;

  if (loading && !userRole) {
    return null;
  }

  const filterNavItemsForRole = (items: NavItem[]): NavItem[] => {
    if (!userRole) return [];
    return items.filter(item => {
      if (item.excludeRoles && item.excludeRoles.includes(userRole)) {
        return false;
      }
      if (!item.roles || item.roles.includes(userRole)) {
        return true;
      }
      return false;
    });
  };

  const visibleNavItems = filterNavItemsForRole(navItems);

  const generalItems = visibleNavItems.filter(item => ['/dashboard', '/attendance-log', '/attendance-records', '/reports', '/student-grades', '/ai-analysis', '/qr-login-setup'].includes(item.href));
  const managementItems = visibleNavItems.filter(item => ['/student-management', '/group-management', '/grades-management', '/partial-grades-report', '/certificate-management'].includes(item.href));
  const adminItems = visibleNavItems.filter(item => ['/user-management', '/sede-management', '/app-settings'].includes(item.href));


  const renderNavItem = (item: NavItem) => (
    <SidebarMenuItem key={`${item.href}-${item.label}`}>
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
        {generalItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            {generalItems.map(renderNavItem)}
          </SidebarGroup>
        )}

        {managementItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            {managementItems.map(renderNavItem)}
          </SidebarGroup>
        )}

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            {adminItems.map(renderNavItem)}
          </SidebarGroup>
        )}
      </SidebarMenu>
    </div>
  );
}
