
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
  Clock, // Added for Teacher Attendance
  LogIn, // Added for Teacher Attendance Button
} from 'lucide-react';
import Image from 'next/image';
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp, addDoc } from 'firebase/firestore';
import type { User, Group, AttendanceRecord as StudentAttendanceRecord, TeacherAttendanceRecord } from '@/types'; // Added TeacherAttendanceRecord
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface QuickActionProps {
  href: string;
  icon: React.ElementType;
  label: string;
  bgColorClass: string;
  hoverBgColorClass: string;
  textColorClass: string;
}

const QuickActionButton: React.FC<QuickActionProps> = ({ href, icon: Icon, label, bgColorClass, hoverBgColorClass, textColorClass }) => (
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
  const [isLoading, setIsLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState('');
  const [teacherAttendanceCode, setTeacherAttendanceCode] = useState('');
  const [isSubmittingTeacherAttendance, setIsSubmittingTeacherAttendance] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        setTotalStudents(studentsSnapshot.size);

        const groupsSnapshot = await getDocs(collection(db, 'groups'));
        setTotalGroups(groupsSnapshot.size);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const studentAttendanceQuery = query(
          collection(db, 'attendanceRecords'),
          where('status', '==', 'present')
        );
        const studentAttendanceSnapshot = await getDocs(studentAttendanceQuery);
        let presentTodayCount = 0;
        studentAttendanceSnapshot.docs.forEach(doc => {
          const record = doc.data() as StudentAttendanceRecord;
          const recordDate = new Date(record.timestamp);
          if (recordDate >= today && recordDate < tomorrow) {
            presentTodayCount++;
          }
        });
        setAttendanceToday(presentTodayCount);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      }
      setIsLoading(false);
    };

    fetchDashboardData();
  }, []);

  const handleTeacherAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherAttendanceCode.trim()) {
      toast({ title: 'Error', description: 'Por favor, ingrese su código de asistencia.', variant: 'destructive' });
      return;
    }
    setIsSubmittingTeacherAttendance(true);
    try {
      const teachersQuery = query(
        collection(db, 'users'),
        where('role', '==', 'teacher'),
        where('attendanceCode', '==', teacherAttendanceCode.trim())
      );
      const teachersSnapshot = await getDocs(teachersQuery);

      if (teachersSnapshot.empty) {
        toast({ title: 'Código Inválido', description: 'El código de asistencia no es válido o no pertenece a un docente.', variant: 'destructive' });
      } else {
        const teacherDoc = teachersSnapshot.docs[0];
        const teacherData = teacherDoc.data() as User;

        const newRecord: Omit<TeacherAttendanceRecord, 'id'> = {
          teacherId: teacherDoc.id,
          teacherName: teacherData.name,
          timestamp: new Date().toISOString(),
          attendanceCodeUsed: teacherAttendanceCode.trim(),
        };
        await addDoc(collection(db, 'teacherAttendanceRecords'), newRecord);
        toast({ title: `¡Bienvenido, ${teacherData.name}!`, description: 'Tu asistencia ha sido registrada.' });
        setTeacherAttendanceCode('');
      }
    } catch (error) {
      console.error("Error registering teacher attendance:", error);
      toast({ title: 'Error', description: 'Ocurrió un error al registrar la asistencia.', variant: 'destructive' });
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

  const quickActions: QuickActionProps[] = [
    { href: "/attendance-log", icon: ClipboardEdit, label: "Log Attendance", bgColorClass: "bg-blue-500", hoverBgColorClass: "hover:bg-blue-600", textColorClass: "text-white" },
    { href: "/attendance-records", icon: BookUser, label: "View Records", bgColorClass: "bg-green-500", hoverBgColorClass: "hover:bg-green-600", textColorClass: "text-white" },
    { href: "/student-management", icon: GraduationCap, label: "Students", bgColorClass: "bg-purple-500", hoverBgColorClass: "hover:bg-purple-600", textColorClass: "text-white" },
    { href: "/group-management", icon: FolderKanban, label: "Groups", bgColorClass: "bg-yellow-400", hoverBgColorClass: "hover:bg-yellow-500", textColorClass: "text-yellow-900" },
    { href: "/grades-management", icon: ClipboardCheck, label: "Grades", bgColorClass: "bg-pink-500", hoverBgColorClass: "hover:bg-pink-600", textColorClass: "text-white" },
    { href: "/reports", icon: BarChart3, label: "Reports", bgColorClass: "bg-teal-500", hoverBgColorClass: "hover:bg-teal-600", textColorClass: "text-white" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Welcome to SERVEX</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"> {/* Adjusted for 4 columns to fit teacher attendance */}
        {renderStatCard("Total Students", totalStudents, Users, "Currently enrolled")}
        {renderStatCard("Active Groups", totalGroups, FolderKanban, "Across all programs")}
        {renderStatCard("Student Attendance Today", attendanceToday, BarChartBig, "Students marked present")}

        <Card className="col-span-1 md:col-span-2 lg:col-span-1"> {/* Teacher Attendance Card */}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Teacher Attendance
            </CardTitle>
            <CardDescription>Register your arrival.</CardDescription>
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
                  type="password" // Use password type to obscure the code
                  placeholder="Enter your attendance code"
                  value={teacherAttendanceCode}
                  onChange={(e) => setTeacherAttendanceCode(e.target.value)}
                  className="text-center"
                  disabled={isSubmittingTeacherAttendance}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmittingTeacherAttendance || !teacherAttendanceCode.trim()}>
                {isSubmittingTeacherAttendance ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Register Arrival
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Easily access common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map(action => (
              <QuickActionButton key={action.href} {...action} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
