
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
  FilePenLine
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
  const [stats, setStats] = useState({ students: 0, groups: 0 });
  const [supervisorStats, setSupervisorStats] = useState({ teachers: 0, students: 0, groups: 0 });
  
  const [teacherGroups, setTeacherGroups] = useState<Group[]>([]);
  const [supervisorSede, setSupervisorSede] = useState<Sede | null>(null);

  const [studentLevelDistribution, setStudentLevelDistribution] = useState<{ name: string; value: number }[]>([]);
  const [groupStudentCount, setGroupStudentCount] = useState<{ name: string; students: number }[]>([]);
  
  const [assignmentsToGrade, setAssignmentsToGrade] = useState<ClassroomItem[]>([]);
  const [pendingTasks, setPendingTasks] = useState<ClassroomItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState('');
  const [teacherAttendanceCode, setTeacherAttendanceCode] = useState('');
  const [isSubmittingTeacherAttendance, setIsSubmittingTeacherAttendance] = useState(false);
  const { toast } = useToast();
  const { authUser, firestoreUser } = useAuth();

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
        
        const [studentsSnapshot, groupsSnapshot] = await Promise.all([
            getDocs(studentsQuery),
            getDocs(groupsQuery),
        ]);
        setStats({ students: studentsSnapshot.size, groups: groupsSnapshot.size });

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


      } else if (firestoreUser.role === 'teacher') {
        const groupsQuery = query(collection(db, 'groups'), where('teacherId', '==', firestoreUser.id), where('institutionId', '==', institutionId));
        const groupsSnapshot = await getDocs(groupsQuery);
        const fetchedTeacherGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group));
        setTeacherGroups(fetchedTeacherGroups);

        const studentIdsInTeacherGroups = new Set<string>();
        fetchedTeacherGroups.forEach(g => g.studentIds.forEach(sid => studentIdsInTeacherGroups.add(sid)));
        setStats({ students: studentIdsInTeacherGroups.size, groups: fetchedTeacherGroups.length });

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
          const sedeQuery = query(collection(db, 'sedes'), where('id', '==', firestoreUser.sedeId), where('institutionId', '==', institutionId), limit(1));
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

  const handleTeacherAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestoreUser?.institutionId) {
        toast({ title: 'Error', description: 'Institution context is missing for this action.', variant: 'destructive' });
        return;
    }
    const canSubmitAttendance = firestoreUser?.role === 'admin' || firestoreUser?.role === 'teacher' || firestoreUser?.role === 'supervisor';
    if (!canSubmitAttendance) {
      toast({ title: 'Acción no Permitida', description: 'Solo administradores, supervisores o docentes pueden operar este registro.', variant: 'destructive' });
      return;
    }
    if (!teacherAttendanceCode.trim()) {
      toast({ title: 'Error', description: 'Por favor, ingrese el código de asistencia del docente.', variant: 'destructive' });
      return;
    }
    setIsSubmittingTeacherAttendance(true);
    try {
      const usersWithCodeQuery = query(
        collection(db, 'users'),
        where('attendanceCode', '==', teacherAttendanceCode.trim()),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const usersSnapshot = await getDocs(usersWithCodeQuery);

      if (usersSnapshot.empty) {
        toast({ title: 'Código Inválido', description: 'El código de asistencia no es válido o no pertenece a un usuario con código asignado en esta institución.', variant: 'destructive' });
      } else {
        const userDoc = usersSnapshot.docs[0];
        const userData = userDoc.data() as User;

        if (userData.role !== 'teacher' && userData.role !== 'admin' && userData.role !== 'supervisor') {
            toast({ title: 'Código Inválido', description: 'Este código pertenece a un usuario que no es docente, supervisor ni administrador.', variant: 'destructive' });
            setIsSubmittingTeacherAttendance(false);
            return;
        }
        const newRecord: Omit<TeacherAttendanceRecord, 'id'> = {
          teacherId: userDoc.id,
          teacherName: userData.name,
          timestamp: new Date().toISOString(),
          attendanceCodeUsed: teacherAttendanceCode.trim(),
          institutionId: userData.institutionId,
        };
        await addDoc(collection(db, 'teacherAttendanceRecords'), newRecord);
        toast({ title: `¡Bienvenido, ${userData.name}!`, description: 'Tu asistencia ha sido registrada.' });
        setTeacherAttendanceCode('');
      }
    } catch (error: any) {
      console.error("Error registering teacher attendance:", error);
      toast({ title: 'Error de Registro', description: `Ocurrió un error: ${error.message || 'Inténtalo de nuevo.'}`, variant: 'destructive' });
    } finally {
      setIsSubmittingTeacherAttendance(false);
    }
  };

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
    { href: "/attendance-log", icon: ClipboardEdit, label: "Log Attendance", bgColorClass: "bg-blue-500", hoverBgColorClass: "hover:bg-blue-600", textColorClass: "text-white", roles: ['admin', 'teacher', 'caja', 'supervisor'] },
    { href: "/attendance-records", icon: BookUser, label: "View Records", bgColorClass: "bg-green-500", hoverBgColorClass: "hover:bg-green-600", textColorClass: "text-white", roles: ['admin', 'teacher', 'caja', 'supervisor'] },
    { href: "/student-management", icon: GraduationCap, label: "Students", bgColorClass: "bg-purple-500", hoverBgColorClass: "hover:bg-purple-600", textColorClass: "text-white", roles: ['admin', 'teacher', 'supervisor'] },
    { href: "/group-management", icon: FolderKanban, label: "Groups", bgColorClass: "bg-yellow-400", hoverBgColorClass: "hover:bg-yellow-500", textColorClass: "text-yellow-900", roles: ['admin', 'teacher', 'supervisor'] },
    { href: "/grades-management", icon: ClipboardCheck, label: "Grades", bgColorClass: "bg-pink-500", hoverBgColorClass: "hover:bg-pink-600", textColorClass: "text-white", roles: ['admin', 'teacher', 'supervisor'] },
    { href: "/reports", icon: BarChart3, label: "Reports", bgColorClass: "bg-teal-500", hoverBgColorClass: "hover:bg-teal-600", textColorClass: "text-white", roles: ['admin', 'teacher', 'caja', 'supervisor'] },
    { href: "/student-grades", icon: ClipboardCheck, label: "My Grades", bgColorClass: "bg-blue-500", hoverBgColorClass: "hover:bg-blue-600", textColorClass: "text-white", roles: ['student'] },
    { href: "/user-management", icon: Briefcase, label: "Staff", bgColorClass: "bg-indigo-500", hoverBgColorClass: "hover:bg-indigo-600", textColorClass: "text-white", roles: ['admin', 'supervisor'] },
    { href: "/sede-management", icon: Building, label: "Sedes", bgColorClass: "bg-cyan-500", hoverBgColorClass: "hover:bg-cyan-600", textColorClass: "text-white", roles: ['admin'] },
  ];

  const visibleQuickActions = useMemo(() => {
    if (!firestoreUser?.role) return [];
    return allQuickActions.filter(action => action.roles.includes(firestoreUser.role));
  }, [firestoreUser?.role]);

  const showTeacherAttendancePanel = firestoreUser && ['admin', 'teacher', 'supervisor'].includes(firestoreUser.role);
  
  const levelChartConfig = {
    value: {
      label: "Students",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig

  const groupChartConfig = {
    students: {
      label: "Students",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Welcome to SERVEX</h1>
      {firestoreUser && (
        <p className="text-xs text-muted-foreground text-center bg-muted p-2 rounded-md">
          Logged in as: {firestoreUser.email} (Role: {firestoreUser.role})
          {firestoreUser.role === 'teacher' && teacherGroups.length > 0 && `, Managing ${teacherGroups.length} group(s)`}
          {firestoreUser.role === 'supervisor' && supervisorSede && `, Supervising Sede: ${supervisorSede.name}`}
          {firestoreUser.institutionId && ` (Institution ID: ${firestoreUser.institutionId.substring(0,6)}...)`}
        </p>
      )}

      {/* Role-Specific Panels */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {firestoreUser?.role === 'admin' && (
          <>
            {renderStatCard("Total Students", stats.students, Users, "Currently enrolled in your institution")}
            {renderStatCard("Active Groups", stats.groups, FolderKanban, "Across all programs in your institution")}
            {renderStatCard("Staff Members", (staffUsers.length > 0 ? staffUsers.length : '...'), Briefcase, "Total staff in your institution")}
          </>
        )}
        {firestoreUser?.role === 'teacher' && (
          <>
            {renderStatCard("My Students", stats.students, Users, "Across your assigned groups")}
            {renderStatCard("My Groups", stats.groups, FolderKanban, "Currently assigned to you")}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assignments to Grade</CardTitle>
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
                        <Link href="/classroom/assignments">View all...</Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No assignments pending review.</p>
                  )
                }
              </CardContent>
            </Card>
          </>
        )}
         {firestoreUser?.role === 'supervisor' && supervisorSede && (
          <>
            {renderStatCard(`Teachers in ${supervisorSede.name}`, supervisorStats.teachers, Briefcase, "Staff in your Sede")}
            {renderStatCard(`Students in ${supervisorSede.name}`, supervisorStats.students, Users, "Enrolled in your Sede")}
            {renderStatCard(`Groups in ${supervisorSede.name}`, supervisorStats.groups, FolderKanban, "Active in your Sede")}
          </>
        )}
         {firestoreUser?.role === 'student' && (
            <Card className="col-span-1 lg:col-span-3">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-primary"/>My Pending Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> :
                     pendingTasks.length > 0 ? (
                        <ul className="space-y-2">
                            {pendingTasks.slice(0, 5).map(task => (
                                <li key={task.id} className="text-sm flex justify-between items-center">
                                    <Link href="/classroom/my-tasks" className="hover:underline">{task.title}</Link>
                                    {task.dueDate && <span className="text-xs text-muted-foreground">Due {formatDistanceToNow(parseISO(task.dueDate), { addSuffix: true })}</span>}
                                </li>
                            ))}
                            {pendingTasks.length > 5 && (
                                <li>
                                    <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                        <Link href="/classroom/my-tasks">...and {pendingTasks.length - 5} more</Link>
                                    </Button>
                                </li>
                            )}
                        </ul>
                     ) : (
                        <p className="text-sm text-muted-foreground">You have no pending tasks. Great job!</p>
                     )
                    }
                </CardContent>
            </Card>
         )}
         {firestoreUser?.role === 'caja' && (
           <div className="grid gap-4 md:grid-cols-1 col-span-1 lg:col-span-3">
              {renderStatCard("System Access", "Ready", Sheet, "Caja functions enabled")}
           </div>
        )}
      </div>

       {/* Charts for Admin and Supervisor */}
      {(firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor') && !isLoading && (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Student Distribution by Level</CardTitle>
                    <CardDescription>
                        {firestoreUser?.role === 'supervisor' ? `For Sede: ${supervisorSede?.name}` : 'For the entire institution'}
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
                    <CardTitle>Students per Group</CardTitle>
                     <CardDescription>
                        {firestoreUser?.role === 'supervisor' ? `For Sede: ${supervisorSede?.name}` : 'For the entire institution'}
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
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Easily access common tasks relevant to your role.</CardDescription>
            </CardHeader>
            <CardContent className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-${Math.min(visibleQuickActions.length, 6)} gap-4`}>
              {visibleQuickActions.map(action => (
                <QuickActionButton key={action.href} {...action} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Teacher Attendance Panel */}
      {showTeacherAttendancePanel && (
        <div className="grid gap-4 md:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Staff Arrival Log
              </CardTitle>
              <CardDescription>Staff members enter their attendance code here upon arrival.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-center mb-3 text-primary">
                {currentTime || <Loader2 className="h-7 w-7 animate-spin inline-block" />}
              </div>
              <form onSubmit={handleTeacherAttendanceSubmit} className="space-y-3">
                <div>
                  <Label htmlFor="teacherAttendanceCode" className="sr-only">Attendance Code</Label>
                  <Input
                    id="teacherAttendanceCode"
                    type="password"
                    placeholder="Enter attendance code"
                    value={teacherAttendanceCode}
                    onChange={(e) => setTeacherAttendanceCode(e.target.value)}
                    className="text-center"
                    disabled={isSubmittingTeacherAttendance}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmittingTeacherAttendance || !teacherAttendanceCode.trim() || !firestoreUser || !['admin','teacher','supervisor'].includes(firestoreUser.role) }>
                  {isSubmittingTeacherAttendance ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  Register Arrival
                </Button>
              </form>
               { authUser && firestoreUser && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                      Operating as: {firestoreUser.email} ({firestoreUser.name || 'Name not set'})
                  </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Academy Overview Image - Show for roles that are not 'student' or 'caja' */}
      {firestoreUser && !['student', 'caja'].includes(firestoreUser.role) && (
        <Card className="hidden md:flex md:flex-col">
          <CardHeader>
            <CardTitle>Academy Overview</CardTitle>
            <CardDescription>A glimpse into our learning environment.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <div className="aspect-video w-full overflow-hidden rounded-md">
              <Image
                src="https://placehold.co/600x400.png"
                alt="Academy classroom"
                width={600}
                height={400}
                className="object-cover w-full h-full"
                data-ai-hint="classroom students"
              />
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
