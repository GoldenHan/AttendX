
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  BarChartBig,
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
  Sheet, // For generic icon
} from 'lucide-react';
import Image from 'next/image';
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp, addDoc, limit } from 'firebase/firestore';
import type { User, Group, AttendanceRecord as StudentAttendanceRecord, TeacherAttendanceRecord, Sede } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

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
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const [attendanceToday, setAttendanceToday] = useState(0);
  const [teacherGroups, setTeacherGroups] = useState<Group[]>([]);
  const [supervisorSede, setSupervisorSede] = useState<Sede | null>(null);
  const [supervisorStats, setSupervisorStats] = useState({ teachers: 0, students: 0, groups: 0 });

  const [isLoadingStats, setIsLoadingStats] = useState(true);

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

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!firestoreUser || !firestoreUser.institutionId) {
        setIsLoadingStats(false);
        return;
      }
      setIsLoadingStats(true);
      const institutionId = firestoreUser.institutionId;

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        if (firestoreUser.role === 'admin') {
          const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId));
          const studentsSnapshot = await getDocs(studentsQuery);
          setTotalStudents(studentsSnapshot.size);

          const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', institutionId));
          const groupsSnapshot = await getDocs(groupsQuery);
          setTotalGroups(groupsSnapshot.size);

          const studentAttendanceQuery = query(
            collection(db, 'attendanceRecords'),
            where('status', '==', 'present'),
            where('institutionId', '==', institutionId)
          );
          const studentAttendanceSnapshot = await getDocs(studentAttendanceQuery);
          let presentTodayCount = 0;
          studentAttendanceSnapshot.docs.forEach(docSnap => {
            const record = docSnap.data() as StudentAttendanceRecord;
            const recordDate = new Date(record.timestamp);
            if (recordDate >= today && recordDate < tomorrow) {
              presentTodayCount++;
            }
          });
          setAttendanceToday(presentTodayCount);
        }

        if (firestoreUser.role === 'teacher') {
          const groupsQuery = query(collection(db, 'groups'), 
            where('teacherId', '==', firestoreUser.id),
            where('institutionId', '==', institutionId)
          );
          const groupsSnapshot = await getDocs(groupsQuery);
          const fetchedTeacherGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group));
          setTeacherGroups(fetchedTeacherGroups);
          const studentIdsInTeacherGroups = new Set<string>();
          fetchedTeacherGroups.forEach(g => g.studentIds.forEach(sid => studentIdsInTeacherGroups.add(sid)));
          setTotalStudents(studentIdsInTeacherGroups.size);
          setTotalGroups(fetchedTeacherGroups.length);
        }

        if (firestoreUser.role === 'supervisor' && firestoreUser.sedeId) {
          const sedeQuery = query(collection(db, 'sedes'), 
            where('id', '==', firestoreUser.sedeId), 
            where('institutionId', '==', institutionId), // Ensure Sede is from same institution
            limit(1)
          );
          const sedeDocSnapshot = await getDocs(sedeQuery);
          if (!sedeDocSnapshot.empty) setSupervisorSede(sedeDocSnapshot.docs[0].data() as Sede);

          const teachersInSedeQuery = query(collection(db, 'users'), 
            where('role', '==', 'teacher'), 
            where('sedeId', '==', firestoreUser.sedeId),
            where('institutionId', '==', institutionId)
          );
          const teachersSnapshot = await getDocs(teachersInSedeQuery);

          const groupsInSedeQuery = query(collection(db, 'groups'), 
            where('sedeId', '==', firestoreUser.sedeId),
            where('institutionId', '==', institutionId)
          );
          const groupsSnapshot = await getDocs(groupsInSedeQuery);
          const studentIdsInSedeGroups = new Set<string>();
          groupsSnapshot.docs.forEach(gDoc => (gDoc.data() as Group).studentIds.forEach(sid => studentIdsInSedeGroups.add(sid)));

          setSupervisorStats({
            teachers: teachersSnapshot.size,
            students: studentIdsInSedeGroups.size,
            groups: groupsSnapshot.size,
          });
        }

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        toast({ title: 'Error', description: 'Could not load dashboard statistics.', variant: 'destructive' });
      }
      setIsLoadingStats(false);
    };

    fetchDashboardData();
  }, [firestoreUser, toast]);

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
        where('institutionId', '==', firestoreUser.institutionId) // Ensure code is from same institution
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
          institutionId: userData.institutionId, // Save the institutionId of the staff member
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
        {isLoadingStats ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{value}</div>}
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

      {/* Role-Specific Stats */}
      {firestoreUser?.role === 'admin' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {renderStatCard("Total Students", totalStudents, Users, "Currently enrolled in your institution")}
          {renderStatCard("Active Groups", totalGroups, FolderKanban, "Across all programs in your institution")}
          {renderStatCard("Student Attendance Today", attendanceToday, BarChartBig, "Students marked present in your institution")}
        </div>
      )}
      {firestoreUser?.role === 'teacher' && (
        <div className="grid gap-4 md:grid-cols-2">
          {renderStatCard("My Students", totalStudents, Users, "Across your assigned groups")}
          {renderStatCard("My Groups", totalGroups, FolderKanban, "Currently assigned to you")}
        </div>
      )}
       {firestoreUser?.role === 'supervisor' && supervisorSede && (
        <div className="grid gap-4 md:grid-cols-3">
          {renderStatCard(`Teachers in ${supervisorSede.name}`, supervisorStats.teachers, Briefcase, "Staff in your Sede")}
          {renderStatCard(`Students in ${supervisorSede.name}`, supervisorStats.students, Users, "Enrolled in your Sede")}
          {renderStatCard(`Groups in ${supervisorSede.name}`, supervisorStats.groups, FolderKanban, "Active in your Sede")}
        </div>
      )}
       {firestoreUser?.role === 'student' && (
        <Card>
          <CardHeader><CardTitle>My Academic Overview</CardTitle></CardHeader>
          <CardContent>
            <p>Level: {firestoreUser.level || 'N/A'}</p>
            {/* TODO: Fetch and display current group name if assigned */}
          </CardContent>
        </Card>
      )}
       {firestoreUser?.role === 'caja' && (
         <div className="grid gap-4 md:grid-cols-1">
            {renderStatCard("System Access", "Ready", Sheet, "Caja functions enabled")}
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

