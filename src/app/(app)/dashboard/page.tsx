
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  ClipboardEdit,
  BookUser,
  BarChart3,
  Loader2,
  FolderKanban,
  GraduationCap,
  ClipboardCheck,
  Clock,
  LogIn,
  Building,
  Briefcase,
  Sheet,
  ListTodo,
  FilePenLine,
  UserCheck2,
} from 'lucide-react';
import Image from 'next/image';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp, addDoc, limit } from 'firebase/firestore';
import type { User, Group, AttendanceRecord as StudentAttendanceRecord, TeacherAttendanceRecord, Sede, ClassroomItem, ClassroomItemSubmission } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import QRCode from 'qrcode.react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface QuickActionProps {
  href: string;
  icon: React.ElementType;
  label: string;
  bgColorClass: string;
  hoverBgColorClass: string;
  textColorClass: string;
  roles: User['role'][];
}

const QuickActionButton: React.FC<Omit<QuickActionProps, 'roles'>> = ({ href, icon: Icon, label, bgColorClass, hoverBgColorClass, textColorClass }) => (
  <Button
    asChild
    className={`w-full h-auto flex flex-col items-center justify-center p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 ${bgColorClass} ${hoverBgColorClass} ${textColorClass}`}
  >
    <Link href={href} className="flex flex-col items-center justify-center text-center">
      <Icon className="h-8 w-8 mb-2" />
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  </Button>
);

export default function DashboardPage() {
  const [stats, setStats] = useState({ students: 0, groups: 0, staff: 0 });
  const [supervisorStats, setSupervisorStats] = useState({ teachers: 0, students: 0, groups: 0 });
  
  const [teacherGroups, setTeacherGroups] = useState<Group[]>([]);
  const [supervisorSede, setSupervisorSede] = useState<Sede | null>(null);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);

  const [studentLevelDistribution, setStudentLevelDistribution] = useState<{ name: string; value: number }[]>([]);
  const [groupStudentCount, setGroupStudentCount] = useState<{ name: string; students: number }[]>([]);
  
  const [assignmentsToGrade, setAssignmentsToGrade] = useState<ClassroomItem[]>([]);
  const [pendingTasks, setPendingTasks] = useState<ClassroomItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState('');
  const { toast } = useToast();
  const { authUser, firestoreUser } = useAuth();
  
  const [selectedStaffForManualCheckIn, setSelectedStaffForManualCheckIn] = useState('');
  const [isCheckingInManually, setIsCheckingInManually] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!firestoreUser || !firestoreUser.institutionId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const institutionId = firestoreUser.institutionId;

    try {
      if (firestoreUser.role === 'admin') {
        const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId));
        const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', institutionId));
        const staffQuery = query(collection(db, 'users'), where('role', '!=', 'student'), where('institutionId', '==', institutionId));
        
        const [studentsSnapshot, groupsSnapshot, staffSnapshot] = await Promise.all([
            getDocs(studentsQuery),
            getDocs(groupsQuery),
            getDocs(staffQuery),
        ]);
        setStats({ students: studentsSnapshot.size, groups: groupsSnapshot.size, staff: staffSnapshot.size });

        const levelCounts: { [key: string]: number } = { Beginner: 0, Intermediate: 0, Advanced: 0, Other: 0 };
        studentsSnapshot.docs.forEach(doc => {
            const student = doc.data() as User;
            if (student.level) {
                levelCounts[student.level] = (levelCounts[student.level] || 0) + 1;
            } else {
                levelCounts['Other'] = (levelCounts['Other'] || 0) + 1;
            }
        });
        setStudentLevelDistribution(Object.entries(levelCounts).map(([name, value]) => ({ name, value })));

        setGroupStudentCount(groupsSnapshot.docs.map(doc => ({
            name: (doc.data() as Group).name,
            students: (doc.data() as Group).studentIds?.length || 0,
        })));
        setStaffUsers(staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));

      } else if (firestoreUser.role === 'teacher') {
        const groupsQuery = query(collection(db, 'groups'), where('teacherId', '==', firestoreUser.id), where('institutionId', '==', institutionId));
        const groupsSnapshot = await getDocs(groupsQuery);
        const fetchedTeacherGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group));
        setTeacherGroups(fetchedTeacherGroups);

        const studentIdsInTeacherGroups = new Set<string>();
        fetchedTeacherGroups.forEach(g => g.studentIds.forEach(sid => studentIdsInTeacherGroups.add(sid)));
        setStats({ students: studentIdsInTeacherGroups.size, groups: fetchedTeacherGroups.length, staff: 0 });

        // Fetch assignments to grade
        if (fetchedTeacherGroups.length > 0) {
            const groupIds = fetchedTeacherGroups.map(g => g.id);
            const itemsQuery = query(collection(db, 'classroomItems'), where('groupId', 'in', groupIds), where('itemType', '==', 'assignment'));
            const itemsSnapshot = await getDocs(itemsQuery);
            const items = itemsSnapshot.docs.map(d => ({id: d.id, ...d.data()}) as ClassroomItem);

            const submissionsQuery = query(collection(db, 'classroomItemSubmissions'), where('groupId', 'in', groupIds));
            const submissionsSnapshot = await getDocs(submissionsQuery);
            const submissions = submissionsSnapshot.docs.map(d => d.data() as ClassroomItemSubmission);
            
            const itemsToGrade = items.filter(item => {
                const itemSubmissions = submissions.filter(s => s.itemId === item.id);
                if (itemSubmissions.length === 0) return false;
                const hasUngraded = itemSubmissions.some(s => s.grade == null);
                return hasUngraded;
            });
            setAssignmentsToGrade(itemsToGrade);
        }

      } else if (firestoreUser.role === 'supervisor' && firestoreUser.sedeId) {
          const sedeQuery = query(collection(db, 'sedes'), where('__name__', '==', firestoreUser.sedeId), where('institutionId', '==', institutionId), limit(1));
          const teachersInSedeQuery = query(collection(db, 'users'), where('role', '==', 'teacher'), where('sedeId', '==', firestoreUser.sedeId), where('institutionId', '==', institutionId));
          const groupsInSedeQuery = query(collection(db, 'groups'), where('sedeId', '==', firestoreUser.sedeId), where('institutionId', '==', institutionId));
          const studentsInSedeQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('sedeId', '==', firestoreUser.sedeId), where('institutionId', '==', institutionId));
          
          const [sedeDocSnapshot, teachersSnapshot, groupsSnapshot, studentsInSedeSnapshot] = await Promise.all([
            getDocs(sedeQuery),
            getDocs(teachersInSedeQuery),
            getDocs(groupsInSedeQuery),
            getDocs(studentsInSedeQuery)
          ]);

          if (!sedeDocSnapshot.empty) setSupervisorSede(sedeDocSnapshot.docs[0].data() as Sede);
          
          setSupervisorStats({ teachers: teachersSnapshot.size, students: studentsInSedeSnapshot.size, groups: groupsSnapshot.size });

          const levelCounts: { [key: string]: number } = { Beginner: 0, Intermediate: 0, Advanced: 0, Other: 0 };
          studentsInSedeSnapshot.docs.forEach(doc => {
              const student = doc.data() as User;
              if (student.level) {
                  levelCounts[student.level] = (levelCounts[student.level] || 0) + 1;
              } else {
                  levelCounts['Other'] = (levelCounts['Other'] || 0) + 1;
              }
          });
          setStudentLevelDistribution(Object.entries(levelCounts).map(([name, value]) => ({ name, value })));

          setGroupStudentCount(groupsSnapshot.docs.map(doc => ({
              name: (doc.data() as Group).name,
              students: (doc.data() as Group).studentIds?.length || 0,
          })));

          const fetchedTeachers = teachersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
          setStaffUsers([firestoreUser, ...fetchedTeachers]);

      } else if (firestoreUser.role === 'student') {
        const studentGroupsQuery = query(collection(db, 'groups'), where('studentIds', 'array-contains', firestoreUser.id), where('institutionId', '==', institutionId));
        const studentGroupsSnapshot = await getDocs(studentGroupsQuery);
        const studentGroupIds = studentGroupsSnapshot.docs.map(d => d.id);
        
        if (studentGroupIds.length > 0) {
            const itemsQuery = query(collection(db, 'classroomItems'), where('groupId', 'in', studentGroupIds), where('status', '==', 'published'));
            const studentSubmissionsQuery = query(collection(db, 'classroomItemSubmissions'), where('studentId', '==', firestoreUser.id));

            const [itemsSnapshot, submissionsSnapshot] = await Promise.all([getDocs(itemsQuery), getDocs(studentSubmissionsQuery)]);
            
            const submittedItemIds = new Set(submissionsSnapshot.docs.map(d => d.data().itemId));
            
            const pending = itemsSnapshot.docs
                .map(d => ({id: d.id, ...d.data()}) as ClassroomItem)
                .filter(item => item.itemType === 'assignment' && !submittedItemIds.has(item.id))
                .sort((a,b) => (a.dueDate && b.dueDate) ? (parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime()) : (a.dueDate ? -1 : 1));
            
            setPendingTasks(pending);
        }
      }

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast({ title: 'Error', description: 'Could not load dashboard statistics.', variant: 'destructive' });
    }
    setIsLoading(false);
  }, [firestoreUser, toast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const renderStatCard = (title: string, value: number | string, Icon: React.ElementType, description: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{value}</div>}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  const allQuickActions: QuickActionProps[] = [
    { href: "/attendance-log", icon: ClipboardEdit, label: "Registrar Asistencia", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'teacher', 'caja', 'supervisor'] },
    { href: "/attendance-records", icon: BookUser, label: "Ver Registros", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'teacher', 'caja', 'supervisor'] },
    { href: "/student-management", icon: GraduationCap, label: "Estudiantes", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'teacher', 'supervisor', 'caja'] },
    { href: "/group-management", icon: FolderKanban, label: "Grupos", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'teacher', 'supervisor'] },
    { href: "/grades-management", icon: ClipboardCheck, label: "Calificaciones", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'teacher', 'supervisor'] },
    { href: "/reports", icon: BarChart3, label: "Reportes", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'teacher', 'caja', 'supervisor'] },
    { href: "/student-grades", icon: ClipboardCheck, label: "Mis Calificaciones", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['student'] },
    { href: "/user-management", icon: Briefcase, label: "Personal", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin', 'supervisor'] },
    { href: "/sede-management", icon: Building, label: "Sedes", bgColorClass: "bg-primary", hoverBgColorClass: "hover:bg-primary/90", textColorClass: "text-primary-foreground", roles: ['admin'] },
  ];

  const visibleQuickActions = useMemo(() => {
    if (!firestoreUser?.role) return [];
    return allQuickActions.filter(action => action.roles.includes(firestoreUser.role));
  }, [firestoreUser?.role]);

  const showStaffAttendancePanel = firestoreUser && ['admin', 'supervisor'].includes(firestoreUser.role);
  
  const qrPayload = useMemo(() => {
    if (!firestoreUser) return '';
    return JSON.stringify({
      type: "teacher-attendance",
      institutionId: firestoreUser.institutionId,
      sedeId: firestoreUser.role === 'supervisor' ? firestoreUser.sedeId : null,
      date: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    });
  }, [firestoreUser]);

  useEffect(() => {
    const registerSupervisorAttendance = async () => {
      if (firestoreUser?.role === 'supervisor' && qrPayload) {
        const todayStr = new Date().toISOString().split('T')[0];
        const attendanceRef = collection(db, 'teacherAttendanceRecords');
        const q = query(
          attendanceRef,
          where('teacherId', '==', firestoreUser.id),
          where('date', '==', todayStr),
          where('institutionId', '==', firestoreUser.institutionId)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          const newRecord: Omit<TeacherAttendanceRecord, 'id'> = {
            teacherId: firestoreUser.id,
            teacherName: firestoreUser.name,
            timestamp: new Date().toISOString(),
            date: todayStr,
            attendanceCodeUsed: 'QR_GENERATION_AUTO',
            institutionId: firestoreUser.institutionId,
          };
          await addDoc(attendanceRef, newRecord);
          toast({
            title: 'Tu Asistencia ha sido Registrada',
            description: 'Se registró tu llegada automáticamente al generar el código QR.',
          });
        }
      }
    };

    if (showStaffAttendancePanel) {
      registerSupervisorAttendance();
    }
  }, [qrPayload, firestoreUser, showStaffAttendancePanel, toast]);

  const handleManualCheckIn = async () => {
    if (!selectedStaffForManualCheckIn) {
        toast({ title: 'Selecciona un miembro del personal', variant: 'destructive'});
        return;
    }
    if (!firestoreUser) return;
    setIsCheckingInManually(true);
    
    const staffMember = staffUsers.find(s => s.id === selectedStaffForManualCheckIn);
    if (!staffMember) {
        toast({ title: 'Miembro del personal no encontrado', variant: 'destructive'});
        setIsCheckingInManually(false);
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    const attendanceRef = collection(db, 'teacherAttendanceRecords');
    const q = query(
        attendanceRef, 
        where('teacherId', '==', staffMember.id),
        where('date', '==', todayStr),
        where('institutionId', '==', firestoreUser.institutionId)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        toast({ title: 'Asistencia ya registrada', description: `${staffMember.name} ya ha registrado su asistencia hoy.`, variant: 'default'});
        setIsCheckingInManually(false);
        return;
    }

    try {
        const newRecord: Omit<TeacherAttendanceRecord, 'id'> = {
            teacherId: staffMember.id,
            teacherName: staffMember.name,
            timestamp: new Date().toISOString(),
            date: todayStr,
            attendanceCodeUsed: `MANUAL_BY_${firestoreUser.username}`,
            institutionId: firestoreUser.institutionId,
        };
        await addDoc(collection(db, 'teacherAttendanceRecords'), newRecord);
        toast({ title: 'Asistencia Registrada', description: `Se registró la llegada de ${staffMember.name} manualmente.` });
        setSelectedStaffForManualCheckIn('');
    } catch(error) {
        toast({ title: 'Error', description: 'No se pudo registrar la asistencia manual.', variant: 'destructive'});
    }
    
    setIsCheckingInManually(false);
  };


  const levelChartConfig = {
    value: {
      label: "Estudiantes",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig

  const groupChartConfig = {
    students: {
      label: "Estudiantes",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Bienvenido a AttendX</h1>
      {firestoreUser && (
        <p className="text-xs text-muted-foreground text-center bg-muted p-2 rounded-md">
          Sesión iniciada como: {firestoreUser.email} (Rol: {firestoreUser.role})
          {firestoreUser.role === 'teacher' && teacherGroups.length > 0 && `, gestionando ${teacherGroups.length} grupo(s)`}
          {firestoreUser.role === 'supervisor' && supervisorSede && `, supervisando Sede: ${supervisorSede.name}`}
          {firestoreUser.institutionId && ` (ID Institución: ${firestoreUser.institutionId.substring(0,6)}...)`}
        </p>
      )}

      {/* Role-Specific Panels */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {firestoreUser?.role === 'admin' && (
          <>
            {renderStatCard("Total de Estudiantes", stats.students, Users, "Actualmente inscritos en su institución")}
            {renderStatCard("Grupos Activos", stats.groups, FolderKanban, "En todos los programas de su institución")}
            {renderStatCard("Miembros del Personal", stats.staff, Briefcase, "Personal total en su institución")}
          </>
        )}
        {firestoreUser?.role === 'teacher' && (
          <>
            {renderStatCard("Mis Estudiantes", stats.students, Users, "En todos sus grupos asignados")}
            {renderStatCard("Mis Grupos", stats.groups, FolderKanban, "Actualmente asignados a usted")}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tareas por Calificar</CardTitle>
                <FilePenLine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> :
                  assignmentsToGrade.length > 0 ? (
                    <div className="space-y-2">
                      {assignmentsToGrade.slice(0, 3).map(item => (
                        <p key={item.id} className="text-sm truncate">
                          <Link href="/classroom/assignments" className="hover:underline">{item.title}</Link>
                        </p>
                      ))}
                      <Button asChild variant="link" className="p-0 h-auto text-xs">
                        <Link href="/classroom/assignments">Ver todas...</Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No hay tareas pendientes de revisar.</p>
                  )
                }
              </CardContent>
            </Card>
          </>
        )}
         {firestoreUser?.role === 'supervisor' && supervisorSede && (
          <>
            {renderStatCard(`Maestros en ${supervisorSede.name}`, supervisorStats.teachers, Briefcase, "Personal en su Sede")}
            {renderStatCard(`Estudiantes en ${supervisorSede.name}`, supervisorStats.students, Users, "Inscritos en su Sede")}
            {renderStatCard(`Grupos en ${supervisorSede.name}`, supervisorStats.groups, FolderKanban, "Activos en su Sede")}
          </>
        )}
         {firestoreUser?.role === 'student' && (
            <Card className="col-span-1 lg:col-span-3">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-primary"/>Mis Tareas Pendientes</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> :
                     pendingTasks.length > 0 ? (
                        <ul className="space-y-2">
                            {pendingTasks.slice(0, 5).map(task => (
                                <li key={task.id} className="text-sm flex justify-between items-center">
                                    <Link href="/classroom/my-tasks" className="hover:underline">{task.title}</Link>
                                    {task.dueDate && <span className="text-xs text-muted-foreground">Vence {formatDistanceToNow(parseISO(task.dueDate), { addSuffix: true })}</span>}
                                </li>
                            ))}
                            {pendingTasks.length > 5 && (
                                <li>
                                    <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                        <Link href="/classroom/my-tasks">...y {pendingTasks.length - 5} más</Link>
                                    </Button>
                                </li>
                            )}
                        </ul>
                     ) : (
                        <p className="text-sm text-muted-foreground">No tiene tareas pendientes. ¡Buen trabajo!</p>
                     )
                    }
                </CardContent>
            </Card>
         )}
         {firestoreUser?.role === 'caja' && (
           <div className="grid gap-4 md:grid-cols-1 col-span-1 lg:col-span-3">
              {renderStatCard("Acceso al Sistema", "Listo", Sheet, "Funciones de Caja activadas")}
           </div>
        )}
      </div>

       {/* Charts for Admin and Supervisor */}
      {(firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor') && !isLoading && (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Distribución de Estudiantes por Nivel</CardTitle>
                    <CardDescription>
                        {firestoreUser?.role === 'supervisor' ? `Para Sede: ${supervisorSede?.name}` : 'Para toda la institución'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={levelChartConfig} className="min-h-[200px] w-full">
                        <BarChart accessibilityLayer data={studentLevelDistribution}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="name"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                tickFormatter={(value) => value.slice(0, 3)}
                            />
                            <YAxis />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Estudiantes por Grupo</CardTitle>
                     <CardDescription>
                        {firestoreUser?.role === 'supervisor' ? `Para Sede: ${supervisorSede?.name}` : 'Para toda la institución'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <ChartContainer config={groupChartConfig} className="min-h-[200px] w-full">
                        <BarChart accessibilityLayer data={groupStudentCount}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="name"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                tickFormatter={(value) => value.slice(0, 8) + (value.length > 8 ? '...' : '')}
                            />
                            <YAxis />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="students" fill="var(--color-students)" radius={4} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
      )}


      {/* Quick Actions */}
      {visibleQuickActions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Acciones Rápidas</CardTitle>
              <CardDescription>Acceda fácilmente a las tareas comunes relevantes para su rol.</CardDescription>
            </CardHeader>
            <CardContent className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-${Math.min(visibleQuickActions.length, 6)} gap-4`}>
              {visibleQuickActions.map(action => (
                <QuickActionButton key={action.href} {...action} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Staff Attendance Panel */}
      {showStaffAttendancePanel && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Registro de Llegada del Personal (QR)
              </CardTitle>
              <CardDescription>Muestra este código QR para que el personal registre su llegada escaneándolo con su dispositivo.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center space-y-4">
              <div className="text-3xl font-bold text-center text-primary">
                {currentTime || <Loader2 className="h-7 w-7 animate-spin inline-block" />}
              </div>
              {isLoading ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : (
                <div className="bg-white p-4 rounded-lg shadow-md">
                    <QRCode value={qrPayload} size={256} />
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Este código es para el {new Date().toLocaleDateString('es-MX')}
                {firestoreUser.role === 'supervisor' && supervisorSede ? ` en la Sede ${supervisorSede.name}` : ''}.
              </p>
            </CardContent>
          </Card>

           <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserCheck2 className="h-5 w-5 text-primary" />Registro Manual de Personal</CardTitle>
                <CardDescription>Si un miembro del personal no puede escanear, regístralo aquí.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-4">
                <div className="flex w-full items-center space-x-2">
                    <Select value={selectedStaffForManualCheckIn} onValueChange={setSelectedStaffForManualCheckIn} disabled={staffUsers.length === 0}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar miembro del personal..." /></SelectTrigger>
                        <SelectContent>
                            {staffUsers.map(staff => (
                                <SelectItem key={staff.id} value={staff.id}>{staff.name} ({staff.role})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleManualCheckIn} disabled={isCheckingInManually || !selectedStaffForManualCheckIn}>
                        {isCheckingInManually && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Registrar
                    </Button>
                </div>
                 {staffUsers.length === 0 && !isLoading && (
                    <p className="text-xs text-muted-foreground">
                        {firestoreUser?.role === 'supervisor' ? "No hay maestros en tu Sede para registrar." : "No hay personal para registrar."}
                    </p>
                 )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
