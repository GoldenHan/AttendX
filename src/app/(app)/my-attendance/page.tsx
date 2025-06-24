
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import type { AttendanceRecord as AttendanceRecordType, Group, Session, User } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserCheck, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EnrichedAttendanceRecord {
  record: AttendanceRecordType;
  sessionInfo: {
    groupName: string;
    sessionDate: string;
  };
}

export default function MyAttendancePage() {
    const { firestoreUser, loading: authLoading } = useAuth();
    const [records, setRecords] = useState<AttendanceRecordType[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const fetchData = useCallback(async () => {
        if (!firestoreUser || authLoading) {
            setIsLoadingData(false);
            return;
        }
        if (firestoreUser.role !== 'student') {
            setIsLoadingData(false);
            return;
        }

        setIsLoadingData(true);
        try {
            const attendanceQuery = query(
                collection(db, 'attendanceRecords'),
                where('userId', '==', firestoreUser.id),
                where('institutionId', '==', firestoreUser.institutionId),
                orderBy('timestamp', 'desc')
            );
            const attendanceSnap = await getDocs(attendanceQuery);
            const fetchedRecords = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecordType));
            setRecords(fetchedRecords);
            
            if (fetchedRecords.length > 0) {
                 const sessionIds = [...new Set(fetchedRecords.map(r => r.sessionId))];
                 const sessionsQuery = query(collection(db, 'sessions'), where('__name__', 'in', sessionIds));
                 const sessionsSnap = await getDocs(sessionsQuery);
                 const fetchedSessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data()} as Session));
                 setSessions(fetchedSessions);

                 const groupIds = [...new Set(fetchedSessions.map(s => s.classId))];
                 if(groupIds.length > 0) {
                    const groupsQuery = query(collection(db, 'groups'), where('__name__', 'in', groupIds));
                    const groupsSnap = await getDocs(groupsQuery);
                    setGroups(groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));
                 }
            }
        } catch (error) {
            console.error("Error fetching attendance data:", error);
        } finally {
            setIsLoadingData(false);
        }
    }, [firestoreUser, authLoading]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const enrichedRecords: EnrichedAttendanceRecord[] = useMemo(() => {
        return records.map(record => {
            const session = sessions.find(s => s.id === record.sessionId);
            const group = groups.find(g => g.id === session?.classId);
            return {
                record,
                sessionInfo: {
                    groupName: group?.name || 'Unknown Group',
                    sessionDate: session ? `${session.date} ${session.time}` : 'Unknown Date'
                }
            }
        });
    }, [records, sessions, groups]);
    
    const attendanceSummary = useMemo(() => {
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const late = records.filter(r => r.status === 'late').length;
        const total = present + absent + late;
        const rate = total > 0 ? ((present + late) / total) * 100 : 100;
        return { present, absent, late, total, rate };
    }, [records]);


    if (authLoading || isLoadingData) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!firestoreUser || firestoreUser.role !== 'student') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Access Denied</CardTitle>
                    <CardDescription>This page is for students to view their own attendance.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
      <TooltipProvider>
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><UserCheck className="h-6 w-6 text-primary" /> Mi Resumen de Asistencia</CardTitle>
                    <CardDescription>Un resumen de tu historial general de asistencia.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                        <p className="text-sm text-green-700 dark:text-green-300">Presente</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">{attendanceSummary.present}</p>
                    </div>
                     <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">Tardanzas</p>
                        <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{attendanceSummary.late}</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                        <p className="text-sm text-red-700 dark:text-red-300">Ausencias</p>
                        <p className="text-3xl font-bold text-red-600 dark:text-red-400">{attendanceSummary.absent}</p>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                        <p className="text-sm text-blue-700 dark:text-blue-300">Tasa de Asistencia</p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{attendanceSummary.rate.toFixed(1)}%</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Historial Detallado de Asistencia</CardTitle>
                    <CardDescription>Aquí están tus registros individuales de asistencia.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha de la Sesión</TableHead>
                                <TableHead>Grupo</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Observación del Maestro</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {enrichedRecords.length > 0 ? enrichedRecords.map(({ record, sessionInfo }) => (
                                <TableRow key={record.id}>
                                    <TableCell>{sessionInfo.sessionDate}</TableCell>
                                    <TableCell>{sessionInfo.groupName}</TableCell>
                                    <TableCell>
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full ${
                                          record.status === 'present' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
                                          record.status === 'absent' ? 'bg-red-500/20 text-red-700 dark:text-red-400' :
                                          'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' 
                                        }`}>
                                          {record.status === 'present' && <CheckCircle className="h-3 w-3" />}
                                          {record.status === 'absent' && <XCircle className="h-3 w-3" />}
                                          {record.status === 'late' && <AlertCircle className="h-3 w-3" />}
                                          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                       {record.observation ? (
                                        <Tooltip>
                                            <TooltipTrigger asChild><p className="truncate max-w-xs">{record.observation}</p></TooltipTrigger>
                                            <TooltipContent><p>{record.observation}</p></TooltipContent>
                                        </Tooltip>
                                       ) : (
                                        <span className="text-muted-foreground">-</span>
                                       )}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No se han encontrado registros de asistencia para ti.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </TooltipProvider>
    );
}

