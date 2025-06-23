
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
  Settings,
  FolderKanban,
  ClipboardCheck,
  Briefcase,
  GraduationCap,
  ClipboardList,
  Award,
  Building,
  ClipboardSignature,
  NotebookPen,
  Banknote,
  Receipt,
  ListChecks,
  FilePenLine,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: User['role'][];
  excludeRoles?: User['role'][]; 
}

const navItems: NavItem[] = [
  // General & Core
  { href: '/dashboard', label: 'Tablero', icon: LayoutDashboard, roles: ['admin', 'teacher', 'caja', 'student', 'supervisor'] },
  { href: '/attendance-log', label: 'Registrar Asistencia', icon: ClipboardEdit, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
  { href: '/attendance-records', label: 'Ver Registros', icon: BookUser, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
  { href: '/reports', label: 'Reportes de Asistencia', icon: BarChart3, roles: ['admin', 'teacher', 'caja', 'supervisor'] },
  
  // Classroom Section
  { href: '/classroom/assignments', label: 'Admin. de Clase', icon: ClipboardSignature, roles: ['teacher', 'admin', 'supervisor'] },
  { href: '/classroom/my-tasks', label: 'Mis Tareas', icon: ClipboardList, roles: ['student'] },

  // Student specific views
  { href: '/student-grades', label: 'Mis Calificaciones', icon: ClipboardCheck, roles: ['student'] },
  
  // AI Tools
  { href: '/ai-analysis', label: 'Análisis IA (Asistencia)', icon: Brain, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/lesson-planner', label: 'Planificador IA (Lecciones)', icon: NotebookPen, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/ai-performance-report', label: 'Reporte IA (Desempeño)', icon: FilePenLine, roles: ['admin', 'teacher', 'supervisor'] },

  // Management (for Admin, Supervisor, Teacher)
  { href: '/student-management', label: 'Gestión de Estudiantes', icon: GraduationCap, roles: ['admin', 'teacher', 'supervisor', 'caja'] },
  { href: '/group-management', label: 'Gestión de Grupos', icon: FolderKanban, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/grades-management', label: 'Gestión de Calificaciones', icon: ClipboardCheck, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/partial-grades-report', label: 'Reporte de Parciales', icon: ClipboardList, roles: ['admin', 'teacher', 'supervisor'] },
  { href: '/certificate-management', label: 'Registros de Certificados', icon: Award, roles: ['admin', 'teacher', 'supervisor'] },

  // Financial
  { href: '/payment-registration', label: 'Registrar Pago', icon: Banknote, roles: ['admin', 'caja', 'supervisor'] },
  { href: '/payment-reports', label: 'Reportes de Pago', icon: Receipt, roles: ['admin', 'caja', 'supervisor'] },

  // Administration (for Admin, Supervisor)
  { href: '/user-management', label: 'Gestión de Personal', icon: Briefcase, roles: ['admin', 'supervisor'] },
  { href: '/staff-attendance-report', label: 'Reporte Asistencia (Personal)', icon: ListChecks, roles: ['admin', 'supervisor'] },
  { href: '/sede-management', label: 'Gestión de Sedes', icon: Building, roles: ['admin'] },
  { href: '/app-settings', label: 'Configuración', icon: Settings, roles: ['admin'] },
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

  const generalItems = visibleNavItems.filter(item => ['/dashboard', '/attendance-log', '/attendance-records', '/reports', '/student-grades', '/classroom/assignments', '/classroom/my-tasks'].includes(item.href));
  const aiItems = visibleNavItems.filter(item => ['/ai-analysis', '/lesson-planner', '/ai-performance-report'].includes(item.href));
  const managementItems = visibleNavItems.filter(item => ['/student-management', '/group-management', '/grades-management', '/partial-grades-report', '/certificate-management'].includes(item.href));
  const financialItems = visibleNavItems.filter(item => ['/payment-registration', '/payment-reports'].includes(item.href));
  const adminItems = visibleNavItems.filter(item => ['/user-management', '/staff-attendance-report', '/sede-management', '/app-settings'].includes(item.href));


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
            <SidebarGroupLabel>Menú</SidebarGroupLabel>
            {generalItems.map(renderNavItem)}
          </SidebarGroup>
        )}
        
        {managementItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestión</SidebarGroupLabel>
            {managementItems.map(renderNavItem)}
          </SidebarGroup>
        )}
        
        {financialItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Finanzas</SidebarGroupLabel>
            {financialItems.map(renderNavItem)}
          </SidebarGroup>
        )}
        
        {aiItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Herramientas IA</SidebarGroupLabel>
            {aiItems.map(renderNavItem)}
          </SidebarGroup>
        )}

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            {adminItems.map(renderNavItem)}
          </SidebarGroup>
        )}
      </SidebarMenu>
    </div>
  );
}
