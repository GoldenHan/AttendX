
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Trash2, UserPlus, FolderKanban, Briefcase, KeyRound, MailIcon, AlertTriangle, Building } from 'lucide-react';
import type { User, Group, Sede } from '@/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, limit, addDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription as DialogPrimitiveDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from "@/components/ui/label";

const staffFormSchema = z.object({
  name: z.string().min(2, { message: "El nombre debe tener al menos 2 caracteres." }),
  username: z.string().min(3, "El nombre de usuario debe tener al menos 3 caracteres.").regex(/^[a-zA-Z0-9_.-]+$/, "El nombre de usuario solo puede contener letras, números, puntos, guiones bajos o guiones."),
  email: z.string().email({ message: "Dirección de correo electrónico inválida." }),
  phoneNumber: z.string().optional().or(z.literal('')),
  role: z.enum(['teacher', 'admin', 'caja', 'supervisor'], { required_error: "El rol es requerido." }),
  photoUrl: z.string().url({ message: "Por favor, ingresa una URL válida para la foto." }).optional().or(z.literal('')),
  assignedGroupId: z.string().optional(), // For teachers
  attendanceCode: z.string().min(4, "El código debe tener al menos 4 caracteres.").max(20, "El código no puede exceder los 20 caracteres.").optional().or(z.literal('')),
  sedeId: z.string().optional().or(z.literal('')), // For teachers, supervisors, admins
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

const UNASSIGN_VALUE_KEY = "##UNASSIGNED##";

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

export default function StaffManagementPage() {
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState<string | null>(null);
  const [isStaffFormDialogOpen, setIsStaffFormDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [isDeleteStaffDialogOpen, setIsDeleteStaffDialogOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<User | null>(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');
  const [emailCheckStatus, setEmailCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'error'>('idle');
  const [emailCheckMessage, setEmailCheckMessage] = useState<string | null>(null);
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'error'>('idle');
  const [usernameCheckMessage, setUsernameCheckMessage] = useState<string | null>(null);

  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser, firestoreUser, signUp: signUpInAuthContext } = useAuth();

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '',
    },
  });
  
  const resetFieldChecks = useCallback(() => {
    setEmailCheckStatus('idle'); setEmailCheckMessage(null);
    setUsernameCheckStatus('idle'); setUsernameCheckMessage(null);
  }, []);

  const resetEmailCheck = useCallback(() => {
    setEmailCheckStatus('idle');
    setEmailCheckMessage(null);
  }, []);

  const fetchData = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
        setIsLoading(false);
        if(firestoreUser) toast({ title: "Sin ID de Institución", description: "No se puede obtener datos del personal sin un contexto de institución.", variant: "destructive"});
        return;
    }
    setIsLoading(true);
    try {
      const usersQuery = query(collection(db, 'users'), 
        where('role', '!=', 'student'),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const usersSnapshotPromise = getDocs(usersQuery);
      
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
      const groupsSnapshotPromise = getDocs(groupsQuery);

      const sedesQuery = query(collection(db, 'sedes'), where('institutionId', '==', firestoreUser.institutionId));
      const sedesSnapshotPromise = getDocs(sedesQuery);


      const [usersSnapshot, groupsSnapshot, sedesSnapshot] = await Promise.all([
        usersSnapshotPromise,
        groupsSnapshotPromise,
        sedesSnapshotPromise,
      ]);

      const fetchedUsers = usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setStaffUsers(fetchedUsers);
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      setAllSedes(sedesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Sede)));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error al obtener datos', description: 'No se pudo cargar el personal, los grupos o las sedes de su institución.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, firestoreUser]); 

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const checkUsernameExistence = useCallback(async (username: string) => {
    if (editingStaff && editingStaff.username === username) {
      setUsernameCheckStatus('idle'); setUsernameCheckMessage(null); return;
    }
    setUsernameCheckStatus('checking'); setUsernameCheckMessage('Verificando nombre de usuario...');
    try {
      const q = query(collection(db, 'users'), 
        where('username', '==', username.trim()), 
        where('institutionId', '==', firestoreUser?.institutionId), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setUsernameCheckStatus('exists'); setUsernameCheckMessage('Este nombre de usuario ya está en uso en esta institución.');
      } else {
        setUsernameCheckStatus('not_found'); setUsernameCheckMessage('Nombre de usuario disponible.');
      }
    } catch (error) { setUsernameCheckStatus('error'); setUsernameCheckMessage('Error al verificar el nombre de usuario.'); }
  }, [editingStaff, firestoreUser?.institutionId]);

  const checkEmailExistence = useCallback(async (email: string) => {
     if (editingStaff && editingStaff.email === email) {
      setEmailCheckStatus('idle'); setEmailCheckMessage(null); return;
    }
    setEmailCheckStatus('checking'); setEmailCheckMessage(`Verificando email...`);
    try {
      const q = query(collection(db, 'users'), 
        where('email', '==', email.trim()),
        where('institutionId', '==', firestoreUser?.institutionId), 
        limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setEmailCheckStatus('exists');
        setEmailCheckMessage(`Una cuenta con este email ya existe en esta institución.`);
      } else {
        const globalEmailAuthQuery = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
        const globalAuthSnapshot = await getDocs(globalEmailAuthQuery);
        if (!globalAuthSnapshot.empty && globalAuthSnapshot.docs[0].data().institutionId !== firestoreUser?.institutionId) {
            setEmailCheckStatus('exists');
            setEmailCheckMessage(`Este email está registrado en otra institución.`);
        } else if (!globalAuthSnapshot.empty && globalAuthSnapshot.docs[0].data().institutionId === firestoreUser?.institutionId) {
             setEmailCheckStatus('exists');
             setEmailCheckMessage(`Una cuenta con este email ya existe en esta institución.`);
        } else {
            setEmailCheckStatus('not_found');
            setEmailCheckMessage(`Email disponible.`);
        }
      }
    } catch (error) {
      console.error("Error checking email existence:", error);
      setEmailCheckStatus('error');
      setEmailCheckMessage('Error al verificar el email. Por favor, inténtalo de nuevo.');
    }
  }, [editingStaff, firestoreUser?.institutionId]);

  const debouncedCheckUsername = useMemo(() => debounce(checkUsernameExistence, 700), [checkUsernameExistence]);
  const debouncedCheckEmail = useMemo(() => debounce(checkEmailExistence, 700), [checkEmailExistence]);
  
  const canAddStaff = useMemo(() => firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor', [firestoreUser]);

  const watchedUsername = form.watch('username');
  const watchedEmailValue = form.watch('email');
  const watchedRole = form.watch('role');

  useEffect(() => {
    if (!isStaffFormDialogOpen) return;

    if (watchedRole !== 'teacher') {
      form.setValue('assignedGroupId', undefined);
    }
    if (watchedRole === 'caja') {
      form.setValue('attendanceCode', '');
      form.setValue('sedeId', '');
    }
  }, [watchedRole, form, isStaffFormDialogOpen]);

  useEffect(() => {
    if (isStaffFormDialogOpen && watchedUsername && (!editingStaff || watchedUsername !== editingStaff.username)) {
        if (watchedUsername.length >= 3) debouncedCheckUsername(watchedUsername);
        else { setUsernameCheckStatus('idle'); setUsernameCheckMessage('El nombre de usuario debe tener al menos 3 caracteres.'); }
    } else if (!watchedUsername && isStaffFormDialogOpen) {
      resetFieldChecks();
    }
  }, [watchedUsername, isStaffFormDialogOpen, editingStaff, debouncedCheckUsername, resetFieldChecks]);

  useEffect(() => {
    if (isStaffFormDialogOpen && watchedEmailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmailValue)) {
        if (!editingStaff || watchedEmailValue !== editingStaff.email) {
            debouncedCheckEmail(watchedEmailValue);
        } else {
            resetEmailCheck();
        }
    } else if (!watchedEmailValue && isStaffFormDialogOpen) {
      resetEmailCheck();
    } else if (watchedEmailValue && isStaffFormDialogOpen) {
      setEmailCheckStatus('idle');
      setEmailCheckMessage('Por favor, ingresa una dirección de email válida.');
    }
  }, [watchedEmailValue, isStaffFormDialogOpen, editingStaff, debouncedCheckEmail, resetEmailCheck]);

  const displayedStaffUsers = useMemo(() => {
    if (!firestoreUser || !firestoreUser.institutionId) return [];
    
    if (firestoreUser.role === 'supervisor') {
      return staffUsers.filter(staff => 
        (staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId) ||
        staff.id === firestoreUser.id
      );
    }
    
    return staffUsers.filter(staff => staff.institutionId === firestoreUser.institutionId);
  }, [staffUsers, firestoreUser]);

  const getSedeName = useCallback((sedeId?: string | null) => {
    if (!sedeId) return 'N/A';
    const sede = allSedes.find(s => s.id === sedeId);
    return sede ? sede.name : 'Sede Desconocida';
  }, [allSedes]);
  
  const availableSedesForAssignment = useMemo(() => {
    if (!firestoreUser || !firestoreUser.institutionId) return [];
    if (firestoreUser.role === 'supervisor') {
        return allSedes.filter(s => s.id === firestoreUser.sedeId);
    }
    return allSedes;
  }, [allSedes, firestoreUser]);
  
  const availableGroupsForTeacherAssignment = useMemo(() => {
     if (!firestoreUser || !firestoreUser.institutionId) return [];
    if (firestoreUser.role === 'supervisor') {
        return allGroups.filter(g => g.sedeId === firestoreUser.sedeId);
    }
    return allGroups;
  }, [allGroups, firestoreUser]);

  if (isLoading && staffUsers.length === 0 && allGroups.length === 0 && allSedes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Gestión de Personal</CardTitle>
          <CardDescription>Gestionar cuentas de maestros, administradores, cajeros y supervisores.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Cargando personal, grupos y sedes...</p>
        </CardContent>
      </Card>
    );
  }

  if (!firestoreUser) { 
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Gestión de Personal</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Verificando rol de usuario...</p>
        </CardContent>
      </Card>
    );
  }

  if (firestoreUser.role !== 'admin' && firestoreUser.role !== 'supervisor') {
    return (
      <Card>
        <CardHeader><CardTitle>Acceso Denegado</CardTitle></CardHeader>
        <CardContent><p>No tienes permiso para gestionar el Personal.</p></CardContent>
      </Card>
    );
  }
  if (!firestoreUser.institutionId && !isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Institución no establecida</CardTitle></CardHeader>
        <CardContent><p>Tu cuenta no está asociada a una institución. Por favor, contacta a soporte.</p></CardContent>
      </Card>
    );
  }

  const handleOpenAddDialog = () => {
    setEditingStaff(null);
    const defaultValues: StaffFormValues = {
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '',
      sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '',
    };
    if (firestoreUser?.role === 'supervisor') {
      defaultValues.role = 'teacher'; 
    }
    form.reset(defaultValues);
    resetFieldChecks();
    setIsStaffFormDialogOpen(true);
  };

  const handleOpenEditDialog = (staffToEdit: User) => {
    setEditingStaff(staffToEdit);
    const currentGroupAssignment = allGroups.find(g => g.teacherId === staffToEdit.id);
    form.reset({
      name: staffToEdit.name,
      username: staffToEdit.username || '',
      email: staffToEdit.email || '',
      phoneNumber: staffToEdit.phoneNumber || '',
      role: staffToEdit.role as 'teacher' | 'admin' | 'caja' | 'supervisor',
      photoUrl: staffToEdit.photoUrl || '',
      assignedGroupId: currentGroupAssignment ? currentGroupAssignment.id : undefined,
      attendanceCode: staffToEdit.attendanceCode || '',
      sedeId: staffToEdit.sedeId || '',
    });
    resetFieldChecks();
    setIsStaffFormDialogOpen(true);
  };

  const handleStaffFormSubmit = async (data: StaffFormValues) => {
    setIsSubmitting(true);
    if (!firestoreUser?.institutionId) {
        toast({ title: "Error", description: "Tu cuenta no está vinculada a una institución.", variant: "destructive"});
        setIsSubmitting(false); return;
    }
    if (!data.email || !data.username) {
        toast({ title: 'Email y Nombre de Usuario Requeridos', description: 'Email y Nombre de Usuario son requeridos para todo el personal.', variant: 'destructive' });
        setIsSubmitting(false); return;
    }
    
    if (!editingStaff) {
        if (usernameCheckStatus === 'exists') {
            toast({ title: 'Error de Validación', description: 'El nombre de usuario ya está en uso en esta institución. Por favor, elige otro.', variant: 'destructive' });
            setIsSubmitting(false); return;
        }
        if (emailCheckStatus === 'exists') {
            toast({ title: 'Email ya existe', description: `Una cuenta con el email ${data.email} ya existe en esta institución o globalmente.`, variant: 'destructive' });
            setIsSubmitting(false); return;
        }
    }
    
    if (firestoreUser?.role === 'supervisor') {
        if (!editingStaff && data.role !== 'teacher') { 
            toast({ title: "Acción Denegada", description: "Los supervisores solo pueden agregar usuarios con el rol de 'Maestro'.", variant: "destructive" });
            setIsSubmitting(false); return;
        }
        if (data.sedeId !== firestoreUser.sedeId && (data.role === 'teacher' || data.role === 'supervisor')) {
            toast({ title: "Acción Denegada", description: `El personal debe ser asignado a tu Sede (${getSedeName(firestoreUser.sedeId)}).`, variant: "destructive" });
            setIsSubmitting(false); return;
        }
    }

    let staffMemberId: string | undefined = editingStaff?.id;
    const staffDetailsForAuthContext = {
        sedeId: (data.role === 'teacher' || data.role === 'supervisor' || data.role === 'admin') ? (data.sedeId === UNASSIGN_VALUE_KEY ? undefined : data.sedeId || undefined) : undefined,
        attendanceCode: (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor') ? data.attendanceCode : undefined,
        institutionId: firestoreUser.institutionId,
    };

    try {
      if (editingStaff) {
        const staffRef = doc(db, 'users', editingStaff.id);
        const updateData: Partial<User> = {
            name: data.name,
            phoneNumber: data.phoneNumber || null,
            role: data.role,
            photoUrl: data.photoUrl || null,
            attendanceCode: (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor') ? (data.attendanceCode || null) : null,
            sedeId: (data.role === 'teacher' || data.role === 'supervisor' || data.role === 'admin') ? (data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null) : null,
            institutionId: firestoreUser.institutionId,
        };
        await updateDoc(staffRef, updateData);
        staffMemberId = editingStaff.id;
        toast({ title: 'Usuario del Personal Actualizado', description: `El registro de ${data.name} fue actualizado exitosamente.` });

      } else { 
        await signUpInAuthContext(
            data.name,
            data.username,
            data.email,
            data.username, 
            data.role,
            undefined, 
            staffDetailsForAuthContext
        );
        const q = query(collection(db, "users"), where("email", "==", data.email), where("institutionId", "==", firestoreUser.institutionId), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            staffMemberId = querySnapshot.docs[0].id;
        } else {
             throw new Error("No se pudo recuperar el nuevo usuario del personal desde Firestore dentro de la institución.");
        }
        toast({
          title: 'Usuario del Personal Agregado',
          description: `El registro y la cuenta de Auth de ${data.name} fueron creados. Se le pedirá cambiar la contraseña (que es su nombre de usuario) en su primer inicio de sesión.`
        });
      }

      if (staffMemberId && data.role === 'teacher') {
        const newlySelectedGroupId = data.assignedGroupId === UNASSIGN_VALUE_KEY ? null : data.assignedGroupId || null;
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        const previouslyAssignedGroupId = previouslyAssignedGroup ? previouslyAssignedGroup.id : null;

        if (newlySelectedGroupId !== previouslyAssignedGroupId) {
          const batch = writeBatch(db);
          if (previouslyAssignedGroupId) {
            const oldGroupRef = doc(db, 'groups', previouslyAssignedGroupId);
            batch.update(oldGroupRef, { teacherId: null });
          }
          if (newlySelectedGroupId) {
            const newGroupRef = doc(db, 'groups', newlySelectedGroupId);
            const groupDoc = allGroups.find(g => g.id === newlySelectedGroupId);
            if(groupDoc && groupDoc.teacherId && groupDoc.teacherId !== staffMemberId) {
                 toast({
                    title: 'Reasignación de Grupo',
                    description: `El grupo ${groupDoc.name} estaba previamente asignado a otro maestro. Ahora está asignado a ${data.name}.`,
                    variant: 'default'
                });
            }
            batch.update(newGroupRef, { teacherId: staffMemberId });
          }
          await batch.commit();
        }
      } else if (staffMemberId && data.role !== 'teacher') {
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        if (previouslyAssignedGroup) {
          const groupRef = doc(db, 'groups', previouslyAssignedGroup.id);
          await updateDoc(groupRef, { teacherId: null });
        }
      }

      if (staffMemberId && data.role === 'supervisor') {
          const newSedeId = data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null;
          if (newSedeId) {
              const sedeRef = doc(db, 'sedes', newSedeId);
              const currentSedeDoc = allSedes.find(s => s.id === newSedeId);
              if (currentSedeDoc?.supervisorId !== staffMemberId) {
                 const batch = writeBatch(db);
                 batch.update(sedeRef, { supervisorId: staffMemberId });
                 const oldSedeSupervised = allSedes.find(s => s.supervisorId === staffMemberId && s.id !== newSedeId);
                 if (oldSedeSupervised) {
                     batch.update(doc(db, 'sedes', oldSedeSupervised.id), {supervisorId: null});
                 }
                 await batch.commit();
              }
          } else {
             const oldSedeSupervised = allSedes.find(s => s.supervisorId === staffMemberId);
             if (oldSedeSupervised) {
                 await updateDoc(doc(db, 'sedes', oldSedeSupervised.id), {supervisorId: null});
             }
          }
      }

      form.reset({ name: '', username:'', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '' });
      setEditingStaff(null);
      setIsStaffFormDialogOpen(false);
      resetFieldChecks();
      await fetchData();
    } catch (error: any) {
      let userMessage = editingStaff ? 'Fallo al Actualizar' : 'Fallo al Agregar';
      if (error.code === 'auth/email-already-in-use') userMessage = 'Este email ya está asociado a una cuenta de Firebase Authentication globalmente.';
      else if (error.code === 'auth/username-already-exists') userMessage = 'Este nombre de usuario ya está en uso en esta institución.';
      else if (error.code === 'auth/weak-password') userMessage = 'La contraseña es demasiado débil (debe tener al menos 6 caracteres para Firebase Auth).';
      else if (error.message) userMessage += `: ${error.message}`;
      
      toast({ title: 'Operación Fallida', description: userMessage, variant: 'destructive'});
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (staffMember: User) => {
    if (firestoreUser?.role === 'supervisor' && (staffMember.role !== 'teacher' || staffMember.sedeId !== firestoreUser.sedeId)) {
        toast({ title: "Acción Denegada", description: "Los supervisores solo pueden eliminar maestros dentro de su propia Sede.", variant: "destructive" });
        return;
    }
    if (staffMember.institutionId !== firestoreUser?.institutionId) {
        toast({ title: "Acción Denegada", description: "No se puede eliminar personal de otra institución.", variant: "destructive" });
        return;
    }
    setStaffToDelete(staffMember);
    setDeleteAdminPassword('');
    setIsDeleteStaffDialogOpen(true);
  };

  const handleSendPasswordReset = async (staffEmail: string | null | undefined, staffName: string) => {
    if (!staffEmail) {
      toast({ title: 'No se puede restablecer la contraseña', description: `El usuario ${staffName} no tiene una dirección de correo electrónico registrada.`, variant: 'destructive'});
      return;
    }
    setIsSendingResetEmail(staffEmail);
    try {
      await sendPasswordResetEmail(auth, staffEmail);
      toast({ title: 'Email de Restablecimiento de Contraseña Enviado', description: `Se ha enviado un email a ${staffEmail} para restablecer su contraseña.`});
    } catch (error: any) {
      console.error("Password reset error:", error);
      let errorMessage = "No se pudo enviar el correo de restablecimiento de contraseña.";
      if (error.code === 'auth/user-not-found') errorMessage = `No se encontró una cuenta de Firebase Authentication para ${staffEmail}. Es posible que deba agregarse primero o haya un error tipográfico.`;
      else if (error.code === 'auth/invalid-email') errorMessage = `La dirección de correo electrónico ${staffEmail} no es válida.`;
      else errorMessage = `Error: ${error.message} (Código: ${error.code})`;
      toast({ title: 'Fallo en el Restablecimiento de Contraseña', description: errorMessage, variant: 'destructive'});
    } finally {
      setIsSendingResetEmail(null);
    }
  };

  const confirmDeleteStaffUser = async () => {
    if (!staffToDelete || !authUser || !firestoreUser || staffToDelete.institutionId !== firestoreUser.institutionId) {
        toast({ title: "Error", description: "No se puede proceder con la eliminación debido a una discrepancia de permisos o datos.", variant: "destructive"});
        return;
    }
    
    const isAdminDeleting = firestoreUser.role === 'admin';
    const isSupervisorDeleting = firestoreUser.role === 'supervisor';

    if (isAdminDeleting && !deleteAdminPassword) {
      toast({ title: 'Entrada Requerida', description: 'Se requiere la contraseña de administrador para eliminar.', variant: 'destructive' });
      return;
    }
    if (isSupervisorDeleting && staffToDelete.role !== 'teacher') {
        toast({ title: "Acción Denegada", description: "Los supervisores solo pueden eliminar maestros.", variant: "destructive" });
        return;
    }
    if (isSupervisorDeleting && staffToDelete.sedeId !== firestoreUser.sedeId) {
        toast({ title: "Acción Denegada", description: "Los supervisores solo pueden eliminar maestros de su propia Sede.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    try {
      if (isAdminDeleting) {
        await reauthenticateCurrentUser(deleteAdminPassword);
      }
      
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', staffToDelete.id);
      batch.delete(userRef);

      if (staffToDelete.role === 'teacher') {
        const assignedGroup = allGroups.find(g => g.teacherId === staffToDelete.id && g.institutionId === firestoreUser.institutionId);
        if (assignedGroup) {
            const groupRef = doc(db, 'groups', assignedGroup.id);
            batch.update(groupRef, { teacherId: null });
        }
      }
      if (staffToDelete.role === 'supervisor') {
        const assignedSede = allSedes.find(s => s.supervisorId === staffToDelete.id && s.institutionId === firestoreUser.institutionId);
        if (assignedSede) {
            const sedeRef = doc(db, 'sedes', assignedSede.id);
            batch.update(sedeRef, { supervisorId: null });
        }
      }
      
      await batch.commit();

      toast({ title: 'Registro de Personal Eliminado', description: `Se eliminó el registro de Firestore de ${staffToDelete.name}. La cuenta de Firebase Auth (si existe) NO se elimina con esta acción.` });

      setStaffToDelete(null);
      setDeleteAdminPassword('');
      setIsDeleteStaffDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      let errorMessage = 'No se pudo eliminar el registro del usuario del personal.';
      const reAuthErrorCodes = ['auth/wrong-password', 'auth/invalid-credential', 'auth/user-mismatch', 'auth/requires-recent-login'];

      if (isAdminDeleting && reAuthErrorCodes.includes(error.code)) {
        errorMessage = `La reautenticación del administrador falló: ${error.message}.`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: 'Fallo al Eliminar', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEmailCheckMessageColor = () => {
    switch (emailCheckStatus) {
      case 'checking': return 'text-muted-foreground';
      case 'exists': return 'text-orange-600 dark:text-orange-400';
      case 'not_found': return 'text-green-600 dark:text-green-400';
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getUsernameCheckMessageColor = () => {
    switch (usernameCheckStatus) {
        case 'checking': return 'text-muted-foreground';
        case 'exists': return 'text-destructive';
        case 'not_found': return 'text-green-600 dark:text-green-400';
        case 'error': return 'text-destructive';
        default: return 'text-muted-foreground';
    }
  };
  
  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Gestión de Personal</CardTitle>
          <CardDescription>
            {firestoreUser?.role === 'supervisor' 
              ? "Gestionar maestros dentro de tu Sede. El personal nuevo usará su nombre de usuario como contraseña temporal."
              : "Gestionar todas las cuentas de personal de tu institución. El personal nuevo usará su nombre de usuario como contraseña temporal."
            }
          </CardDescription>
        </div>
        <div className="flex gap-2">
         {firestoreUser?.role === 'admin' && (
            <>
            <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
                <Link href="/group-management">
                <FolderKanban className="size-3.5" />
                Gestionar Grupos
                </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
                <Link href="/sede-management">
                <Building className="size-3.5" />
                Gestionar Sedes
                </Link>
            </Button>
            </>
         )}
         {canAddStaff && (
          <Dialog open={isStaffFormDialogOpen} onOpenChange={(isOpen) => {
            setIsStaffFormDialogOpen(isOpen);
            if (!isOpen) {
              setEditingStaff(null);
              form.reset({
                  name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', 
                  sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '',
              });
              resetFieldChecks();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-sm" onClick={handleOpenAddDialog}>
                <UserPlus className="size-3.5" />
                Agregar Personal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingStaff ? 'Editar Registro de Personal' : 'Agregar Nuevo Registro de Personal'}</DialogTitle>
                <DialogPrimitiveDescription>
                  {editingStaff ? "Actualizar detalles del personal." : "Completar detalles del personal. El nombre de usuario será la contraseña inicial."}
                </DialogPrimitiveDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleStaffFormSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Nombre Completo*</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="username" render={({ field }) => (
                      <FormItem><FormLabel>Nombre de Usuario (para login y contraseña inicial)*</FormLabel><FormControl><Input placeholder="janedoe_staff" {...field} disabled={!!editingStaff} /></FormControl>
                      {!editingStaff && usernameCheckMessage && (
                        <p className={`text-xs mt-1 ${getUsernameCheckMessageColor()}`}>
                            {usernameCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                            {usernameCheckMessage}
                        </p>
                      )}
                      {!!editingStaff && <p className="text-xs text-muted-foreground mt-1">El nombre de usuario no se puede cambiar.</p>}
                      <FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email (para login y reseteo de contraseña)*</FormLabel>
                          <FormControl><Input type="email" placeholder="jane.doe@example.com" {...field} disabled={!!editingStaff} /></FormControl>
                          {!!editingStaff && <p className="text-xs text-muted-foreground mt-1">El email no se puede cambiar.</p>}
                          {!editingStaff && emailCheckMessage && (<p className={`text-xs mt-1 ${getEmailCheckMessageColor()}`}>{emailCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}{emailCheckMessage}</p>)}
                          <FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                      <FormItem><FormLabel>Número de Teléfono (Opcional)</FormLabel><FormControl><Input type="tel" placeholder="e.g., 123-456-7890" {...field} /></FormControl><FormMessage /></FormItem>
                   )}/>
                  <FormField control={form.control} name="role" render={({ field }) => (
                      <FormItem><FormLabel>Rol*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value} 
                          defaultValue={field.value}
                          disabled={
                            (!!editingStaff && editingStaff.role === 'admin' && authUser?.uid === editingStaff.id && editingStaff.institutionId === firestoreUser?.institutionId) ||
                            (firestoreUser?.role === 'supervisor' && (!editingStaff || editingStaff.role !== 'teacher'))
                          }
                        >
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar un rol" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {firestoreUser?.role === 'admin' && (
                                <>
                                <SelectItem value="teacher">Maestro</SelectItem>
                                <SelectItem value="supervisor">Supervisor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="caja">Caja</SelectItem>
                                </>
                            )}
                            {firestoreUser?.role === 'supervisor' && (
                                <SelectItem value="teacher">Maestro</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {!!editingStaff && editingStaff.role === 'admin' && authUser?.uid === editingStaff.id && editingStaff.institutionId === firestoreUser?.institutionId && <p className="text-xs text-muted-foreground mt-1">Los administradores no pueden cambiar su propio rol.</p>}
                        {firestoreUser?.role === 'supervisor' && <p className="text-xs text-muted-foreground mt-1">Los supervisores solo pueden gestionar roles de 'Maestro'.</p>}
                        <FormMessage />
                      </FormItem>
                  )}/>
                   {(watchedRole === 'teacher' || watchedRole === 'supervisor' || watchedRole === 'admin') && (
                     <FormField control={form.control} name="sedeId" render={({ field }) => (
                          <FormItem><FormLabel>Asignar a Sede</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(value === UNASSIGN_VALUE_KEY ? '' : value)} 
                              value={field.value || UNASSIGN_VALUE_KEY}
                              disabled={firestoreUser?.role === 'supervisor'}
                            >
                              <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar una Sede o desasignar" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value={UNASSIGN_VALUE_KEY}>No Asignado a Sede</SelectItem>
                                {availableSedesForAssignment.map((sede) => (<SelectItem key={sede.id} value={sede.id}>{sede.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                            {firestoreUser?.role === 'supervisor' && <p className="text-xs text-muted-foreground mt-1">La Sede se establece automáticamente en tu Sede: {getSedeName(firestoreUser.sedeId)}.</p>}
                            <FormMessage />
                          </FormItem>
                     )}/>
                   )}
                  {(watchedRole === 'teacher') && ( 
                    <FormField control={form.control} name="assignedGroupId" render={({ field }) => (
                        <FormItem><FormLabel>Asignar Maestro a Grupo (Opcional)</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value === UNASSIGN_VALUE_KEY ? undefined : value);}} value={field.value || UNASSIGN_VALUE_KEY}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar un grupo o desasignar" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={UNASSIGN_VALUE_KEY}>No Asignado a Grupo</SelectItem>
                              {availableGroupsForTeacherAssignment.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                    {group.name} 
                                    ({group.studentIds?.length || 0} estudiantes)
                                    {group.teacherId && group.teacherId !== editingStaff?.id ? ` (Actualmente: ${staffUsers.find(su => su.id === group.teacherId)?.name || 'Otro'})` : (group.teacherId === editingStaff?.id ? ' (Actual)' : '')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                  )}
                  {(watchedRole === 'teacher' || watchedRole === 'admin' || watchedRole === 'supervisor') && (
                    <FormField control={form.control} name="attendanceCode" render={({ field }) => (
                        <FormItem><FormLabel>Código de Asistencia</FormLabel><FormControl><Input placeholder="e.g., TCH001" {...field} /></FormControl>
                           {field.value && field.value.includes(' ') && (<p className="text-xs text-destructive mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />El código de asistencia no debe contener espacios.</p>)}
                           <FormMessage />
                        </FormItem>
                    )}/>
                  )}
                   <FormField control={form.control} name="photoUrl" render={({ field }) => (
                      <FormItem><FormLabel>URL de Foto (Opcional)</FormLabel><FormControl><Input type="url" placeholder="https://placehold.co/100x100.png" {...field} /></FormControl><FormMessage /></FormItem>
                   )}/>
                  <DialogFooter className="pt-4">
                    <DialogClose asChild><Button type="button" variant="outline" onClick={resetFieldChecks}>Cancelar</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting || (!editingStaff && (usernameCheckStatus === 'exists' || emailCheckStatus === 'exists')) }>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingStaff ? 'Guardar Cambios' : 'Agregar Personal'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && displayedStaffUsers.length === 0 && (
             <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="ml-2 text-sm text-muted-foreground">Cargando personal...</p></div>
        )}
        <Table>
          <TableHeader><TableRow>
              <TableHead>Nombre</TableHead><TableHead>Usuario</TableHead><TableHead>Email</TableHead><TableHead>Rol</TableHead>
              <TableHead>Grupo/Sede Asignada</TableHead><TableHead>Código de Asistencia</TableHead><TableHead>Acciones</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {displayedStaffUsers.length > 0 ? displayedStaffUsers.map((staff) => {
              const assignedGroup = (staff.role === 'teacher') ? allGroups.find(g => g.teacherId === staff.id) : null;
              const staffSedeName = getSedeName(staff.sedeId);
              let assignmentDisplay = 'N/A';
              if (staff.role === 'teacher') {
                  assignmentDisplay = assignedGroup ? `${assignedGroup.name} (Grupo)` : (staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : 'No asignado');
              } else if (staff.role === 'supervisor' || staff.role === 'admin') {
                  assignmentDisplay = staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : (staff.role === 'admin' ? 'Admin Global (Sin Sede)' : 'No asignado');
              } else if (staff.role === 'caja') {
                  assignmentDisplay = staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : 'N/A (Sin Sede)';
              }
              
              const canEditThisStaff = (firestoreUser?.role === 'admin' && staff.institutionId === firestoreUser.institutionId) || 
                                     (firestoreUser?.role === 'supervisor' && staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId && staff.institutionId === firestoreUser.institutionId);
              
              const canDeleteThisStaff = (firestoreUser?.role === 'admin' && staff.id !== authUser?.uid && staff.institutionId === firestoreUser.institutionId) ||
                                       (firestoreUser?.role === 'supervisor' && staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId && staff.institutionId === firestoreUser.institutionId);

              return (
              <TableRow key={staff.id}>
                <TableCell>{staff.name}</TableCell><TableCell>{staff.username || 'N/A'}</TableCell><TableCell>{staff.email || 'N/A'}</TableCell>
                <TableCell><span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    staff.role === 'admin' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                    staff.role === 'supervisor' ? 'bg-teal-500/20 text-teal-700 dark:text-teal-400' :
                    staff.role === 'teacher' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                    staff.role === 'caja' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                    'bg-gray-500/20 text-gray-700 dark:text-gray-400'}`}>
                    {staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}</span></TableCell>
                <TableCell>{assignmentDisplay}</TableCell>
                <TableCell>{(staff.role === 'teacher' || staff.role === 'admin' || staff.role === 'supervisor') ? (staff.attendanceCode || <span className="text-muted-foreground text-xs">No establecido</span>) : 'N/A'}</TableCell>
                <TableCell className="space-x-0.5">
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleOpenEditDialog(staff)} title="Editar Usuario"
                    disabled={!canEditThisStaff}
                  ><Pencil className="h-4 w-4" /><span className="sr-only">Editar</span></Button>
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleSendPasswordReset(staff.email, staff.name)} disabled={!staff.email || isSendingResetEmail === staff.email} title={staff.email ? "Enviar Email de Restablecimiento de Contraseña" : "No se puede restablecer (sin email)"}><KeyRound className="h-4 w-4" /><span className="sr-only">Enviar Email de Restablecimiento</span></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(staff)} title="Eliminar Usuario"
                    disabled={!canDeleteThisStaff}
                  ><Trash2 className="h-4 w-4" /><span className="sr-only">Eliminar</span></Button>
                </TableCell>
              </TableRow>
            )}) : (!isLoading && (<TableRow><TableCell colSpan={7} className="text-center">
                {firestoreUser?.role === 'supervisor' && displayedStaffUsers.length === 0 ? "No se encontraron maestros en tu Sede." : "No se encontraron usuarios de personal para tu institución." }
                </TableCell></TableRow>))}
          </TableBody>
        </Table>
         {isLoading && displayedStaffUsers.length === 0 && (<div className="text-center py-4 text-sm text-muted-foreground">Cargando datos del personal...</div>)}
      </CardContent>
    </Card>

    <Dialog open={isDeleteStaffDialogOpen} onOpenChange={(isOpen) => { setIsDeleteStaffDialogOpen(isOpen); if (!isOpen) { setStaffToDelete(null); setDeleteAdminPassword('');}}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Eliminar Registro de Personal</DialogTitle>
          <DialogPrimitiveDescription>¿Estás seguro de que quieres eliminar a {staffToDelete?.name}? Esto solo elimina el registro de Firestore. La cuenta de Firebase Auth (si existe) NO se elimina con esta acción.
            {firestoreUser?.role === 'admin' && " Se requiere la contraseña de administrador."}
          </DialogPrimitiveDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            {firestoreUser?.role === 'admin' && 
                <div className="space-y-1.5"><Label htmlFor="deleteAdminPasswordStaff">Contraseña Actual del Administrador</Label><Input id="deleteAdminPasswordStaff" type="password" placeholder="Ingresa la contraseña de administrador" value={deleteAdminPassword} onChange={(e) => setDeleteAdminPassword(e.target.value)}/></div>
            }
        </div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="button" variant="destructive" onClick={confirmDeleteStaffUser} disabled={isSubmitting || (firestoreUser?.role === 'admin' && !deleteAdminPassword.trim())}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Eliminar Registro de Personal</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
