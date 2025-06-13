
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

const loginFormSchema = z.object({
  identifier: z.string().min(1, { message: "El nombre de usuario o email es requerido." }),
  password: z.string().min(1, { message: "La contraseña es requerida." }),
});

const signupFormSchema = z.object({
  name: z.string().min(2, { message: "El nombre debe tener al menos 2 caracteres." }),
  username: z.string().min(3, { message: "El nombre de usuario debe tener al menos 3 caracteres."}).regex(/^[a-zA-Z0-9_.-]+$/, "El nombre de usuario solo puede contener letras, números, puntos, guiones bajos o guiones."),
  email: z.string().email({ message: "Dirección de correo electrónico inválida." }),
  password: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
  confirmPassword: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginFormSchema>;
type SignupFormValues = z.infer<typeof signupFormSchema>;

export default function AuthPage() {
  const [view, setView] = useState<'login' | 'signup'>('login');
  const { signIn, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { name: '', username: '', email: '', password: '', confirmPassword: '' },
  });

  const handleLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', data.identifier.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      let userEmailToAuth: string | null = null;

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0].data();
        if (userDoc.email) userEmailToAuth = userDoc.email;
      } else if (data.identifier.includes('@')) {
        userEmailToAuth = data.identifier.trim();
      }

      if (!userEmailToAuth) {
        toast({ title: 'Fallo de Ingreso', description: 'Nombre de usuario o correo no encontrado.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
      await signIn(userEmailToAuth, data.password);
      toast({ title: 'Ingreso Exitoso', description: '¡Bienvenido/a de nuevo!' });
    } catch (error: any) {
      let errorMessage = 'Fallo al ingresar. Verifica tus credenciales.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Nombre de usuario o contraseña incorrectos.';
      }
      toast({ title: 'Fallo de Ingreso', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (data: SignupFormValues) => {
    setIsSubmitting(true);
    try {
      await signUp(data.name, data.username, data.email, data.password);
      toast({ title: 'Cuenta Creada', description: "Te has registrado e iniciado sesión exitosamente." });
    } catch (error: any) {
      let errorMessage = 'Fallo al crear la cuenta. Por favor, inténtalo de nuevo.';
      if (error.code === 'auth/email-already-in-use') errorMessage = 'Este correo electrónico ya está en uso.';
      else if (error.code === 'auth/weak-password') errorMessage = 'La contraseña es demasiado débil.';
      else if (error.message?.includes("Username already exists")) errorMessage = "Este nombre de usuario ya está en uso.";
      toast({ title: 'Fallo de Registro', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentLoadingState = authLoading || isSubmitting;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-xl">
        {view === 'login' ? (
          <>
            <CardHeader className="text-center">
              <div className="mb-4 flex justify-center">
                <LogIn className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-3xl font-bold">SERVEX Login</CardTitle>
              <CardDescription>Accede a tu panel de gestión.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)} className="space-y-6">
                  <FormField
                    control={loginForm.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de Usuario o Email</FormLabel>
                        <FormControl>
                          <Input placeholder="Tu nombre de usuario o email" {...field} disabled={currentLoadingState} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} disabled={currentLoadingState} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={currentLoadingState}>
                    {currentLoadingState ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Ingresar'}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex flex-col items-center text-sm">
              <p className="text-muted-foreground">¿No tienes una cuenta?</p>
              <Button variant="link" onClick={() => { setView('signup'); loginForm.reset(); signupForm.reset(); }} disabled={currentLoadingState}>
                <UserPlus className="mr-2 h-4 w-4" />
                Crear una Cuenta
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <div className="mb-4 flex justify-center">
                <UserPlus className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-3xl font-bold">Crear Cuenta SERVEX</CardTitle>
              <CardDescription>Regístrate para acceder. La primera cuenta será admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...signupForm}>
                <form onSubmit={signupForm.handleSubmit(handleSignupSubmit)} className="space-y-4">
                  <FormField control={signupForm.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Nombre Completo</FormLabel><FormControl><Input placeholder="John Doe" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField control={signupForm.control} name="username" render={({ field }) => (
                      <FormItem><FormLabel>Nombre de Usuario</FormLabel><FormControl><Input placeholder="johndoe123" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField control={signupForm.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="tu@ejemplo.com" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField control={signupForm.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>Contraseña</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <FormField control={signupForm.control} name="confirmPassword" render={({ field }) => (
                      <FormItem><FormLabel>Confirmar Contraseña</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={currentLoadingState}>
                    {currentLoadingState ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Crear Cuenta'}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex flex-col items-center text-sm">
              <p className="text-muted-foreground">¿Ya tienes una cuenta?</p>
              <Button variant="link" onClick={() => { setView('login'); loginForm.reset(); signupForm.reset(); }} disabled={currentLoadingState}>
                <LogIn className="mr-2 h-4 w-4" />
                Ingresar
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
