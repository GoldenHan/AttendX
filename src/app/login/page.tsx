
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User as UserIcon } from 'lucide-react'; // Added Mail, Lock, UserIcon
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
import { cn } from '@/lib/utils';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link'; // For Forgot Password link

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
  const [isSignUpActive, setIsSignUpActive] = useState(false);
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

  const currentLoadingState = authLoading || isSubmitting;

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary to-primary/70 p-4 font-body">
      <div
        className={cn(
          "relative h-[650px] w-full max-w-4xl overflow-hidden rounded-2xl shadow-2xl bg-card", // Increased height slightly for forgot password link
          "container" 
        )}
      >
        {/* Sign Up Form Container */}
        <div
          className={cn(
            "form-container sign-up-container absolute top-0 left-0 h-full w-1/2 opacity-0 z-10 transition-all duration-700 ease-in-out",
            isSignUpActive && "translate-x-full opacity-100 z-20 animate-show"
          )}
        >
          <Form {...signupForm}>
            <form
              onSubmit={signupForm.handleSubmit(handleSignupSubmit)}
              className="flex h-full flex-col items-center justify-center space-y-3 bg-card px-10 text-center"
            >
              <h1 className="text-3xl font-bold text-foreground mb-6">Crear Cuenta</h1>
              <FormField control={signupForm.control} name="name" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Nombre Completo</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <FormControl><Input placeholder="Nombre Completo" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={signupForm.control} name="username" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Nombre de Usuario</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <FormControl><Input placeholder="Nombre de Usuario" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={signupForm.control} name="email" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Email</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <FormControl><Input type="email" placeholder="Correo Electrónico" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={signupForm.control} name="password" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Contraseña</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <FormControl><Input type="password" placeholder="Contraseña" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={signupForm.control} name="confirmPassword" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Confirmar Contraseña</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <FormControl><Input type="password" placeholder="Confirmar Contraseña" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <Button type="submit" className="mt-4 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider" disabled={currentLoadingState}>
                {currentLoadingState && isSignUpActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Registrar'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Sign In Form Container */}
        <div
          className={cn(
            "form-container sign-in-container absolute top-0 left-0 h-full w-1/2 z-20 transition-all duration-700 ease-in-out",
             isSignUpActive && "translate-x-full opacity-0 z-10"
          )}
        >
          <Form {...loginForm}>
            <form
              onSubmit={loginForm.handleSubmit(handleLoginSubmit)}
              className="flex h-full flex-col items-center justify-center space-y-4 bg-card px-10 text-center"
            >
              <h1 className="text-3xl font-bold text-foreground mb-6">Iniciar Sesión</h1>
               <FormField
                control={loginForm.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="sr-only">Nombre de Usuario o Email</FormLabel>
                     <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <UserIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <FormControl>
                          <Input placeholder="Nombre de Usuario o Email" {...field} disabled={currentLoadingState} className="bg-input pl-10" />
                        </FormControl>
                    </div>
                    <FormMessage className="text-xs text-left"/>
                  </FormItem>
                )}
              />
              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="sr-only">Contraseña</FormLabel>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-gray-400" />
                        </div>
                        <FormControl>
                        <Input type="password" placeholder="Contraseña" {...field} disabled={currentLoadingState} className="bg-input pl-10" />
                        </FormControl>
                    </div>
                    <FormMessage className="text-xs text-left"/>
                  </FormItem>
                )}
              />
              <div className="w-full text-right mt-1">
                <Link href="#" className="text-xs text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Button type="submit" className="mt-4 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider" disabled={currentLoadingState}>
                {currentLoadingState && !isSignUpActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Ingresar'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Overlay Container */}
        <div
          className={cn(
            "overlay-container absolute top-0 left-1/2 h-full w-1/2 overflow-hidden z-50 transition-transform duration-700 ease-in-out",
            isSignUpActive ? "-translate-x-full" : "translate-x-0"
          )}
        >
          <div
            className={cn(
              "overlay relative -left-full h-full w-[200%] transform bg-primary text-primary-foreground transition-transform duration-700 ease-in-out",
              isSignUpActive ? "translate-x-1/2" : "translate-x-0"
            )}
          >
            {/* Overlay Left Panel (Prompts to Sign In) */}
            <div
              className={cn(
                "overlay-panel overlay-left absolute top-0 flex h-full w-1/2 flex-col items-center justify-center px-10 text-center transform transition-opacity duration-300 ease-in-out",
                isSignUpActive ? "opacity-100" : "opacity-0 -translate-x-[20%]"
              )}
            >
              <h1 className="text-3xl font-bold">¡Bienvenido de Nuevo!</h1>
              <p className="mt-4 text-sm font-light leading-relaxed">
                Para mantenerse conectado con nosotros, por favor inicie sesión con su información personal.
              </p>
              <Button
                variant="outline"
                className="mt-8 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary focus:bg-primary-foreground focus:text-primary"
                onClick={() => { loginForm.reset(); setIsSignUpActive(false); }}
                disabled={currentLoadingState}
              >
                Iniciar Sesión
              </Button>
            </div>

            {/* Overlay Right Panel (Prompts to Sign Up) */}
            <div
              className={cn(
                "overlay-panel overlay-right absolute top-0 right-0 flex h-full w-1/2 flex-col items-center justify-center px-10 text-center transform transition-opacity duration-300 ease-in-out",
                 isSignUpActive ? "opacity-0 translate-x-[20%]" : "opacity-100"
              )}
            >
              <h1 className="text-3xl font-bold">¡Hola!</h1>
              <p className="mt-4 text-sm font-light leading-relaxed">
                Ingrese sus datos personales y comience su viaje con nosotros.
              </p>
              <Button
                variant="outline"
                className="mt-8 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary focus:bg-primary-foreground focus:text-primary"
                onClick={() => { signupForm.reset(); setIsSignUpActive(true); }}
                disabled={currentLoadingState}
              >
                Regístrarme
              </Button>
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .animate-show {
          animation: show 0.7s;
        }
        @keyframes show {
          0%, 49.99% {
            opacity: 0;
            z-index: 10;
          }
          50%, 100% {
            opacity: 1;
            z-index: 20;
          }
        }
      `}</style>
    </div>
  );
}
